import { encryptApiKey, decryptApiKey, isEncrypted } from './utils/crypto';

export type WebGpuUpscalingPreset = 'off' | 'ultra_quality' | 'quality' | 'balanced' | 'performance';
export type ReflectionQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type AiProvider = 'gemini' | 'chatgpt' | 'claude' | 'grok' | 'mistral';

export interface ControllerSettings {
  inputType: 'kbm' | 'gamepad';
  graphicsPreset: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Ultra' | 'Custom';
  antiAliasing: 'none' | 'fxaa' | 'smaa';
  postProcessing: 'low' | 'high' | 'cinematic';
  shadowQuality: 'low' | 'medium' | 'high' | 'ultra';
  reflectionQuality: ReflectionQuality;
  textureFiltering: 1 | 2 | 4 | 8 | 16;
  materialEnhancements: boolean;
  bloomIntensity: number;
  dofEnabled: boolean;
  lensFlaresEnabled: boolean;
  bloodEffectsEnabled: boolean;
  particleQuality: 'off' | 'low' | 'medium' | 'high' | 'ultra';
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
const STORAGE_KEY = 'dealer_controller_settings_v8';

const defaultSettings: ControllerSettings = {
  inputType: 'kbm',
  graphicsPreset: 'High',
  antiAliasing: 'smaa',
  postProcessing: 'cinematic',
  shadowQuality: 'high',
  reflectionQuality: 'high',
  textureFiltering: 8,
  materialEnhancements: true,
  bloomIntensity: 0.4,
  dofEnabled: true,
  lensFlaresEnabled: true,
  bloodEffectsEnabled: true,
  particleQuality: 'high',
  brightness: 1.0,
  rumbleEnabled: true,
  rumbleIntensity: 1.0,
  polygonCount: 'high',
  webGpuUpscalingPreset: 'quality',
  webGpuSharpening: 0.6,
  useWebGPU: false,
  showKeyboardHud: true,
  aiProvider: 'gemini',
  aiApiKey: '',
  aiCustomModel: '',
};

let currentSettings: ControllerSettings = { ...defaultSettings };

// Async initialization to load and decrypt settings
(async () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.aiApiKey && isEncrypted(parsed.aiApiKey)) {
        parsed.aiApiKey = await decryptApiKey(parsed.aiApiKey);
      }
      currentSettings = { ...defaultSettings, ...parsed };
      listeners.forEach(l => l(currentSettings));
    }
  } catch (e) {
    console.warn("Failed to load or decrypt controller settings:", e);
  }
})();

const listeners = new Set<(s: ControllerSettings) => void>();

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
