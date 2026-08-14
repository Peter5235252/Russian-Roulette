import { encryptApiKey, decryptApiKey, isEncrypted } from './utils/crypto';

export type WebGpuUpscalingPreset = 'ultra_quality' | 'quality' | 'balanced' | 'performance';
export type ReflectionQuality = 'low' | 'medium' | 'high' | 'ultra';
export type EffectQuality = 'low' | 'medium' | 'high' | 'ultra';
export type AiProvider = 'gemini' | 'chatgpt' | 'claude' | 'grok' | 'mistral';

export interface ControllerSettings {
  inputType: 'kbm' | 'gamepad';
  graphicsPreset: 'Low' | 'Medium' | 'High' | 'Ultra' | 'Custom';
  antiAliasing: 'fxaa' | 'smaa';
  postProcessing: 'low' | 'high' | 'cinematic';
  shadowQuality: 'low' | 'medium' | 'high' | 'ultra';
  reflectionQuality: ReflectionQuality;
  textureFiltering: 1 | 2 | 4 | 8 | 16;
  materialEnhancements: boolean;
  materialQuality?: EffectQuality;
  bloomIntensity: number;
  gtaoEnabled?: boolean;
  gtaoQuality?: EffectQuality;
  ssrEnabled?: boolean;
  ssrQuality?: EffectQuality;
  volumetricSmokeEnabled?: boolean;
  volumetricSmokeQuality?: EffectQuality;
  gpuComputePhysics?: boolean;
  computePhysicsQuality?: EffectQuality;
  motionBlurEnabled?: boolean;
  motionBlurQuality?: EffectQuality;
  motionBlurIntensity?: number;
  bloodEffectsEnabled: boolean;
  particleQuality: 'low' | 'medium' | 'high' | 'ultra';
  brightness: number;
  rumbleEnabled: boolean;
  rumbleIntensity: number;
  polygonCount: 'low' | 'medium' | 'high' | 'ultra';
  webGpuUpscalingPreset: WebGpuUpscalingPreset;
  webGpuSharpening: number;
  useWebGPU: boolean;
  showKeyboardHud?: boolean;
  aiProvider: AiProvider;
  aiApiKey: string;
  aiCustomModel: string;
}

// Persist in localStorage with E2E encrypted API key
const STORAGE_KEY = 'dealer_controller_settings_v9';

const defaultSettings: ControllerSettings = {
  inputType: 'kbm',
  graphicsPreset: 'Low',
  antiAliasing: 'fxaa',
  postProcessing: 'low',
  shadowQuality: 'low',
  reflectionQuality: 'low',
  textureFiltering: 2,
  materialEnhancements: true,
  materialQuality: 'low',
  bloomIntensity: 0.2,
  gtaoEnabled: true,
  gtaoQuality: 'low',
  ssrEnabled: true,
  ssrQuality: 'low',
  volumetricSmokeEnabled: true,
  volumetricSmokeQuality: 'low',
  gpuComputePhysics: true,
  computePhysicsQuality: 'low',
  motionBlurEnabled: true,
  motionBlurQuality: 'low',
  motionBlurIntensity: 0.3,
  bloodEffectsEnabled: true,
  particleQuality: 'low',
  brightness: 1.0,
  rumbleEnabled: true,
  rumbleIntensity: 1.0,
  polygonCount: 'low',
  webGpuUpscalingPreset: 'balanced',
  webGpuSharpening: 0.6,
  useWebGPU: false,
  showKeyboardHud: true,
  aiProvider: 'gemini',
  aiApiKey: '',
  aiCustomModel: '',
};

let currentSettings: ControllerSettings = { ...defaultSettings };

const listeners = new Set<(s: ControllerSettings) => void>();

