// One WebGPU device for every live canvas of the page: the automata of the figures (automaton-figure.ts) and the
// opening automaton (opening-automaton.ts).

/** The device, once asked for. Null: this browser has no usable WebGPU. */
let sharedDevice: Promise<GPUDevice | null> | undefined;

export function requestSharedDevice(): Promise<GPUDevice | null> {
  sharedDevice ??= openDevice();
  return sharedDevice;
}

async function openDevice(): Promise<GPUDevice | null> {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  // A lost device cannot come back. The next canvas to open asks for a new one.
  void device.lost.then(() => { sharedDevice = undefined; });
  return device;
}

/** What a canvas says where WebGPU is missing. */
export const NO_WEBGPU_NOTE = "This browser has no WebGPU, so these are still frames. Chrome, Edge and Safari 26 run them live.";
