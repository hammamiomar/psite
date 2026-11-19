// Copied unchanged from dinodreamer-public, research-browser at 926338a: app/src/replay/figure-shaders.ts.
// The figure rule as WGSL. These named strings travel unchanged with the app and
// with an exported page. figure-reference.ts states the same contract on the CPU.

const HASH = /* wgsl */ `
fn pcg(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn unit(hash: u32) -> f32 { return f32(hash >> 8u) / 16777216.0; }
const NOISE_KEY = 0x6e6f6973u;
const FIRE_KEY = 0x66697265u;
const DAMAGE_KEY = 0x64616d67u;
const HIDDEN_KEY = 0x6869646eu;
const COARSE_NOISE_KEY = 0x636e6f69u;
const COARSE_FIRE_KEY = 0x63666972u;
const COARSE_DAMAGE_KEY = 0x63646d67u;
`;

/**
 * One record per tick and grid of a submission, at a 256-byte dynamic offset. hidden_noise is σ,
 * reserved; start_disc is the seeded start's radius in this grid's cells, 0 for noise everywhere, and
 * start_background its amplitude outside the disc (the start record only); coarse is 1 for the pyramid's coarse grid, which draws from the COARSE keys.
 */
const TICK = /* wgsl */ `
struct Tick { side: u32, seed: u32, tick: u32, fire_rate: f32, hidden_noise: f32, start_disc: f32, coarse: u32, start_background: f32 }
`;

/**
 * The start value of state index `index` on a grid of `side` cells, from the stream key
 * pcg(seed ^ NOISE_KEY) (COARSE_NOISE_KEY for the pyramid's coarse grid): the start distribution, or
 * for a seeded start (radius > 0) that draw times `background` outside the disc of cells whose centres
 * lie within `radius` of the grid centre, and exactly zero there when `background` is 0. Offsets are
 * half-integers, so the disc test is exact in f32.
 */
const START = /* wgsl */ `
fn start_value(index: u32, side: u32, key: u32, radius: f32, background: f32) -> f32 {
  let value = unit(pcg(key + index)) - 0.5;
  if (radius > 0.0) {
    let cell = index / 16u;
    let offset = vec2<f32>(f32(cell % side), f32(cell / side)) - f32(side) / 2.0 + 0.5;
    if (dot(offset, offset) > radius * radius) { return select(0.0, background * value, background > 0.0); }
  }
  return value;
}`;

/** Two source cells along one axis, lower index first, and their weights. */
const AXIS = /* wgsl */ `
struct Axis { i0: u32, i1: u32, l0: f32, l1: f32 }
`;

/**
 * The pyramid's coarse state at a fine cell: upsample_torus, bilinear by 2 with wrap-around
 * (pad one coarse cell circularly, interpolate with align_corners false, crop). Along each axis, fine
 * cell j reads coarse position j/2 − 0.25: for k = ⌊j/2⌋, an even j weighs cells k − 1 and k by 0.25
 * and 0.75, an odd j cells k and k + 1 by 0.75 and 0.25, wrapped. The width weights apply inside the
 * height weights, as in torch. Needs `coarse`; `side` is the coarse side.
 */
const TORUS = /* wgsl */ `
fn torus_axis(j: u32, side: u32) -> Axis {
  let k = j / 2u;
  if (j % 2u == 0u) { return Axis((k + side - 1u) % side, k, 0.25, 0.75); }
  return Axis(k, (k + 1u) % side, 0.75, 0.25);
}
fn coarse_at(x: u32, y: u32, side: u32, channel: u32) -> f32 { return coarse[(y * side + x) * 16u + channel]; }
fn upsampled(x: u32, y: u32, side: u32, channel: u32) -> f32 {
  let h = torus_axis(y, side);
  let w = torus_axis(x, side);
  let top = coarse_at(w.i0, h.i0, side, channel) * w.l0 + coarse_at(w.i1, h.i0, side, channel) * w.l1;
  let bottom = coarse_at(w.i0, h.i1, side, channel) * w.l0 + coarse_at(w.i1, h.i1, side, channel) * w.l1;
  return top * h.l0 + bottom * h.l1;
}`;

/**
 * The step of one grid, written once for every rule. One invocation per cell: torus perception, then
 * inputs -> 96 ReLU -> 16 and the residual where the cell fires. The cell rule, and the pyramid's
 * coarse rule, read 64 inputs: per channel c, the identity, Sobel x / 8, Sobel y / 8 and the nine-point
 * Laplacian / 16 at 4c + k. The pyramid's fine rule reads 80: inputs 64–79 are the coarse state after
 * this tick's coarse step, upsampled on the torus (TORUS). Needs `state`, `next`, `grid`, the weight
 * accessors <weights>_w1, _b1, _w2 (fc1.weight, fc1.bias, fc2.weight by flat index) and
 * <weights>_fire_key, rule_fire_rate, and add_hidden_noise (HIDDEN).
 */