// Async initialization to load and decrypt settings
(async () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.aiApiKey && isEncrypted(parsed.aiApiKey)) {
        parsed.aiApiKey = await decryptApiKey(parsed.aiApiKey);
      }
      // Sanitize legacy "off" or "none" values to baseline "low" or "fxaa"
      if (parsed.antiAliasing === 'none') parsed.antiAliasing = 'fxaa';
      if (parsed.reflectionQuality === 'off') parsed.reflectionQuality = 'low';
      if (parsed.particleQuality === 'off') parsed.particleQuality = 'low';
      if (parsed.gtaoQuality === 'off') parsed.gtaoQuality = 'low';
      if (parsed.ssrQuality === 'off') parsed.ssrQuality = 'low';
      if (parsed.materialQuality === 'off') parsed.materialQuality = 'low';
      if (parsed.volumetricSmokeQuality === 'off') parsed.volumetricSmokeQuality = 'low';
      if (parsed.computePhysicsQuality === 'off') parsed.computePhysicsQuality = 'low';
      if (parsed.motionBlurQuality === 'off') parsed.motionBlurQuality = 'low';
      if (parsed.webGpuUpscalingPreset === 'off') parsed.webGpuUpscalingPreset = 'balanced';
      parsed.brightness = 1.0;

      currentSettings = { ...defaultSettings, ...parsed };
      listeners.forEach(l => l(currentSettings));
    }
  } catch (e) {
    console.warn("Failed to load or decrypt controller settings:", e);
  }
})();

export const getControllerSettings = () => currentSettings;

export const setControllerSettings = (s: Partial<ControllerSettings>) => {
  currentSettings = { ...currentSettings, ...s };
  
  // Persist with encrypted API key asynchronously
  (async () => {
    try {
      const toSave = { ...currentSettings };
      if (toSave.aiApiKey) {
        toSave.aiApiKey = await encryptApiKey(toSave.aiApiKey);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn("Failed to persist encrypted settings:", e);
    }
  })();

  listeners.forEach(l => l(currentSettings));
};

export const subscribeControllerSettings = (listener: (s: ControllerSettings) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Auto detection
let lastGamepadValues: Record<number, { buttons: number[], axes: number[] }> = {};

export function updateGamepads() {
  if (currentSettings.inputType !== 'gamepad') return null;
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gamepads) {
    if (gp && gp.connected) {
      return gp;
    }
  }
  return null;
}

export function vibrateGamepad(
  strength: 'weak' | 'strong' | 'burst' | 'click' | 'jolt' | 'rumble',
  customOptions?: { duration?: number; weak?: number; strong?: number }
) {
  if (currentSettings.inputType !== 'gamepad') return;
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gamepads) {
    if (gp && gp.connected) {
      // Support standard vibrationActuator as well as legacy/Firefox hapticActuators array
      const actuator = gp.vibrationActuator || 
                       ((gp as any).hapticActuators && (gp as any).hapticActuators[0]) ||
                       ((gp as any).hapticActuator);

      if (actuator) {
        let duration = 60;
        let weakMagnitude = 0.25;
        let strongMagnitude = 0.05;

        if (strength === 'strong') {
          duration = 500;
          weakMagnitude = 1.0;
          strongMagnitude = 1.0;
        } else if (strength === 'burst') {
          duration = 150;
          weakMagnitude = 0.7;
          strongMagnitude = 0.5;
        } else if (strength === 'click') {
          duration = 20;
          weakMagnitude = 0.15;
          strongMagnitude = 0.0;
        } else if (strength === 'jolt') {
          duration = 750;
          weakMagnitude = 1.0;
          strongMagnitude = 1.0;
        } else if (strength === 'rumble') {
          duration = 120;
          weakMagnitude = 0.18;
          strongMagnitude = 0.03;
        }

        // Apply custom overrides if provided
        if (customOptions) {
          if (customOptions.duration !== undefined) duration = customOptions.duration;
          if (customOptions.weak !== undefined) weakMagnitude = customOptions.weak;
          if (customOptions.strong !== undefined) strongMagnitude = customOptions.strong;
        }

        // Apply Rumble settings toggle & intensity multiplier
        const isRumbleEnabled = currentSettings.rumbleEnabled !== false;
        if (!isRumbleEnabled) {
          return;
        }
        const intensityMult = currentSettings.rumbleIntensity !== undefined ? currentSettings.rumbleIntensity : 1.0;
        weakMagnitude *= intensityMult;
        strongMagnitude *= intensityMult;

        try {
          if (typeof actuator.playEffect === 'function') {
            actuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration,
              weakMagnitude,
              strongMagnitude
            });
          } else if (typeof actuator.pulse === 'function') {
            const intensity = Math.max(weakMagnitude, strongMagnitude);
            actuator.pulse(intensity, duration);
          }
        } catch (e) {
          console.warn('Gamepad vibration failed on actuator:', e);
        }
      }
    }
  }
}
