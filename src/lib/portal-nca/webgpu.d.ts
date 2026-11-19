// The WebGPU names this site's own code uses. figure-replay.ts is checked against the complete
// @webgpu/types in its own repository; this site has no other WebGPU code and does not install them.

interface GPUDevice {
  readonly lost: Promise<{ message: string; reason: string }>;
}
interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}
interface Navigator {
  readonly gpu?: { requestAdapter(): Promise<GPUAdapter | null> };
}