function stepSource(entry: string, inputs: 64 | 80, weights: "rule" | "fine"): string {
  const context = inputs === 80
    ? `
  for (var channel = 0u; channel < 16u; channel++) { perception[64u + channel] = upsampled(x, y, side / 2u, channel); }`
    : "";
  return /* wgsl */ `
@compute @workgroup_size(64)
fn ${entry}(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.x;
  let side = grid.side;
  if (cell >= side * side) { return; }
  let base = cell * 16u;
  if (unit(pcg(pcg(pcg(grid.seed ^ ${weights}_fire_key()) + grid.tick) + cell)) >= rule_fire_rate()) {
    for (var channel = 0u; channel < 16u; channel++) { next[base + channel] = state[base + channel]; }
    add_hidden_noise(base);
    return;
  }
  let x = cell % side;
  let y = cell / side;
  let left = (x + side - 1u) % side;
  let right = (x + 1u) % side;
  let up = ((y + side - 1u) % side) * side;
  let row = y * side;
  let down = ((y + 1u) % side) * side;
  var perception: array<f32, ${inputs}>;
  for (var channel = 0u; channel < 16u; channel++) {
    let nw = state[(up + left) * 16u + channel];
    let n = state[(up + x) * 16u + channel];
    let ne = state[(up + right) * 16u + channel];
    let w = state[(row + left) * 16u + channel];
    let centre = state[base + channel];
    let e = state[(row + right) * 16u + channel];
    let sw = state[(down + left) * 16u + channel];
    let s = state[(down + x) * 16u + channel];
    let se = state[(down + right) * 16u + channel];
    perception[channel * 4u] = centre;
    perception[channel * 4u + 1u] = ((ne + 2.0 * e + se) - (nw + 2.0 * w + sw)) / 8.0;
    perception[channel * 4u + 2u] = ((sw + 2.0 * s + se) - (nw + 2.0 * n + ne)) / 8.0;
    perception[channel * 4u + 3u] = ((nw + 2.0 * n + ne + 2.0 * w + 2.0 * e + sw + 2.0 * s + se) - 12.0 * centre) / 16.0;
  }${context}
  var delta: array<f32, 16>;
  for (var unit_index = 0u; unit_index < 96u; unit_index++) {
    var hidden = ${weights}_b1(unit_index);
    for (var input = 0u; input < ${inputs}u; input++) { hidden += ${weights}_w1(unit_index * ${inputs}u + input) * perception[input]; }
    if (hidden > 0.0) {
      for (var channel = 0u; channel < 16u; channel++) { delta[channel] += ${weights}_w2(channel * 96u + unit_index) * hidden; }
    }
  }
  for (var channel = 0u; channel < 16u; channel++) { next[base + channel] = state[base + channel] + delta[channel]; }
  add_hidden_noise(base);
}`;
}

/**
 * Reserved playback noise: σ·N(0, 1) on channels 3–15 of every cell, from a Box–Muller pair of hashes
 * per value. Off at σ = 0, so the update stays exactly E18's. The pyramid refuses σ > 0.
 */
const HIDDEN = /* wgsl */ `
fn add_hidden_noise(base: u32) {
  let sigma = playback_hidden_noise();
  if (sigma <= 0.0) { return; }
  let key = pcg(pcg(grid.seed ^ HIDDEN_KEY) + grid.tick);
  for (var channel = 3u; channel < 16u; channel++) {
    let index = 2u * (base + channel);
    let radius = sqrt(-2.0 * log(1.0 - unit(pcg(key + index))));
    next[base + channel] += sigma * radius * cos(6.283185307 * unit(pcg(key + index + 1u)));
  }
}`;

const STEP_CELL = stepSource("step_cell", 64, "rule");
const STEP_FINE = stepSource("step_fine", 80, "fine");

/** Offsets into the pyramid's 17,088 values: the coarse rule's 7,776, then fine fc1.weight [96,80], fc1.bias [96], fc2.weight [16,96]. */
const PYRAMID_FINE = { w1: 7776, b1: 15456, w2: 15552 };

/**
 * Grid side in cells, canvas pixels per cell, picture pixels per cell (1 or 2), and whether the
 * canvas repeats the torus (1) or shows it once (0).
 */
const VIEW = /* wgsl */ `
struct View { side: u32, scale: u32, pixels: u32, tiled: u32 }
`;

