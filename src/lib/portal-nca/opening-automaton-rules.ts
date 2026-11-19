// The rules of the essay's opening automaton (opening-automaton.ts), as plain functions of plain values, so they
// can be checked without a page, a canvas or a graphics card.
//
// The opening is one grid of cells in a field as wide as the window. The grid is a torus, so a field larger than
// the grid shows it repeated. After a rule's steps the cells keep their state and take the rule of another basis
// group. The groups come in a random order, new at every visit and every round. A rule has one grid, or two: a
// coarse grid of half the side under the fine one.

/** Cells along one side of the grid in a wide window. One grid then covers the window's width with no repeat. */
export const WIDE_FIELD_SIDE = 256;

/** Cells along one side in a narrow window, a phone: a quarter of the cells, for a quarter of the work. */
export const NARROW_FIELD_SIDE = 128;

/** A field narrower than this many CSS pixels is a narrow one. */
const NARROW_FIELD_BELOW = 760;

/** Cells along one side of the grid for a field `fieldWidth` CSS pixels wide. */
export function gridSide(fieldWidth: number): number {
  return fieldWidth < NARROW_FIELD_BELOW ? NARROW_FIELD_SIDE : WIDE_FIELD_SIDE;
}

/** Simulation steps a second: the speed the essay's figures call 1x. */
export const STEPS_PER_SECOND = 60;

/** Steps the cells grow under a rule whose file does not say at which step it was read: ten seconds. */
export const DEFAULT_STEPS_UNDER_A_RULE = 600;

/**
 * Whether the cells have grown long enough under their rule to take the next one. A rule's steps are the step
 * its file was read at, which is the step its picture was judged at.
 */
export function isDueForNextRule(step: number, ruleStartedAtStep: number, stepsUnderRule: number): boolean {
  return step - ruleStartedAtStep >= stepsUnderRule;
}

/**
 * The rules of a list of `count`, each once, in a random order (Fisher and Yates). `random` gives a number from 0
 * up to but not 1, as Math.random does.
 */
export function shuffledOrder(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let last = count - 1; last > 0; last--) {
    const chosen = Math.floor(random() * (last + 1));
    [order[last], order[chosen]] = [order[chosen], order[last]];
  }
  return order;
}

/**
 * A random order for the next round, which does not begin with the rule the cells have now: a round that ended
 * on a rule and began with it again would show no change.
 */
export function nextRoundOrder(count: number, current: number, random: () => number): number[] {
  const order = shuffledOrder(count, random);
  if (count > 1 && order[0] === current) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** The most steps the field takes in one frame. */
export const MOST_STEPS_PER_FRAME = 4;

/**
 * Steps the field at `canvasStep` takes in this frame toward the clock at `clockStep`. A graphics card too slow
 * for 60 steps a second shows slower growth: the field never runs many steps in one frame to catch up.
 */
export function stepsThisFrame(clockStep: number, canvasStep: number): number {
  return Math.min(Math.max(Math.floor(clockStep) - canvasStep, 0), MOST_STEPS_PER_FRAME);
}

/** The clock for the next frame: what it counted, less any steps the field could not take in this one. */
export function clockWithoutBacklog(clockStep: number, canvasStep: number): number {
  return Math.min(clockStep, canvasStep + MOST_STEPS_PER_FRAME);
}

/** The most canvas pixels the replay draws for one cell (figure-replay.ts). */
const MOST_PIXELS_PER_CELL = 8;

export interface FieldCanvas {
  /** The canvas's size in its own pixels: one for each CSS pixel of the field. */
  width: number;
  height: number;
  /** Whole canvas pixels along one side of a cell. */
  pixelsPerCell: number;
}

/**
 * The canvas of a field `width` by `height` CSS pixels over a grid of `side` cells. A cell takes the fewest whole
 * pixels with which one grid covers the field's longer side, so the reader sees each cell once. The replay draws
 * at most MOST_PIXELS_PER_CELL; a field larger than that allows shows the grid repeated.
 */
export function fieldCanvas(width: number, height: number, side: number): FieldCanvas {
  const pixelsPerCell = Math.min(MOST_PIXELS_PER_CELL, Math.max(1, Math.ceil(Math.max(width, height) / side)));
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), pixelsPerCell };
}

/** The values a cell holds. The first three are its colour. */
const CHANNELS = 16;
const COLOUR_CHANNELS = 3;

