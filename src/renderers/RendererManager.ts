import { WebGPURenderer } from 'three/webgpu';

export const isWebGPUSupported = async (): Promise<{ supported: boolean; reason?: string }> => {
  const gpu = typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined;
  if (!gpu) {
    return {
      supported: false,
      reason: 'WebGPU API (navigator.gpu) is not supported or disabled in your browser.',
    };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason: 'No compatible WebGPU hardware adapter found on system.',
      };
    }
    return { supported: true };
  } catch (err: any) {
    return {
      supported: false,
      reason: err?.message || 'Failed to request WebGPU hardware adapter.',
    };
  }
};

export const createWebGPURenderer = async (canvas: HTMLCanvasElement) => {
  const check = await isWebGPUSupported();
  if (!check.supported) {
    throw new Error(check.reason || 'WebGPU is disabled or unavailable.');
  }

  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });

  await (renderer as any).init();

  const backend = (renderer as any).backend;
  if (backend && (backend.isWebGPUBackend === false || backend.isWebGLBackend === true)) {
    try {
      renderer.dispose();
    } catch {}
    throw new Error('WebGPU initialization failed. WebGL fallback is disabled by system policy.');
  }

  return renderer;
};


