// The rules of a figure's clock (figure-clock.ts) and of the canvases that follow it (automaton-figure.ts), as
// plain functions of plain values, so they can be checked without a page, a canvas or a graphics card.
//
// A figure's automata share one clock. The clock counts simulation steps by the time that has passed, so a screen
// that draws 120 frames a second shows what one that draws 60 shows. Every canvas steps toward the clock's count,
// so the canvases of one figure show the same step.

/** The speeds a reader can choose, in simulation steps per second. */
export const CLOCK_SPEEDS = [15, 30, 60, 120, 240, 480];

/** A figure starts at 60 steps a second (1x). */
export const CLOCK_DEFAULT_SPEED = 60;

/** The speed the labels are counted from: "1x" is 60 steps a second. */
const LABELLED_AS_ONE = 60;
const SPEED_FRACTIONS: Record<number, string> = { 0.25: "¼", 0.5: "½" };

/** "¼x", "½x", "1x", "8x". */
export function speedLabel(stepsPerSecond: number): string {
  const times = stepsPerSecond / LABELLED_AS_ONE;
  return `${SPEED_FRACTIONS[times] ?? times}x`;
}

/** Steps a figure grows before it starts again. By step 600 most canvases have settled or bleached. */
export const LOOP_STEPS = 600;

/** A figure that has grown its LOOP_STEPS holds its last picture this long, then starts again. */
export const REST_BEFORE_STARTING_AGAIN_MS = 1500;

/** The most steps one canvas takes in one frame: a canvas behind the clock catches up at this rate. */
export const MOST_STEPS_PER_FRAME = 64;

/** A frame counts for at most this long, so a hitch or a tab that was hidden is not made up in one jump. */
const MOST_FRAME_MS = 100;

/** Simulation steps the clock moves forward for a frame that took `elapsedMs`. A fraction is kept by the clock. */
export function clockAdvance(elapsedMs: number, stepsPerSecond: number): number {
  const counted = Math.min(Math.max(elapsedMs, 0), MOST_FRAME_MS);
  return (counted / 1000) * stepsPerSecond;
}

/** Steps a canvas at `canvasStep` takes in this frame toward the clock at `clockStep`. */
export function stepsToward(clockStep: number, canvasStep: number): number {
  return Math.min(Math.max(Math.floor(clockStep) - canvasStep, 0), MOST_STEPS_PER_FRAME);
}

/** Whether a looping figure has grown its LOOP_STEPS since it started, or since the reader last brushed it. */
export function hasGrownItsLoop(clockStep: number, countedFromStep: number): boolean {
  return clockStep - countedFromStep >= LOOP_STEPS;
}

/** The most canvas pixels the replay draws for one cell. */
const MOST_PIXELS_PER_CELL = 8;

/**
 * Canvas pixels per cell for a canvas shown `cssWidth` wide: the smallest whole number that gives every cell at
 * least its share of device pixels. The browser then scales the canvas down a little and smoothly, so all cells
 * look the same size. Stretching a canvas of one pixel per cell left some cells wider than others.
 */
export function pixelsPerCell(cssWidth: number, devicePixelRatio: number, cells: number): number {
  const devicePixelsPerCell = (cssWidth * devicePixelRatio) / cells;
  return Math.min(MOST_PIXELS_PER_CELL, Math.max(1, Math.ceil(devicePixelsPerCell)));
}

/** A figure has come into view at this share of its height on screen. */
const SHARE_IN_VIEW = 0.5;

/**
 * Whether a canvas has come far enough into view to start growing, so that the reader sees its start. A window
 * shorter than the canvas counts half the window: the share of the canvas it can show may never reach
 * SHARE_IN_VIEW, and the canvas must still play.
 */
export function hasComeIntoView(shareOnScreen: number, canvasHeight: number, windowHeight: number): boolean {
  const shareOfWindow = (SHARE_IN_VIEW * windowHeight) / canvasHeight;
  return shareOnScreen >= Math.min(SHARE_IN_VIEW, shareOfWindow);
}

export interface BrushDisc { x: number; y: number; radius: number }

/**
 * The stamps of one pointer movement from `from` to `to`, in cells: soft discs every quarter radius along the
 * segment, the start left out, so holding still stamps nothing.
 */
export function strokeDiscs(from: { x: number; y: number }, to: { x: number; y: number }, radius: number): BrushDisc[] {
  const spacing = Math.max(radius / 4, 1);
  const count = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / spacing);
  return Array.from({ length: count }, (_, index) => {
    const share = (index + 1) / count;
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, radius };
  });
}
