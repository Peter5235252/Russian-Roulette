export interface GpuDetectionResult {
  isDetected: boolean;
  gpuName: string;
  vendor: string;
  architecture: string;
  isLowEndOrIntegrated: boolean;
  isIntegrated: boolean;
  isFallback: boolean;
  isWebGPU: boolean;
  reason: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const LOW_END_PATTERNS = [
  // Fallback / Software
  /swiftshader/i,
  /llvmpipe/i,
  /softpipe/i,
  /software/i,
  /warp/i,
  /basic render/i,
  /microsoft basic/i,

  // Intel integrated
  /intel.*(?:hd|uhd|iris|gma|graphics|plus|xe)/i,
  /intel\s+corporation/i,
  /intel\s+inc/i,
  /hd graphics/i,
  /uhd graphics/i,
  /iris xe/i,
  /iris plus/i,
  /iris pro/i,
  /iris\(r\)/i,
  /intel\(r\)/i,

  // AMD integrated
  /radeon\s+(?:vega|graphics|\(tm\)\s+graphics|r[2-5]|6[1-8]0m|7[4-8]0m|8[89]0m)/i,
  /amd\s+custom\s+gpu/i,
  /picasso/i,
  /renoir/i,
  /cezanne/i,
  /barcelo/i,
  /rembrandt/i,
  /phoenix/i,
  /mendocino/i,
  /hawk point/i,
  /strix point/i,
  /lucine/i,

  // Mobile / Embedded / Low-power ARM
  /mali(?:-t|-g\d{1,2}|-400|-450)/i,
  /adreno\s*(?:[2-6]\d{2}|702|710)/i,
  /powervr/i,
  /apple a\d+/i,
  /videocore/i,
  /vivante/i,

  // Low-end legacy discrete
  /geforce\s+(?:gt\s*[2-7]\d{2}|gt\s*1030|mx\d{3}|9[1-4]0m|8[1-4]0m)/i,
  /radeon\s+(?:r5\s*\d+|r7\s*2\d+|rx\s*550|rx\s*540|rx\s*6400)/i,
];

const INTEGRATED_KEYWORDS = [
  'intel',
  'iris',
  'uhd',
  'hd graphics',
  'integrated',
  'mali',
  'adreno',
  'powervr',
  'vega 3',
  'vega 6',
  'vega 7',
  'vega 8',
  'vega 10',
  'vega 11',
  '680m',
  '780m',
  '890m',
  'apu',
];

export async function detectGpuHardware(): Promise<GpuDetectionResult> {
  let gpuName = 'Generic GPU Adapter';
  let vendor = 'Unknown';
  let architecture = 'Unknown';
  let isFallback = false;
  let isIntegrated = false;
  let isLowEnd = false;
  let isWebGPU = false;
  let reason = '';

  const deviceMemory = typeof navigator !== 'undefined' && 'deviceMemory' in navigator 
    ? (navigator as any).deviceMemory 
    : undefined;
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;

  // 1. Primary inspection via WebGPU adapter info
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        isWebGPU = true;
        
        // Inspect adapter info
        let info: any = adapter.info;
        if (!info && typeof (adapter as any).requestAdapterInfo === 'function') {
          try {
            info = await (adapter as any).requestAdapterInfo();
          } catch (e) {}
        }

        if (info) {
          vendor = info.vendor || vendor;
          architecture = info.architecture || architecture;
          const desc = info.description || info.device || '';
          gpuName = [info.vendor, info.architecture, desc].filter(Boolean).join(' ') || gpuName;
          
          if (info.isFallbackAdapter || (adapter as any).isFallbackAdapter) {
            isFallback = true;
          }
        }

        // Check WebGPU hardware limits for low-budget adapters
        const limits = adapter.limits;
        if (limits) {
          // Standard modern desktop discrete GPUs support 1GB - 2GB+ max storage buffers
          // Low-end / mobile / integrated often limit to 128MB or 256MB
          if (limits.maxStorageBufferBindingSize && limits.maxStorageBufferBindingSize <= 134217728) {
            isLowEnd = true;
            reason = 'Limited WebGPU buffer binding capacity (≤128MB)';
          }
        }
      }
    } catch (err) {
      console.warn('[HardwareDetector] WebGPU inspection notice:', err);
    }
  }

  // 2. Fallback / supplementary inspection via WebGL unmasked renderer
  if (gpuName === 'Generic GPU Adapter' || vendor === 'Unknown') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          const unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          if (unmaskedRenderer) gpuName = unmaskedRenderer;
          if (unmaskedVendor) vendor = unmaskedVendor;
        }
      }
    } catch (e) {}
  }

  const combinedString = `${gpuName} ${vendor} ${architecture}`.toLowerCase();

  // 3. Classify based on signature patterns
  if (isFallback || /swiftshader|llvmpipe|warp|microsoft basic/i.test(combinedString)) {
    isFallback = true;
    isLowEnd = true;
    reason = 'Software / CPU-emulated fallback adapter detected';
  } else {
    for (const pattern of LOW_END_PATTERNS) {
      if (pattern.test(combinedString)) {
        isLowEnd = true;
        break;
      }
    }

    for (const kw of INTEGRATED_KEYWORDS) {
      if (combinedString.includes(kw)) {
        isIntegrated = true;
        isLowEnd = true;
        break;
      }
    }
  }

  // 4. Memory / core constraint heuristic
  if (!isLowEnd) {
    if (deviceMemory !== undefined && deviceMemory <= 4) {
      isLowEnd = true;
      reason = reason || `System RAM limited (≤${deviceMemory}GB)`;
    } else if (hardwareConcurrency !== undefined && hardwareConcurrency <= 4) {
      isLowEnd = true;
      reason = reason || `Host CPU threads limited (${hardwareConcurrency} cores)`;
    }
  }

  if (isLowEnd && !reason) {
    if (isIntegrated) {
      reason = 'Integrated GPU architecture detected';
    } else {
      reason = 'Entry-level or power-constrained GPU detected';
    }
  }

  return {
    isDetected: true,
    gpuName: gpuName.trim() || 'Unknown Adapter',
    vendor: vendor.trim() || 'Unknown Vendor',
    architecture: architecture.trim() || 'Generic',
    isLowEndOrIntegrated: isLowEnd,
    isIntegrated,
    isFallback,
    isWebGPU,
    reason: reason || 'Optimal dedicated hardware verified',
    deviceMemory,
    hardwareConcurrency,
  };
}
