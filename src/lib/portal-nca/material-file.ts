// Trimmed from dinodreamer-public, research-browser at 926338a: app/src/materials/material-file.ts.
// Kept, otherwise unchanged: the rule decoding, the start, the playback options and the checks they need.
// Removed: the reference patch, the training record, the strength bands and the file's canonical form,
// which this site's replay does not read.

// Format-4 figure definitions are validated and their float32 weights decoded once on load.

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label} in the automaton definition`);
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${label} in the automaton definition`);
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${label} in the automaton definition`);
  return value;
}

function decodeRule(encoded: string, count: number): Float32Array {
  let binary: string;
  try { binary = atob(encoded); } catch { throw new Error("Invalid cellular model encoding in the automaton definition"); }
  if (binary.length !== count * 4) throw new Error(`The automaton definition's cellular model must have ${count} float32 values`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const values = Float32Array.from({ length: count }, (_, index) => view.getFloat32(index * 4, true));
  if (!values.every(Number.isFinite)) throw new Error("The automaton definition's cellular model values must be finite");
  return values;
}

export const FIGURE_LAYOUT = "figure-16-96-torus-v1";
/** fc1.weight [96,64], fc1.bias [96], fc2.weight [16,96]: the E1 order without the control matrix U. */
export const FIGURE_RULE_VALUES = 7776;
/**
 * The two-level pyramid: a coarse grid of side/2 cells and the fine grid, 16
 * channels each. The coarse rule's 7,776 values in the figure layout, then the fine rule's fc1.weight
 * [96,80] (inputs 0–63 its own perception, 64–79 the torus-upsampled coarse state), fc1.bias [96] and
 * fc2.weight [16,96].
 */
export const FIGURE_PYRAMID_LAYOUT = "figure-pyramid-16-96-torus-v1";
export const FIGURE_PYRAMID_RULE_VALUES = 17088;
export type FigureLayout = typeof FIGURE_LAYOUT | typeof FIGURE_PYRAMID_LAYOUT;

/**
 * The state a replay starts from. Absent or "noise": the start distribution in every cell. "centre-disc":
 * the start distribution inside a disc of `radius` cells at the grid centre, and outside it that draw
 * times `backgroundAmplitude` (0 to 1; absent or 0: zero outside). The coarse grid of a pyramid has
 * half the radius and the same amplitude.
 */
export type FigureStart = { kind: "noise" } | { kind: "centre-disc"; radius: number; backgroundAmplitude?: number };

/** Picture pixels per cell along each axis. 2 shows a 64-cell grid as a 128-pixel picture. */
export type PixelsPerCell = 1 | 2;

/** The fields of a format-4 file that the replay reads. The files keep their other fields. */
export interface FigureMaterialFile {
  format: 4;
  id: string;
  rule: { layout: FigureLayout; dtype: "float32-le"; fireRate: number; values: string };
  start?: FigureStart;
  /** Absent means one pixel per cell. At 2, the picture is the archive's bilinear upsampling of the cells. */
  picture?: { pixelsPerCell: PixelsPerCell };
  /** The replay state that was read: grid side and replay seed. */
  reading: { side: 64 | 128 | 256; seed: number };
  /**
   * Reserved playback settings. hiddenNoise is σ ≥ 0 of Gaussian noise added each tick to the
   * 13 hidden channels. Absent means 0.
   */
  playback?: { hiddenNoise: number };
}
export interface FigureMaterial { file: FigureMaterialFile; values: Float32Array }

/** The playback's hidden-channel noise σ: 0 unless the file sets it. */
export function hiddenNoise(file: FigureMaterialFile): number {
  return file.playback?.hiddenNoise ?? 0;
}

/** How a replay of this file starts and plays: the options every player passes to createFigureReplay. */
export interface FigurePlayback {
  hiddenNoise: number;
  /** Radius in cells of the seeded start's noise disc; 0 starts from noise in every cell. */
  startDisc: number;
  /** Outside the disc, the start draw times this amplitude; 0 is zero outside. */
  startBackground: number;
  pixelsPerCell: PixelsPerCell;
}
export function figurePlayback(file: FigureMaterialFile): FigurePlayback {
  return {
    hiddenNoise: hiddenNoise(file),
    startDisc: file.start?.kind === "centre-disc" ? file.start.radius : 0,
    startBackground: file.start?.kind === "centre-disc" ? file.start.backgroundAmplitude ?? 0 : 0,
    pixelsPerCell: file.picture?.pixelsPerCell ?? 1,
  };
}

function readStart(value: unknown) {
  const start = record(value, "start");
  if (start.kind === "noise") return;
  if (start.kind !== "centre-disc") throw new Error("Invalid start in the automaton definition");
  const radius = number(start.radius, "start radius");
  if (radius <= 0 || radius > 256) throw new Error("The start disc needs a positive radius of at most 256 cells");
  if (start.backgroundAmplitude === undefined) return;
  const amplitude = number(start.backgroundAmplitude, "start background amplitude");
  if (amplitude < 0 || amplitude > 1) throw new Error("The start's background amplitude must be from 0 to 1");
}

/** Validate what the replay reads of a format-4 file and decode its single-scale or pyramid weights. */
export function readFigureMaterial(value: unknown): FigureMaterial {
  const file = record(value, "top-level value");
  if (file.format !== 4) throw new Error("Unsupported automaton definition format");
  const rule = record(file.rule, "cellular model");
  if ((rule.layout !== FIGURE_LAYOUT && rule.layout !== FIGURE_PYRAMID_LAYOUT) || rule.dtype !== "float32-le") throw new Error("Unsupported cellular model shape in the automaton definition");
  const pyramid = rule.layout === FIGURE_PYRAMID_LAYOUT;
  const fireRate = number(rule.fireRate, "cell update probability");
  if (fireRate <= 0 || fireRate > 1) throw new Error("The cell update probability must be in (0, 1]");
  const reading = record(file.reading, "measurement");
  if (reading.side !== 64 && reading.side !== 128 && reading.side !== 256) throw new Error("A measurement grid has 64, 128 or 256 cells per side");
  number(reading.seed, "measurement seed");
  if (file.start !== undefined) readStart(file.start);
  const count = pyramid ? FIGURE_PYRAMID_RULE_VALUES : FIGURE_RULE_VALUES;
  return { file: file as unknown as FigureMaterialFile, values: decodeRule(text(rule.values, "cellular model values"), count) };
}
