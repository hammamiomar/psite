// @ts-nocheck: type-checked in its own repository against @webgpu/types, which this site does not install.
// Copied unchanged from dinodreamer-public, research-browser at 926338a: app/src/replay/figure-replay.ts.
import type { FigureShaderSources } from "./figure-shaders";

export interface FigureRule {
  /** 7,776 float32 values in the figure layout, or 17,088 in the pyramid layout (material-file.ts). */
  values: Float32Array;
  fireRate: number;
}
export interface BrushDisc { x: number; y: number; radius: number }
export interface FigureReplayState {
  tick: number;
  /** Cell-major states, with 16 channels per cell. */
  fine: Float32Array;
  coarse?: Float32Array;
}
export interface FigureReplayOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  device?: GPUDevice;
  /** Cells per side: 128 or 256 in the product; tests use small grids. */
  side: number;
  seed: number;
  /** Resume these grids at their recorded tick, using this replay's seed and rule. */
  initialState?: FigureReplayState;
  /** Canvas pixels per cell. */
  scale?: number;
  /**
   * A canvas of this many pixels, filled with the torus repeated, instead of one grid of side × scale
   * (the home's full-width material). Absent: the canvas shows the grid once.
   */
  tiled?: CanvasSize;
  /** Reserved: σ of the hidden-channel playback noise. 0, the default, is E18's playback. */
  hiddenNoise?: number;
  /** Radius in cells of a seeded start's noise disc at the grid centre; 0, the default, starts from noise everywhere. */
  startDisc?: number;
  /** Outside a seeded start's disc, the start draw times this amplitude, 0 to 1; 0, the default, is zero outside. */
  startBackground?: number;
  /** Picture pixels per cell: 1, the default, or 2 for the archive's bilinear picture of a coarse grid. */
  pixelsPerCell?: 1 | 2;
  onDeviceLost?: (message: string) => void;
  /** Aborted when the page moves on before this start finishes; the start then releases only what it made. */
  signal?: AbortSignal;
}
export interface CanvasSize { width: number; height: number }
export interface FigureReplay {
  readonly side: number;
  /** side × pixels per cell: the width of the picture and of readPixels. */
  readonly pictureSide: number;
  readonly seed: number;
  /** Tick of the current state, including a recorded starting tick. */
  readonly tick: number;
  readonly damages: number;
  /** Start again from the seed's noise at tick 0. */
  reseed(seed: number): void;
  /** Advance the grid and draw it. */
  advance(ticks: number): Promise<void>;
  present(): Promise<void>;
  /** One brush stamp: a soft disc on the torus, in cell coordinates (figure-shaders.ts, damage). */
  damage(x: number, y: number, radius: number): Promise<void>;
  /** Several stamps in order, as one drawn stroke: one submission, one redraw. */
  stamp(discs: readonly BrushDisc[]): Promise<void>;
  setScale(scale: number): void;
  /** A new size for a tiled canvas, such as after the window was resized. */
  setTiled(size: CanvasSize): void;
  readState(): Promise<Float32Array>;
  /** The pyramid's coarse grid, [(side/2)², 16]; a cell rule has none and throws. */
  readCoarseState(): Promise<Float32Array>;
  /** pictureSide × pictureSide RGBA bytes: the picture the canvas shows. */
  readPixels(): Promise<Uint8ClampedArray<ArrayBuffer>>;
  dispose(): void;
}

/**
 * The WebGPU replay of one figure rule. This factory has no runtime imports and no
 * enclosing values, so an exported page embeds its compiled source unchanged.
 */