/**
 * The cell rule's picture, from `state` and `view`. A cell's colour is clamp(x + 0.5, 0, 1) for R, G
 * and B. At 2 pixels per cell the picture is the archive's bilinear upsampling (torch F.interpolate,
 * align_corners false), in torch's order of operations: along each axis the source is
 * max((q + 0.5) / 2 - 0.5, 0), i1 = min(i0 + 1, side - 1), and the width weights apply inside the
 * height weights.
 */
const CELL_PICTURE = /* wgsl */ `
fn cell_rgb(x: u32, y: u32) -> vec3<f32> {
  let base = (y * view.side + x) * 16u;
  return clamp(vec3<f32>(state[base], state[base + 1u], state[base + 2u]) + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
}
fn picture_axis(q: u32) -> Axis {
  let source = max((f32(q) + 0.5) / f32(view.pixels) - 0.5, 0.0);
  let i0 = u32(source);
  let l1 = source - f32(i0);
  return Axis(i0, min(i0 + 1u, view.side - 1u), 1.0 - l1, l1);
}
fn picture_rgb(x: u32, y: u32) -> vec3<f32> {
  if (view.pixels == 1u) { return cell_rgb(x, y); }
  let h = picture_axis(y);
  let w = picture_axis(x);
  let top = cell_rgb(w.i0, h.i0) * w.l0 + cell_rgb(w.i1, h.i0) * w.l1;
  let bottom = cell_rgb(w.i0, h.i1) * w.l0 + cell_rgb(w.i1, h.i1) * w.l1;
  return top * h.l0 + bottom * h.l1;
}`;

/** The pyramid's picture, one pixel per fine cell: clamp(upsample_torus(coarse RGB) + fine RGB + 0.5, 0, 1), as PyramidRule.picture. */
const PYRAMID_PICTURE = /* wgsl */ `
fn picture_rgb(x: u32, y: u32) -> vec3<f32> {
  let base = (y * view.side + x) * 16u;
  let fine = vec3<f32>(state[base], state[base + 1u], state[base + 2u]);
  let side = view.side / 2u;
  let up = vec3<f32>(upsampled(x, y, side, 0u), upsampled(x, y, side, 1u), upsampled(x, y, side, 2u));
  return clamp(up + fine + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
}`;

/** Bytes round half to even, as torch.round. */
const ROUND = /* wgsl */ `
fn round_byte(value: vec3<f32>) -> vec3<f32> {
  let scaled = value * 255.0;
  let lower = floor(scaled);
  let fraction = scaled - lower;
  let even = lower + (lower - 2.0 * floor(lower / 2.0));
  return select(select(even, lower + 1.0, fraction > vec3<f32>(0.5)), lower, fraction < vec3<f32>(0.5));
}`;

/** One RGBA byte quadruple per picture pixel. The pyramid binds its coarse grid at binding 3. */
function packSource(pyramid: boolean): string {
  return /* wgsl */ `${VIEW}${AXIS}
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(1) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(2) var<uniform> view: View;
${pyramid ? `@group(0) @binding(3) var<storage, read> coarse: array<f32>;${TORUS}${PYRAMID_PICTURE}` : CELL_PICTURE}${ROUND}
@compute @workgroup_size(64)
fn pack_pixels(@builtin(global_invocation_id) id: vec3<u32>) {
  let pixel = id.x;
  let side = view.side * view.pixels;
  if (pixel >= side * side) { return; }
  let bytes = vec3<u32>(round_byte(picture_rgb(pixel % side, pixel / side)));
  pixels[pixel] = bytes.r | (bytes.g << 8u) | (bytes.b << 16u) | (255u << 24u);
}`;
}

/**
 * The canvas shows the picture at view.scale / view.pixels canvas pixels per picture pixel, the same
 * bytes as pack. A tiled canvas is larger than one picture and wraps, because the grid is a torus.
 */
function presentSource(pyramid: boolean): string {
  return /* wgsl */ `${VIEW}${AXIS}
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(1) var<uniform> view: View;
${pyramid ? `@group(0) @binding(2) var<storage, read> coarse: array<f32>;${TORUS}${PYRAMID_PICTURE}` : CELL_PICTURE}${ROUND}
@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}
@fragment
fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let picture = view.side * view.pixels;
  let at = vec2<u32>(position.xy) * view.pixels / view.scale;
  let pixel = select(min(at, vec2<u32>(picture - 1u)), at % vec2<u32>(picture), view.tiled == 1u);
  return vec4<f32>(round_byte(picture_rgb(pixel.x, pixel.y)), 255.0) / 255.0;
}`;
}