/** The cells of a field: 16 values a cell, row by row. A two-grid rule also has a coarse grid of half the side. */
export interface FieldCells {
  /** The simulation step the cells are at. */
  tick: number;
  fine: Float32Array;
  coarse?: Float32Array;
}

/**
 * The two coarse cells that a fine cell `j` reads along one axis, with their weights: the replay's bilinear
 * upsampling by two on the torus (figure-shaders.ts, torus_axis). For k = floor(j / 2), an even j weighs cells
 * k - 1 and k by 0.25 and 0.75, an odd j cells k and k + 1 by 0.75 and 0.25, wrapped.
 */
function coarseCellsAt(j: number, coarseSide: number): { i0: number; i1: number; w0: number; w1: number } {
  const k = j >> 1;
  if (j % 2 === 0) return { i0: (k + coarseSide - 1) % coarseSide, i1: k, w0: 0.25, w1: 0.75 };
  return { i0: k, i1: (k + 1) % coarseSide, w0: 0.75, w1: 0.25 };
}

/**
 * The cells as a rule with one grid or two takes them, showing the same picture as before.
 *
 * A two-grid picture is the fine grid's colour plus the coarse grid's colour upsampled. So for a one-grid rule
 * the upsampled coarse colour is added to the fine colour and the coarse grid is dropped, and for a two-grid
 * rule a missing coarse grid is all zeros. Cells that already fit the rule are returned as they are.
 */
export function cellsForRule(cells: FieldCells, side: number, twoGrids: boolean): FieldCells {
  if (twoGrids) {
    if (cells.coarse) return cells;
    return { ...cells, coarse: new Float32Array((side / 2) * (side / 2) * CHANNELS) };
  }
  if (!cells.coarse) return cells;
  const coarseSide = side / 2;
  const coarse = cells.coarse;
  const fine = Float32Array.from(cells.fine);
  for (let y = 0; y < side; y++) {
    const rows = coarseCellsAt(y, coarseSide);
    for (let x = 0; x < side; x++) {
      const columns = coarseCellsAt(x, coarseSide);
      const cell = (y * side + x) * CHANNELS;
      for (let channel = 0; channel < COLOUR_CHANNELS; channel++) {
        const at = (row: number, column: number) => coarse[(row * coarseSide + column) * CHANNELS + channel];
        const top = at(rows.i0, columns.i0) * columns.w0 + at(rows.i0, columns.i1) * columns.w1;
        const bottom = at(rows.i1, columns.i0) * columns.w0 + at(rows.i1, columns.i1) * columns.w1;
        fine[cell + channel] += top * rows.w0 + bottom * rows.w1;
      }
    }
  }
  return { tick: cells.tick, fine };
}

/**
 * The field's picture is read this often, in steps, to see whether it has gone flat: once a second. A rule that
 * fails on another rule's cells goes flat within a second or two, so the field starts again about two seconds
 * after such a change.
 */
export const FLATNESS_CHECK_EVERY_STEPS = 60;

/** A picture whose spread is below this is flat: one colour, such as black, with nothing left to grow from. */
const FLAT_BELOW = 0.02;

/**
 * The spread of a picture of RGBA bytes: the standard deviation of each colour channel over the pixels, on a
 * scale of 0 to 1, averaged over the three channels.
 */
export function pictureSpread(pixels: Uint8ClampedArray): number {
  const count = pixels.length / 4;
  let spread = 0;
  for (let channel = 0; channel < COLOUR_CHANNELS; channel++) {
    let sum = 0;
    let squares = 0;
    for (let pixel = 0; pixel < count; pixel++) {
      const value = pixels[pixel * 4 + channel] / 255;
      sum += value;
      squares += value * value;
    }
    const mean = sum / count;
    spread += Math.sqrt(Math.max(squares / count - mean * mean, 0));
  }
  return spread / COLOUR_CHANNELS;
}

/**
 * Whether the field has to start again from noise: its picture was flat at two checks in a row. A rule can fail
 * to grow from another rule's cells and leave one colour. One flat reading is not enough, because a field can be
 * one colour for a moment while it changes.
 */
export function shouldStartAgainFromNoise(spreadAtLastCheck: number | null, spreadNow: number): boolean {
  return spreadAtLastCheck !== null && spreadAtLastCheck < FLAT_BELOW && spreadNow < FLAT_BELOW;
}