export async function createFigureReplay(options: FigureReplayOptions, rule: FigureRule, shaders: FigureShaderSources): Promise<FigureReplay> {
  const side = options.side;
  // Uniform records (ticks, brush stamps) at a 256-byte dynamic offset, 64 per submission.
  const RECORDS = 64;
  const TICK_STRIDE = 256;
  const unsigned = (value: number, label: string) => {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${label} must be an unsigned 32-bit integer.`);
    return value;
  };
  const checkScale = (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 8) throw new Error("Draw 1–8 pixels per cell.");
    return value;
  };
  if (!Number.isInteger(side) || side < 4 || side > 512) throw new Error("A replay grid has 4–512 cells per side.");
  // 7,776 values are a cell rule; 17,088 are the pyramid: the coarse rule's 7,776, then the fine rule's 9,312.
  const pyramid = rule.values.length === 17088;
  if ((rule.values.length !== 7776 && !pyramid) || !rule.values.every(Number.isFinite)) {
    throw new Error("A single-scale cellular model has 7,776 finite values, a two-scale one 17,088.");
  }
  if (!(rule.fireRate > 0 && rule.fireRate <= 1)) throw new Error("The cell update probability must be in (0, 1].");
  const hiddenNoise = options.hiddenNoise ?? 0;
  if (!(hiddenNoise >= 0 && Number.isFinite(hiddenNoise))) throw new Error("Hidden-channel noise must be zero or positive.");
  const startDisc = options.startDisc ?? 0;
  if (!(startDisc >= 0 && Number.isFinite(startDisc))) throw new Error("The start disc radius must be zero or positive.");
  const startBackground = options.startBackground ?? 0;
  if (!(startBackground >= 0 && startBackground <= 1)) throw new Error("The start's background amplitude must be from 0 to 1.");
  const pixelsPerCell = options.pixelsPerCell ?? 1;
  if (pixelsPerCell !== 1 && pixelsPerCell !== 2) throw new Error("A picture has 1 or 2 pixels per cell.");
  const pictureSide = side * pixelsPerCell;
  if (pyramid && (side % 2 !== 0 || pixelsPerCell !== 1 || hiddenNoise !== 0)) {
    throw new Error("The two-scale model needs an even grid, one pixel per cell and no playback noise.");
  }
  const coarseSide = side / 2;
  const initialState = options.initialState;
  if (initialState) {
    unsigned(initialState.tick, "Recorded tick");
    const checkGrid = (state: Float32Array | undefined, gridSide: number) => {
      if (!(state instanceof Float32Array) || state.length !== gridSide * gridSide * 16 || !state.every(Number.isFinite)) {
        throw new Error("A recorded grid needs 16 finite channels per cell.");
      }
    };
    checkGrid(initialState.fine, side);
    if (pyramid) checkGrid(initialState.coarse, coarseSide);
    else if (initialState.coarse !== undefined) throw new Error("A single-scale model has no coarse grid.");
  }
  // The pyramid writes two records per tick and per stamp: its coarse grid's first, then the fine grid's.
  const grids = pyramid ? 2 : 1;
  const coarseRecord = (index: number) => 2 * index * TICK_STRIDE;
  const fineRecord = (index: number) => (grids * index + grids - 1) * TICK_STRIDE;
  let seed = unsigned(options.seed, "Seed");
  let scale = checkScale(options.scale ?? 1);
  const checkTiled = (size: CanvasSize) => {
    if (![size.width, size.height].every((pixels) => Number.isInteger(pixels) && pixels >= 1 && pixels <= 8192)) {
      throw new Error("A tiled canvas is 1–8,192 pixels on each side.");
    }
    return size;
  };
  let tiled = options.tiled ? checkTiled(options.tiled) : null;
  let tick = 0;
  let damages = 0;

  // A start superseded during one of its awaits must not touch the canvas, which a newer start may own.
  const superseded = () => new DOMException("Another replay started on this canvas.", "AbortError");
  let device = options.device;
  const ownsDevice = !device;
  if (!device) {
    if (!navigator.gpu) throw new Error("This automaton replays with WebGPU, which this browser does not offer.");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter is available.");
    device = await adapter.requestDevice();
    if (options.signal?.aborted) {
      device.destroy();
      throw superseded();
    }
  }
  const gpu = device;
  let disposed = false;
  let failure: string | undefined;
  void gpu.lost.then((info) => {
    if (disposed) return;
    failure = `The replay stopped: ${info.message || info.reason}`;
    options.onDeviceLost?.(failure);
  });
  const ensureOpen = () => {
    if (disposed) throw new Error("The replay is closed.");
    if (failure) throw new Error(failure);
  };

  const buffers: GPUBuffer[] = [];
  let context: GPUCanvasContext | null | undefined;
  let configured = false;
  const allocateBuffer = (descriptor: GPUBufferDescriptor) => {
    const buffer = gpu.createBuffer(descriptor);
    buffers.push(buffer);
    return buffer;
  };
  const release = () => {
    if (disposed) return;
    disposed = true;
    buffers.forEach((buffer) => buffer.destroy());
    if (configured && context?.getConfiguration?.()?.device === gpu) context.unconfigure();
    if (ownsDevice) gpu.destroy();
  };

  try {
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const uniform = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    const stateBytes = side * side * 16 * 4;
    const states = [0, 1].map((index) => allocateBuffer({ label: `figure state ${index}`, size: stateBytes, usage: storage }));
    const ruleBuffer = allocateBuffer({ label: "figure rule", size: rule.values.byteLength, usage: storage });
    gpu.queue.writeBuffer(ruleBuffer, 0, Float32Array.from(rule.values));
    const coarseStates = pyramid
      ? [0, 1].map((index) => allocateBuffer({ label: `figure coarse state ${index}`, size: coarseSide * coarseSide * 16 * 4, usage: storage }))
      : [];
    const ticks = allocateBuffer({ label: "figure ticks", size: RECORDS * TICK_STRIDE, usage: uniform });
    const damageBuffer = allocateBuffer({ label: "figure damage", size: RECORDS * TICK_STRIDE, usage: uniform });
    const viewBuffer = allocateBuffer({ label: "figure view", size: 16, usage: uniform });
    const pixels = allocateBuffer({ label: "figure pixels", size: pictureSide * pictureSide * 4, usage: storage });

    context = options.canvas?.getContext("webgpu") as GPUCanvasContext | null | undefined;
    if (options.canvas && !context) throw new Error("The canvas cannot draw with WebGPU.");
    const ensureCurrent = () => {
      if (!options.signal?.aborted) return;
      throw superseded();
    };

    const compile = (label: string, code: string, entryPoint: string, layout: GPUPipelineLayout | "auto" = "auto") =>
      gpu.createComputePipelineAsync({ label, layout, compute: { module: gpu.createShaderModule({ label, code }), entryPoint } });
    // The per-tick record uses a dynamic offset, so these pipelines need explicit layouts.
    const tickLayout = (storageTypes: GPUBufferBindingType[], trailing: GPUBufferBindingType[] = []) => {
      const entries: GPUBindGroupLayoutEntry[] = storageTypes.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } }));
      entries.push({ binding: storageTypes.length, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 32 } });
      trailing.forEach((type, index) => entries.push({ binding: storageTypes.length + 1 + index, visibility: GPUShaderStage.COMPUTE, buffer: { type } }));
      return gpu.createBindGroupLayout({ entries });
    };
    const startLayout = tickLayout(["storage"]);
    const stepLayout = tickLayout(["read-only-storage", "read-only-storage", "storage"]);
    const fineLayout = tickLayout(["read-only-storage", "read-only-storage", "storage"], ["read-only-storage"]);
    const damageLayout = gpu.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 32 } },
    ] });
    const [startPipeline, stepPipeline, damagePipeline, packPipeline, fineStepPipeline] = await Promise.all([
      compile("figure start state", shaders.start, "start_state", gpu.createPipelineLayout({ bindGroupLayouts: [startLayout] })),
      compile("figure step", shaders.step, "step_cell", gpu.createPipelineLayout({ bindGroupLayouts: [stepLayout] })),
      compile("figure damage", shaders.damage, "damage_disc", gpu.createPipelineLayout({ bindGroupLayouts: [damageLayout] })),
      compile("figure pixels", pyramid ? shaders.pyramidPack : shaders.pack, "pack_pixels"),
      pyramid ? compile("figure fine step", shaders.fineStep, "step_fine", gpu.createPipelineLayout({ bindGroupLayouts: [fineLayout] })) : undefined,
    ]);
    ensureCurrent();
    const tickBinding = { buffer: ticks, offset: 0, size: 32 };
    // A new start always lands in state 0.
    const startGroup = (target: GPUBuffer) => gpu.createBindGroup({ layout: startLayout, entries: [
      { binding: 0, resource: { buffer: target } }, { binding: 1, resource: tickBinding }] });
    const startGroups = { fine: startGroup(states[0]), coarse: pyramid ? startGroup(coarseStates[0]) : undefined };
    const stepGroup = (pair: GPUBuffer[], index: number) => gpu.createBindGroup({ layout: stepLayout, entries: [
      { binding: 0, resource: { buffer: pair[index] } }, { binding: 1, resource: { buffer: ruleBuffer } },
      { binding: 2, resource: { buffer: pair[1 - index] } }, { binding: 3, resource: tickBinding }] });
    // The cell step runs the cell grid, or the pyramid's coarse grid with the rule's first 7,776 values.
    const stepGroups = (pyramid ? coarseStates : states).map((_, index) => stepGroup(pyramid ? coarseStates : states, index));
    // The fine step from state `index` reads the coarse grid that this tick's coarse step just wrote.
    const fineStepGroups = pyramid ? states.map((state, index) => gpu.createBindGroup({ layout: fineLayout, entries: [
      { binding: 0, resource: { buffer: state } }, { binding: 1, resource: { buffer: ruleBuffer } },
      { binding: 2, resource: { buffer: states[1 - index] } }, { binding: 3, resource: tickBinding },
      { binding: 4, resource: { buffer: coarseStates[1 - index] } }] })) : [];
    const bind = (pipeline: GPUComputePipeline | GPURenderPipeline, buffers: GPUBuffer[]) => gpu.createBindGroup({
      layout: pipeline.getBindGroupLayout(0), entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const damageGroup = (target: GPUBuffer) => gpu.createBindGroup({ layout: damageLayout, entries: [
      { binding: 0, resource: { buffer: target } }, { binding: 1, resource: { buffer: damageBuffer, offset: 0, size: 32 } }] });
    const damageGroups = states.map(damageGroup);
    const coarseDamageGroups = coarseStates.map(damageGroup);
    // Both grids step every tick, so the coarse grid's current buffer has the fine grid's index.
    const packGroups = states.map((state, index) => bind(packPipeline, pyramid ? [state, pixels, viewBuffer, coarseStates[index]] : [state, pixels, viewBuffer]));

    let presentation: GPURenderPipeline | undefined;
    let presentGroups: GPUBindGroup[] = [];
    // The view serves the canvas and readPixels, so it is written with or without a canvas.
    const resizeCanvas = () => {
      gpu.queue.writeBuffer(viewBuffer, 0, new Uint32Array([side, scale, pixelsPerCell, tiled ? 1 : 0]));
      if (!options.canvas) return;
      options.canvas.width = tiled?.width ?? side * scale;
      options.canvas.height = tiled?.height ?? side * scale;
    };
    if (options.canvas && context) {
      const format = navigator.gpu.getPreferredCanvasFormat();
      const module = gpu.createShaderModule({ label: "figure presentation", code: pyramid ? shaders.pyramidPresent : shaders.present });
      presentation = await gpu.createRenderPipelineAsync({
        label: "figure presentation", layout: "auto",
        vertex: { module, entryPoint: "vertex_main" },
        fragment: { module, entryPoint: "fragment_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      ensureCurrent();
      context.configure({ device: gpu, format, alphaMode: "opaque" });
      configured = true;
      presentGroups = states.map((state, index) => bind(presentation!, pyramid ? [state, viewBuffer, coarseStates[index]] : [state, viewBuffer]));
    }
    resizeCanvas();

    let current = 0;
    const dispatch = (encoder: GPUCommandEncoder, pipeline: GPUComputePipeline, group: GPUBindGroup, count: number, offset?: number) => {
      const pass = encoder.beginComputePass({ label: pipeline.label });
      pass.setPipeline(pipeline);
      if (offset === undefined) pass.setBindGroup(0, group);
      else pass.setBindGroup(0, group, [offset]);
      pass.dispatchWorkgroups(Math.ceil(count / 64));
      pass.end();
    };
    // Tick { side, seed, tick, fire_rate, hidden_noise, start_disc, coarse, start_background }; the coarse grid's
    // disc has half the radius and the same background amplitude.
    const tickRecords = (first: number, count: number) => {
      const data = new ArrayBuffer(count * grids * TICK_STRIDE);
      const write = (offset: number, gridSide: number, disc: number, coarse: number, tickIndex: number) => {
        new Uint32Array(data, offset, 3).set([gridSide, seed, tickIndex >>> 0]);
        new Float32Array(data, offset + 12, 3).set([rule.fireRate, hiddenNoise, disc]);
        new Uint32Array(data, offset + 24, 1).set([coarse]);
        new Float32Array(data, offset + 28, 1).set([startBackground]);
      };
      for (let index = 0; index < count; index++) {
        if (pyramid) write(coarseRecord(index), coarseSide, startDisc / 2, 1, first + index);
        write(fineRecord(index), side, startDisc, 0, first + index);
      }
      gpu.queue.writeBuffer(ticks, 0, data);
    };
    const draw = (encoder: GPUCommandEncoder) => {
      if (!presentation || !context) return;
      const pass = encoder.beginRenderPass({ label: "figure canvas", colorAttachments: [{
        view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0.5, 0.5, 0.5, 1],
      }] });
      pass.setPipeline(presentation);
      pass.setBindGroup(0, presentGroups[current]);
      pass.draw(3);
      pass.end();
    };
    const start = () => {
      tickRecords(0, 1);
      const encoder = gpu.createCommandEncoder({ label: "figure start" });
      if (startGroups.coarse) dispatch(encoder, startPipeline, startGroups.coarse, coarseSide * coarseSide * 16, coarseRecord(0));
      dispatch(encoder, startPipeline, startGroups.fine, side * side * 16, fineRecord(0));
      gpu.queue.submit([encoder.finish()]);
      current = 0;
      tick = 0;
      damages = 0;
    };
    const read = async (source: GPUBuffer, size: number) => {
      const staging = gpu.createBuffer({ label: "figure readback", size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      try {
        const encoder = gpu.createCommandEncoder();
        encoder.copyBufferToBuffer(source, 0, staging, 0, size);
        gpu.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        return staging.getMappedRange().slice(0);
      } finally { staging.destroy(); }
    };
    if (initialState) {
      gpu.queue.writeBuffer(states[0], 0, Float32Array.from(initialState.fine));
      if (initialState.coarse) gpu.queue.writeBuffer(coarseStates[0], 0, Float32Array.from(initialState.coarse));
      tick = initialState.tick;
    } else {
      start();
    }
    const stamp = async (discs: readonly BrushDisc[]) => {
      ensureOpen();
      if (!discs.every(({ x, y, radius }) => [x, y, radius].every(Number.isFinite) && radius > 0)) {
        throw new Error("A brush stamp needs a finite center and a positive radius.");
      }
      // Stamp records land between submissions, so each submission carries at most 64 of them. The
      // pyramid stamps its coarse grid too, at half the centre and radius, with the same stamp count.
      // Damage { side, seed, count, radius, centre, coarse }
      const stampsPerSubmit = RECORDS / grids;
      for (let first = 0; first < discs.length; first += stampsPerSubmit) {
        const batch = discs.slice(first, first + stampsPerSubmit);
        const data = new ArrayBuffer(batch.length * grids * TICK_STRIDE);
        const write = (offset: number, gridSide: number, x: number, y: number, radius: number, coarse: number, count: number) => {
          new Uint32Array(data, offset, 3).set([gridSide, seed, count]);
          new Float32Array(data, offset + 12, 3).set([Math.min(radius, gridSide), ((x % gridSide) + gridSide) % gridSide, ((y % gridSide) + gridSide) % gridSide]);
          new Uint32Array(data, offset + 24, 1).set([coarse]);
        };
        batch.forEach(({ x, y, radius }, index) => {
          if (pyramid) write(coarseRecord(index), coarseSide, x / 2, y / 2, radius / 2, 1, damages + index);
          write(fineRecord(index), side, x, y, radius, 0, damages + index);
        });
        gpu.queue.writeBuffer(damageBuffer, 0, data);
        damages += batch.length;
        const encoder = gpu.createCommandEncoder({ label: "figure brush" });
        batch.forEach((_, index) => {
          if (pyramid) dispatch(encoder, damagePipeline, coarseDamageGroups[current], coarseSide * coarseSide * 16, coarseRecord(index));
          dispatch(encoder, damagePipeline, damageGroups[current], side * side * 16, fineRecord(index));
        });
        if (first + stampsPerSubmit >= discs.length) draw(encoder);
        gpu.queue.submit([encoder.finish()]);
      }
      await gpu.queue.onSubmittedWorkDone();
    };

    return {
      side,
      pictureSide,
      get seed() { return seed; },
      get tick() { return tick; },
      get damages() { return damages; },
      reseed(next) {
        ensureOpen();
        seed = unsigned(next, "Seed");
        start();
      },
      async advance(count) {
        ensureOpen();
        if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error("Advance by a whole number of simulation steps.");
        // Uniform writes land between submissions, so each submission carries at most 64 tick records.
        // A pyramid tick steps the coarse grid, then the fine grid with the new coarse state.
        let remaining = count;
        do {
          const batch = Math.min(RECORDS / grids, remaining);
          if (batch > 0) tickRecords(tick, batch);
          const encoder = gpu.createCommandEncoder({ label: "figure ticks" });
          for (let index = 0; index < batch; index++) {
            if (pyramid) {
              dispatch(encoder, stepPipeline, stepGroups[current], coarseSide * coarseSide, coarseRecord(index));
              dispatch(encoder, fineStepPipeline!, fineStepGroups[current], side * side, fineRecord(index));
            } else {
              dispatch(encoder, stepPipeline, stepGroups[current], side * side, fineRecord(index));
            }
            current = 1 - current;
          }
          tick += batch;
          remaining -= batch;
          if (remaining === 0) draw(encoder);
          gpu.queue.submit([encoder.finish()]);
        } while (remaining > 0);
        await gpu.queue.onSubmittedWorkDone();
        ensureOpen();
      },
      async present() {
        ensureOpen();
        const encoder = gpu.createCommandEncoder({ label: "figure present" });
        draw(encoder);
        gpu.queue.submit([encoder.finish()]);
        await gpu.queue.onSubmittedWorkDone();
      },
      damage: (x, y, radius) => stamp([{ x, y, radius }]),
      stamp,
      setScale(next) {
        ensureOpen();
        scale = checkScale(next);
        resizeCanvas();
      },
      setTiled(size) {
        ensureOpen();
        tiled = checkTiled(size);
        resizeCanvas();
      },
      async readState() {
        ensureOpen();
        return new Float32Array(await read(states[current], stateBytes));
      },
      async readCoarseState() {
        ensureOpen();
        if (!pyramid) throw new Error("Only the two-scale model has a coarse grid.");
        return new Float32Array(await read(coarseStates[current], coarseSide * coarseSide * 16 * 4));
      },
      async readPixels() {
        ensureOpen();
        const encoder = gpu.createCommandEncoder({ label: "figure pixels" });
        dispatch(encoder, packPipeline, packGroups[current], pictureSide * pictureSide);
        gpu.queue.submit([encoder.finish()]);
        return new Uint8ClampedArray(await read(pixels, pictureSide * pictureSide * 4));
      },
      dispose() {
        if (!disposed) release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