/**
 * The pieces the embedded-rule export (embedded-rule-shader.ts) shares word for word: the hash, the start value, the
 * steps, the playback noise and the pyramid's torus upsampling.
 */
export const FIGURE_WGSL = { hash: HASH, start: START, step: STEP_CELL, fineStep: STEP_FINE, hidden: HIDDEN, torus: `${AXIS}${TORUS}`, pyramidFine: PYRAMID_FINE };

const STEP_BINDINGS = /* wgsl */ `
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(1) var<storage, read> rule: array<f32>;
@group(0) @binding(2) var<storage, read_write> next: array<f32>;
@group(0) @binding(3) var<uniform> grid: Tick;
fn rule_fire_rate() -> f32 { return grid.fire_rate; }
fn playback_hidden_noise() -> f32 { return grid.hidden_noise; }`;

export const FIGURE_SHADERS = {
  start: /* wgsl */ `${HASH}${TICK}${START}
@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<uniform> grid: Tick;
@compute @workgroup_size(64)
fn start_state(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= grid.side * grid.side * 16u) { return; }
  let key = pcg(grid.seed ^ select(NOISE_KEY, COARSE_NOISE_KEY, grid.coarse == 1u));
  state[index] = start_value(index, grid.side, key, grid.start_disc, grid.start_background);
}`,

  // The cell rule, and the pyramid's coarse rule (its first 7,776 values; grid.coarse = 1).
  // The rule is read through accessors, so the embedded-rule export shares this step word for word.
  step: /* wgsl */ `${HASH}${TICK}${STEP_BINDINGS}
fn rule_w1(index: u32) -> f32 { return rule[index]; }
fn rule_b1(index: u32) -> f32 { return rule[6144u + index]; }
fn rule_w2(index: u32) -> f32 { return rule[6240u + index]; }
fn rule_fire_key() -> u32 { return select(FIRE_KEY, COARSE_FIRE_KEY, grid.coarse == 1u); }
${STEP_CELL}
${HIDDEN}`,

  // The pyramid's fine rule, after the coarse step of the same tick: it reads the new coarse grid.
  fineStep: /* wgsl */ `${HASH}${TICK}${AXIS}${STEP_BINDINGS}
@group(0) @binding(4) var<storage, read> coarse: array<f32>;
fn fine_w1(index: u32) -> f32 { return rule[${PYRAMID_FINE.w1}u + index]; }
fn fine_b1(index: u32) -> f32 { return rule[${PYRAMID_FINE.b1}u + index]; }
fn fine_w2(index: u32) -> f32 { return rule[${PYRAMID_FINE.w2}u + index]; }
fn fine_fire_key() -> u32 { return FIRE_KEY; }
${TORUS}
${STEP_FINE}
${HIDDEN}`,

  // The brush: inside a soft disc on the torus, the 13 hidden channels move toward fresh start
  // values and R, G and B toward one shared grey value per cell (0.2 × that cell's red start value),
  // so the brushed cells show quiet grey static. Keyed by the stamp count; a smoothstep edge a
  // quarter of the radius wide blends the write in. The pyramid stamps its coarse grid too, at half
  // the centre and radius, from the coarse damage stream.
  damage: /* wgsl */ `${HASH}
struct Damage { side: u32, seed: u32, count: u32, radius: f32, centre: vec2<f32>, coarse: u32, padding: u32 }
@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<uniform> damage: Damage;
@compute @workgroup_size(64)
fn damage_disc(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  let side = damage.side;
  if (index >= side * side * 16u) { return; }
  let cell = index / 16u;
  var offset = abs(vec2<f32>(f32(cell % side), f32(cell / side)) - damage.centre);
  offset = min(offset, vec2<f32>(f32(side)) - offset);
  let t = clamp((damage.radius - length(offset)) / max(damage.radius / 4.0, 1.0), 0.0, 1.0);
  let weight = t * t * (3.0 - 2.0 * t);
  if (weight <= 0.0) { return; }
  let key = pcg(pcg(damage.seed ^ select(DAMAGE_KEY, COARSE_DAMAGE_KEY, damage.coarse == 1u)) + damage.count);
  let channel = index % 16u;
  var goal = unit(pcg(key + index)) - 0.5;
  if (channel < 3u) { goal = 0.2 * (unit(pcg(key + cell * 16u)) - 0.5); }
  state[index] = state[index] + weight * (goal - state[index]);
}`,

  pack: packSource(false),
  present: presentSource(false),
  pyramidPack: packSource(true),
  pyramidPresent: presentSource(true),
};

export type FigureShaderSources = typeof FIGURE_SHADERS;
