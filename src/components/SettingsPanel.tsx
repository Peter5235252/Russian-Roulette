import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Monitor, Sparkles, Volume2, Gamepad2, Check, Bot, Cpu, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Lock } from 'lucide-react';
import { CustomSelect, SelectOption } from './CustomSelect';
import { IndustrialScrollArea } from './IndustrialScrollArea';
import { getMasterVolume, getAmbientVolume, setMasterVolume, setAmbientVolume } from '../audio';
import { getControllerSettings, setControllerSettings, subscribeControllerSettings, vibrateGamepad, ReflectionQuality, EffectQuality, AiProvider } from '../controller';
import { Difficulty } from '../types';
import { getDifficultyConfig } from '../App';
import { detectGpuHardware, GpuDetectionResult } from '../utils/hardwareDetector';

interface SettingsPanelProps {
  difficulty?: Difficulty;
  onClose: () => void;
}

type TabType = 'graphics' | 'audio' | 'controls' | 'ai';

const effectQualityOptions: SelectOption<EffectQuality>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" }
];

export function SettingsPanel({ difficulty = 'NORMAL', onClose }: SettingsPanelProps) {
  const settings = getControllerSettings();
  const diffConfig = getDifficultyConfig(difficulty);
  const [activeTab, setActiveTab] = useState<TabType>('graphics');

  const [masterVol, setMasterVol] = useState(getMasterVolume());
  const [ambientVol, setAmbientVol] = useState(getAmbientVolume());
  const [inputType, setInputType] = useState(settings.inputType);
  const [graphicsPreset, setGraphicsPreset] = useState(settings.graphicsPreset);
  
  const [antiAliasing, setAntiAliasing] = useState(settings.antiAliasing);
  const [postProcessing, setPostProcessing] = useState(settings.postProcessing);
  const [shadowQuality, setShadowQuality] = useState(settings.shadowQuality);
  const [reflectionQuality, setReflectionQuality] = useState<ReflectionQuality>(settings.reflectionQuality || 'low');
  const [textureFiltering, setTextureFiltering] = useState(settings.textureFiltering);
  const [materialEnhancements, setMaterialEnhancements] = useState(settings.materialEnhancements);
  const [materialQuality, setMaterialQuality] = useState<EffectQuality>(settings.materialQuality || 'low');
  const [bloomIntensity, setBloomIntensity] = useState(settings.bloomIntensity);
  const [gtaoEnabled, setGtaoEnabled] = useState(settings.gtaoEnabled !== false);
  const [gtaoQuality, setGtaoQuality] = useState<EffectQuality>(settings.gtaoQuality || 'low');
  const [ssrEnabled, setSsrEnabled] = useState(settings.ssrEnabled !== false);
  const [ssrQuality, setSsrQuality] = useState<EffectQuality>(settings.ssrQuality || 'low');
  const [volumetricSmokeEnabled, setVolumetricSmokeEnabled] = useState(settings.volumetricSmokeEnabled !== false);
  const [volumetricSmokeQuality, setVolumetricSmokeQuality] = useState<EffectQuality>(settings.volumetricSmokeQuality || 'low');
  const [gpuComputePhysics, setGpuComputePhysics] = useState(settings.gpuComputePhysics !== false);
  const [computePhysicsQuality, setComputePhysicsQuality] = useState<EffectQuality>(settings.computePhysicsQuality || 'low');
  const [motionBlurEnabled, setMotionBlurEnabled] = useState(settings.motionBlurEnabled !== false);
  const [motionBlurQuality, setMotionBlurQuality] = useState<EffectQuality>(settings.motionBlurQuality || 'low');
  const [particleQuality, setParticleQuality] = useState(settings.particleQuality || 'low');
  const [rumbleEnabled, setRumbleEnabled] = useState(settings.rumbleEnabled !== false);
  const [rumbleIntensity, setRumbleIntensity] = useState(settings.rumbleIntensity !== undefined ? settings.rumbleIntensity : 1.0);
  const [polygonCount, setPolygonCount] = useState(settings.polygonCount || 'low');
  const [useWebGPU, setUseWebGPU] = useState(settings.useWebGPU !== false);
  const [webGpuUpscalingPreset, setWebGpuUpscalingPreset] = useState(settings.webGpuUpscalingPreset || 'balanced');
  const [webGpuSharpening, setWebGpuSharpening] = useState(settings.webGpuSharpening !== undefined ? settings.webGpuSharpening : 0.6);
  const [showKeyboardHudSetting, setShowKeyboardHudSetting] = useState(settings.showKeyboardHud !== false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gpuHardware, setGpuHardware] = useState<GpuDetectionResult | null>(null);

  // AI Dealer Provider & Key State
  const [aiProvider, setAiProvider] = useState<AiProvider>(settings.aiProvider || 'gemini');
  const [aiApiKey, setAiApiKey] = useState(settings.aiApiKey || '');
  const [aiCustomModel, setAiCustomModel] = useState(settings.aiCustomModel || '');
  const [showKey, setShowKey] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const checkGamepads = () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(gps).some(gp => gp && gp.connected);
      setGamepadConnected(connected);
    };

    checkGamepads();

    window.addEventListener('gamepadconnected', checkGamepads);
    window.addEventListener('gamepaddisconnected', checkGamepads);

    const interval = setInterval(checkGamepads, 1000);

    return () => {
      window.removeEventListener('gamepadconnected', checkGamepads);
      window.removeEventListener('gamepaddisconnected', checkGamepads);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    detectGpuHardware().then(res => setGpuHardware(res));
  }, []);

  useEffect(() => {
    return subscribeControllerSettings(s => {
      setInputType(s.inputType);
      setGraphicsPreset(s.graphicsPreset);
      setAntiAliasing(s.antiAliasing);
      setPostProcessing(s.postProcessing);
      setShadowQuality(s.shadowQuality);
      setReflectionQuality(s.reflectionQuality || 'low');
      setTextureFiltering(s.textureFiltering);
      setMaterialEnhancements(s.materialEnhancements);
      setMaterialQuality(s.materialQuality || 'low');
      setBloomIntensity(s.bloomIntensity);
      setGtaoEnabled(s.gtaoEnabled !== false);
      setGtaoQuality(s.gtaoQuality || 'low');
      setSsrEnabled(s.ssrEnabled !== false);
      setSsrQuality(s.ssrQuality || 'low');
      setVolumetricSmokeEnabled(s.volumetricSmokeEnabled !== false);
      setVolumetricSmokeQuality(s.volumetricSmokeQuality || 'low');
      setGpuComputePhysics(s.gpuComputePhysics !== false);
      setComputePhysicsQuality(s.computePhysicsQuality || 'low');
      setMotionBlurEnabled(s.motionBlurEnabled !== false);
      setMotionBlurQuality(s.motionBlurQuality || 'low');
      setParticleQuality(s.particleQuality || 'low');
      setRumbleEnabled(s.rumbleEnabled !== false);
      setRumbleIntensity(s.rumbleIntensity !== undefined ? s.rumbleIntensity : 1.0);
      setPolygonCount(s.polygonCount || 'low');
      setWebGpuUpscalingPreset(s.webGpuUpscalingPreset || 'balanced');
      setWebGpuSharpening(s.webGpuSharpening !== undefined ? s.webGpuSharpening : 0.6);
      setUseWebGPU(s.useWebGPU !== false);
      setAiProvider(s.aiProvider || 'gemini');
      setAiApiKey(s.aiApiKey || '');
      setAiCustomModel(s.aiCustomModel || '');
    });
  }, []);

  const handleAiSettingChange = (update: { aiProvider?: AiProvider; aiApiKey?: string; aiCustomModel?: string }) => {
    if (update.aiProvider !== undefined) setAiProvider(update.aiProvider);
    if (update.aiApiKey !== undefined) setAiApiKey(update.aiApiKey);
    if (update.aiCustomModel !== undefined) setAiCustomModel(update.aiCustomModel);
    setControllerSettings(update);
    setTestStatus('idle');
  };

  const testAiConnection = async () => {
    setTestLoading(true);
    setTestStatus('idle');
    setTestMessage('');
    try {
      const res = await fetch('/api/test-ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          model: aiCustomModel
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestStatus('success');
        setTestMessage(`Connection verified! ${data.provider.toUpperCase()} AI Dealer is online.`);
      } else {
        setTestStatus('error');
        setTestMessage(data.error || 'Connection failed. Verify API key or quota.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Network error during API test.');
    } finally {
      setTestLoading(false);
    }
  };

  const handleMasterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setMasterVol(v);
    setMasterVolume(v);
  };

  const handleAmbientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setAmbientVol(v);
    setAmbientVolume(v);
  };

  const toggleInputType = () => {
    setControllerSettings({ inputType: inputType === 'kbm' ? 'gamepad' : 'kbm' });
  };

  const isLowEndLocked = Boolean(gpuHardware?.isLowEndOrIntegrated);

  const applyGraphicsPreset = (preset: 'Low' | 'Medium' | 'High' | 'Ultra') => {
    if (isLowEndLocked && preset !== 'Low') return;
    switch (preset) {
      case 'Low':
        setControllerSettings({
          graphicsPreset: preset,
          antiAliasing: 'fxaa',
          postProcessing: 'low',
          shadowQuality: 'low',
          reflectionQuality: 'low',
          textureFiltering: 2,
          materialEnhancements: true,
          materialQuality: 'low',
          bloomIntensity: 0.15,
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
          polygonCount: 'low',
          webGpuUpscalingPreset: webGpuUpscalingPreset || 'performance',
          webGpuSharpening: webGpuSharpening !== undefined ? webGpuSharpening : 0.6,
          particleQuality: 'low'
        });
        break;
      case 'Medium':
        setControllerSettings({
          graphicsPreset: preset,
          antiAliasing: 'fxaa',
          postProcessing: 'high',
          shadowQuality: 'medium',
          reflectionQuality: 'medium',
          textureFiltering: 4,
          materialEnhancements: true,
          materialQuality: 'medium',
          bloomIntensity: 0.25,
          gtaoEnabled: true,
          gtaoQuality: 'medium',
          ssrEnabled: true,
          ssrQuality: 'medium',
          volumetricSmokeEnabled: true,
          volumetricSmokeQuality: 'medium',
          gpuComputePhysics: true,
          computePhysicsQuality: 'medium',
          motionBlurEnabled: true,
          motionBlurQuality: 'medium',
          polygonCount: 'medium',
          webGpuUpscalingPreset: 'balanced',
          webGpuSharpening: 0.6,
          particleQuality: 'medium'
        });
        break;
      case 'High':
        setControllerSettings({
          graphicsPreset: preset,
          antiAliasing: 'smaa',
          postProcessing: 'cinematic',
          shadowQuality: 'high',
          reflectionQuality: 'high',
          textureFiltering: 8,
          materialEnhancements: true,
          materialQuality: 'high',
          bloomIntensity: 0.35,
          gtaoEnabled: true,
          gtaoQuality: 'high',
          ssrEnabled: true,
          ssrQuality: 'high',
          volumetricSmokeEnabled: true,
          volumetricSmokeQuality: 'high',
          gpuComputePhysics: true,
          computePhysicsQuality: 'high',
          motionBlurEnabled: true,
          motionBlurQuality: 'high',
          polygonCount: 'high',
          webGpuUpscalingPreset: 'quality',
          webGpuSharpening: 0.5,
          particleQuality: 'high'
        });
        break;
      case 'Ultra':
        setControllerSettings({
          graphicsPreset: preset,
          antiAliasing: 'smaa',
          postProcessing: 'cinematic',
          shadowQuality: 'ultra',
          reflectionQuality: 'ultra',
          textureFiltering: 16,
          materialEnhancements: true,
          materialQuality: 'ultra',
          bloomIntensity: 0.4,
          gtaoEnabled: true,
          gtaoQuality: 'ultra',
          ssrEnabled: true,
          ssrQuality: 'ultra',
          volumetricSmokeEnabled: true,
          volumetricSmokeQuality: 'ultra',
          gpuComputePhysics: true,
          computePhysicsQuality: 'ultra',
          motionBlurEnabled: true,
          motionBlurQuality: 'ultra',
          polygonCount: 'ultra',
          webGpuUpscalingPreset: 'ultra_quality',
          webGpuSharpening: 0.4,
          particleQuality: 'ultra'
        });
        break;
    }
  };

  const handleCustomSetting = (update: any) => {
    if (isLowEndLocked) {
      const allowed: any = {};
      if ('webGpuUpscalingPreset' in update) allowed.webGpuUpscalingPreset = update.webGpuUpscalingPreset;
      if ('webGpuSharpening' in update) allowed.webGpuSharpening = update.webGpuSharpening;
      if (Object.keys(allowed).length > 0) {
        setControllerSettings(allowed);
      }
      return;
    }
    setControllerSettings({ ...update, graphicsPreset: 'Custom' });
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'graphics', label: 'Display & Graphics', icon: <Monitor size={16} /> },
    { id: 'audio', label: 'Audio & Haptics', icon: <Volume2 size={16} /> },
    { id: 'controls', label: 'Controls', icon: <Gamepad2 size={16} /> },
    { id: 'ai', label: 'Dealer AI', icon: <Bot size={16} /> },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 sm:p-6"
    >
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="border-2 border-red-950 bg-[#0a050d]/92 flex flex-col w-full max-w-4xl h-[85vh] max-h-[900px] shadow-[0_0_60px_rgba(0,0,0,0.95)] rounded-none overflow-hidden text-neutral-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b-2 border-red-950 bg-neutral-950/80 shrink-0">

          <div>
            <h2 className="text-red-500 font-mono tracking-widest text-base sm:text-lg font-extrabold uppercase flex items-center gap-2">
              <span className="text-red-700">//</span>
              <span>SYSTEM SETTINGS</span>
            </h2>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 font-mono uppercase tracking-wider">Press ESC or click outside to return</p>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-none bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-red-900/80 hover:border-red-600 transition-all flex items-center justify-center cursor-pointer active:translate-y-0.5"
            aria-label="Close Settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Selected Difficulty Level Banner */}
        <div className={`px-5 sm:px-6 py-3 border-b font-mono text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 ${diffConfig.borderColor} ${diffConfig.bgColor} ${diffConfig.glowShadow}`}>
          <div className="flex items-center gap-2.5 tracking-widest font-extrabold uppercase text-[11px] sm:text-xs">
            <span className="text-red-600">//</span>
            <span className="text-neutral-300">SELECTED DIFFICULTY LEVEL:</span>
            <span className={`px-3 py-1 rounded border shadow-sm ${diffConfig.badgeBg} ${diffConfig.textColor}`}>
              {diffConfig.label}
            </span>
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-300 font-sans tracking-wide">
            {diffConfig.desc}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-neutral-800 bg-neutral-950/95 p-2 sm:p-3 gap-1.5 sm:gap-2 shrink-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[42px] px-2 sm:px-3 py-2 rounded-none font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer border text-center ${
                  isActive 
                    ? 'bg-red-950/90 text-red-100 border-red-600 shadow-[inset_0_0_12px_rgba(220,38,38,0.3)]' 
                    : 'bg-neutral-900/50 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800/80 hover:border-neutral-700'
                }`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel with Custom Industrial Scrollbar */}
        <IndustrialScrollArea className="flex-1 min-h-0" viewportClassName="p-4 sm:p-6 space-y-5 sm:space-y-6 pb-12">

          {/* TAB 1: UNIFIED DISPLAY & GRAPHICS */}
          {activeTab === 'graphics' && (
            <div className="space-y-6">
              {/* GPU HARDWARE TELEMETRY ADVISORY BANNER */}
              {gpuHardware && (
                <div className={`p-3.5 border font-mono text-xs space-y-2 ${
                  gpuHardware.isLowEndOrIntegrated
                    ? 'border-amber-900/80 bg-amber-950/20'
                    : 'border-neutral-800 bg-black/40'
                }`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Cpu className={`w-4 h-4 ${gpuHardware.isLowEndOrIntegrated ? 'text-amber-400' : 'text-emerald-400'}`} />
                      <span className="font-bold uppercase tracking-wider text-[11px] text-neutral-200">
                        HARDWARE TELEMETRY // {gpuHardware.isWebGPU ? 'WEBGPU NATIVE' : 'WEBGL'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      gpuHardware.isLowEndOrIntegrated
                        ? 'border-amber-700/80 bg-amber-950/80 text-amber-300'
                        : 'border-emerald-700/80 bg-emerald-950/80 text-emerald-300'
                    }`}>
                      {gpuHardware.isFallback ? 'SOFTWARE ADAPTER' : gpuHardware.isIntegrated ? 'INTEGRATED GPU' : gpuHardware.isLowEndOrIntegrated ? 'LOW COMPUTE TIER' : 'DEDICATED GPU'}
                    </span>
                  </div>

                  <div className="text-[11px] text-neutral-300 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-neutral-500 uppercase text-[10px]">DEVICE:</span>
                    <span className="font-semibold text-neutral-200 truncate max-w-full">{gpuHardware.gpuName}</span>
                  </div>

                  {gpuHardware.isLowEndOrIntegrated && (
                    <div className="text-[10px] text-amber-400/90 pt-1 border-t border-amber-950/80 leading-relaxed font-sans">
                      Notice: Heavy shader passes (SSR, GTAO, Compute Particles) are active. Baseline calibrated to Low with FSR upscaling for optimal frametime.
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 1: QUALITY PRESET MATRIX */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-red-500" />
                    <span className="text-neutral-200 font-mono uppercase text-xs font-bold tracking-wider">
                      Graphics & Performance Preset
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLowEndLocked && (
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        LOCKED TO LOW
                      </span>
                    )}
                    <span className="text-xs font-mono font-bold text-red-400 bg-red-950/70 border border-red-800/60 px-2.5 py-0.5 uppercase tracking-wider">
                      {graphicsPreset}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['Low', 'Medium', 'High', 'Ultra'] as const).map((preset) => {
                    const isPresetDisabled = isLowEndLocked && preset !== 'Low';
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={isPresetDisabled}
                        onClick={() => applyGraphicsPreset(preset)}
                        className={`min-h-[44px] px-2 py-2 rounded-none font-mono text-xs font-bold uppercase transition-all border ${
                          isPresetDisabled
                            ? 'bg-neutral-950/80 border-neutral-900/90 text-neutral-600 opacity-40 cursor-not-allowed'
                            : graphicsPreset === preset
                            ? 'bg-red-950/90 border-red-600 text-red-100 shadow-[inset_0_0_12px_rgba(220,38,38,0.4)] cursor-pointer'
                            : 'bg-neutral-900/90 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700 hover:text-neutral-200 cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-1">
                          {preset}
                          {isPresetDisabled && <Lock className="w-3 h-3 text-neutral-600" />}
                        </span>
                      </button>
                    );
                  })}
                  <div className={`min-h-[44px] px-2 py-2 rounded-none font-mono text-xs uppercase flex items-center justify-center border ${
                    isLowEndLocked
                      ? 'bg-neutral-950/80 border-neutral-900/90 text-neutral-600 opacity-40 cursor-not-allowed'
                      : graphicsPreset === 'Custom' 
                      ? 'bg-neutral-800 border-neutral-600 text-white font-bold' 
                      : 'bg-neutral-950/60 border-neutral-900 text-neutral-600'
                  }`}>
                    Custom
                  </div>
                </div>
              </div>

              {/* SECTION 2: WEBGPU SPATIAL UPSCALING (AMD FSR 1.0) & SHARPENING */}
              <div className="p-4 rounded-none border border-red-900/40 bg-black/50 space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-500" />
                    <span className="text-neutral-200 font-mono uppercase text-xs font-bold">
                      WebGPU Spatial Upscaling (AMD FSR 1.0)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-red-400 bg-red-950/70 border border-red-800/60 px-2.5 py-0.5 uppercase tracking-wider">
                    {webGpuUpscalingPreset === 'ultra_quality' ? 'Ultra Quality (88%)' :
                     webGpuUpscalingPreset === 'quality' ? 'Quality (77%)' :
                     webGpuUpscalingPreset === 'balanced' ? 'Balanced (67%)' : 'Performance (50%)'}
                  </span>
                </div>
                
                <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
                  Edge-Adaptive Spatial Upsampling renders the 3D scene at optimized internal scale and upscales to native viewport resolution with edge reconstruction.
                </p>

                {/* Upscaling Presets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                  {[
                    { id: 'ultra_quality', label: 'Ultra', sub: '88%' },
                    { id: 'quality', label: 'Quality', sub: '77%' },
                    { id: 'balanced', label: 'Balanced', sub: '67%' },
                    { id: 'performance', label: 'Perf', sub: '50%' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleCustomSetting({ webGpuUpscalingPreset: p.id })}
                      className={`px-2 py-2 border font-mono text-xs flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        webGpuUpscalingPreset === p.id 
                          ? 'bg-red-950/90 border-red-600 text-red-200 shadow-[inset_0_0_8px_rgba(220,38,38,0.3)]' 
                          : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      <span className="font-bold">{p.label}</span>
                      <span className="text-[10px] text-neutral-500">{p.sub}</span>
                    </button>
                  ))}
                </div>

                {/* RCAS Sharpening Slider */}
                <div className="pt-3 border-t border-neutral-800/80 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-neutral-300 font-mono uppercase text-xs font-bold flex items-center gap-1.5">
                      Robust Contrast-Adaptive Sharpening (RCAS)
                    </label>
                    <span className="text-red-400 font-mono text-xs font-bold">{Math.round(webGpuSharpening * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.0" max="1.0" step="0.05"
                    value={webGpuSharpening}
                    onChange={(e) => handleCustomSetting({ webGpuSharpening: parseFloat(e.target.value) })}
                    className="w-full h-2 rounded-none appearance-none bg-neutral-800 accent-red-600 border border-neutral-700 cursor-pointer"
                  />
                  <p className="text-[10px] font-mono text-neutral-500">
                    Adaptive edge-enhancement algorithm sharpening fine barrel engravings and CRT scanlines without grain amplification.
                  </p>
                </div>
              </div>

              {/* SECTION 3: ADVANCED GPU PIPELINE & HARDWARE ACCELERATION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-mono font-bold text-xs">//</span>
                    <span className="text-neutral-300 font-mono uppercase text-xs font-bold tracking-wider">
                      Next-Gen Lighting & GPU Acceleration
                    </span>
                  </div>
                  {isLowEndLocked && (
                    <span className="text-[10px] font-mono text-amber-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> FORCED LOW
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CustomSelect<EffectQuality>
                    label="Ground Truth Ambient Occlusion (GTAO)"
                    options={effectQualityOptions}
                    value={gtaoQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ gtaoQuality: val, gtaoEnabled: true })}
                  />

                  <CustomSelect<EffectQuality>
                    label="Screen Space Reflections (SSR)"
                    options={effectQualityOptions}
                    value={ssrQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ ssrQuality: val, ssrEnabled: true })}
                  />

                  <CustomSelect<EffectQuality>
                    label="WebGPU Compute Physics (Blood & Sparks)"
                    options={effectQualityOptions}
                    value={computePhysicsQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ computePhysicsQuality: val, gpuComputePhysics: true })}
                  />

                  <CustomSelect<EffectQuality>
                    label="Atmospheric Smoke & Ash Wisps"
                    options={effectQualityOptions}
                    value={volumetricSmokeQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ volumetricSmokeQuality: val, volumetricSmokeEnabled: true })}
                  />

                  <CustomSelect<EffectQuality>
                    label="Object Velocity Motion Blur"
                    options={effectQualityOptions}
                    value={motionBlurQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ motionBlurQuality: val, motionBlurEnabled: true })}
                  />

                  <CustomSelect<EffectQuality>
                    label="PBR Material Enhancements"
                    options={effectQualityOptions}
                    value={materialQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ materialQuality: val, materialEnhancements: true })}
                  />
                </div>
              </div>

              {/* SECTION 4: GEOMETRY & TEXTURE FIDELITY */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-mono font-bold text-xs">//</span>
                    <span className="text-neutral-300 font-mono uppercase text-xs font-bold tracking-wider">
                      Geometry & Texture Fidelity
                    </span>
                  </div>
                  {isLowEndLocked && (
                    <span className="text-[10px] font-mono text-amber-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> FORCED LOW
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CustomSelect
                    label="Anti-Aliasing"
                    options={[
                      { value: "fxaa", label: "FXAA (Fast)" },
                      { value: "smaa", label: "SMAA (Quality)" }
                    ]}
                    value={antiAliasing}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ antiAliasing: val })}
                  />

                  <CustomSelect
                    label="Shadow Quality"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "ultra", label: "Ultra" }
                    ]}
                    value={shadowQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ shadowQuality: val })}
                  />

                  <CustomSelect<ReflectionQuality>
                    label="Reflections"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "ultra", label: "Ultra" }
                    ]}
                    value={reflectionQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ reflectionQuality: val })}
                  />

                  <CustomSelect
                    label="Polygon Detail"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "ultra", label: "Ultra" }
                    ]}
                    value={polygonCount}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ polygonCount: val })}
                  />

                  <CustomSelect<number>
                    label="Anisotropic Filtering"
                    options={[
                      { value: 1, label: "1x" },
                      { value: 2, label: "2x" },
                      { value: 4, label: "4x" },
                      { value: 8, label: "8x" },
                      { value: 16, label: "16x" }
                    ]}
                    value={textureFiltering}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ textureFiltering: val })}
                  />

                  <CustomSelect
                    label="Particle FX Density (Sparks & Smoke)"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "ultra", label: "Ultra" }
                    ]}
                    value={particleQuality}
                    disabled={isLowEndLocked}
                    onChange={(val) => handleCustomSetting({ particleQuality: val })}
                  />
                </div>
              </div>

              {/* SECTION 5: POST-PROCESSING & CALIBRATION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-mono font-bold text-xs">//</span>
                    <span className="text-neutral-300 font-mono uppercase text-xs font-bold tracking-wider">
                      Post-Processing & Optical Calibration
                    </span>
                  </div>
                  {isLowEndLocked && (
                    <span className="text-[10px] font-mono text-amber-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> FORCED LOW
                    </span>
                  )}
                </div>

                <CustomSelect
                  label="Post-Processing Profile"
                  options={[
                    { value: "low", label: "Low (Direct Color Buffer)" },
                    { value: "high", label: "High (HDR Tone Mapping & FX)" },
                    { value: "cinematic", label: "Cinematic (Full Pipeline Pass)" }
                  ]}
                  value={postProcessing}
                  disabled={isLowEndLocked}
                  onChange={(val) => handleCustomSetting({ postProcessing: val })}
                />

                <div className="grid grid-cols-1 gap-4">
                  <div className={`p-4 rounded-none border border-neutral-800 bg-black/40 space-y-2 ${isLowEndLocked ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-center">
                      <label className="text-neutral-300 font-mono uppercase text-xs font-bold flex items-center gap-1.5">
                        Bloom Glow Intensity
                        {isLowEndLocked && <Lock className="w-3 h-3 text-neutral-500" />}
                      </label>
                      <span className="text-red-400 font-mono text-xs font-bold">{Math.round(bloomIntensity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="2" step="0.1" 
                      value={bloomIntensity} 
                      disabled={isLowEndLocked}
                      onChange={(e) => handleCustomSetting({ bloomIntensity: parseFloat(e.target.value) })}
                      className="w-full h-2 rounded-none appearance-none bg-neutral-800 accent-red-600 border border-neutral-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIO & HAPTICS */}
          {activeTab === 'audio' && (
            <div className="space-y-5">
              <div className="p-4 rounded-none border border-neutral-800 bg-black/40 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-neutral-200 font-mono uppercase text-xs font-bold">Master Volume</label>
                  <span className="text-red-400 font-mono text-xs font-bold">{Math.round(masterVol * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="1" step="0.01" 
                  value={masterVol} 
                  onChange={handleMasterChange} 
                  className="w-full h-2 rounded-none appearance-none bg-neutral-800 accent-red-600 border border-neutral-700 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-none border border-neutral-800 bg-black/40 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-neutral-200 font-mono uppercase text-xs font-bold">Ambient & Music Volume</label>
                  <span className="text-red-400 font-mono text-xs font-bold">{Math.round(ambientVol * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="1" step="0.01" 
                  value={ambientVol} 
                  onChange={handleAmbientChange} 
                  className="w-full h-2 rounded-none appearance-none bg-neutral-800 accent-red-600 border border-neutral-700 cursor-pointer"
                />
              </div>

              {/* Gamepad Haptics Section */}
              <div className="p-4 rounded-none border border-neutral-800 bg-black/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold uppercase text-white tracking-wider block">
                      Gamepad Rumble & Haptics
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {gamepadConnected ? 'Gamepad Connected' : 'No Controller Detected'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const nextVal = !rumbleEnabled;
                      handleCustomSetting({ rumbleEnabled: nextVal });
                      if (nextVal) {
                        vibrateGamepad('rumble', { duration: 150 });
                      }
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-none font-mono text-xs font-bold transition-all border cursor-pointer ${
                      rumbleEnabled 
                        ? 'bg-red-950/90 border-red-700 text-red-200 shadow-sm' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-500'
                    }`}
                  >
                    {rumbleEnabled ? 'RUMBLE ON' : 'RUMBLE OFF'}
                  </button>
                </div>

                {rumbleEnabled && (
                  <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                    <div className="flex justify-between items-center">
                      <label className="text-neutral-300 font-mono uppercase text-xs font-bold">Vibration Intensity</label>
                      <span className="text-red-400 font-mono text-xs font-bold">{Math.round(rumbleIntensity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" max="1.0" step="0.05" 
                      value={rumbleIntensity} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleCustomSetting({ rumbleIntensity: val });
                        vibrateGamepad('rumble', { duration: 100, weak: 0.25 * val });
                      }}
                      className="w-full h-2 rounded-none appearance-none bg-neutral-800 accent-red-600 border border-neutral-700 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CONTROLS */}
          {activeTab === 'controls' && (
            <div className="space-y-5">
              <div className="p-4 rounded-none border border-neutral-800 bg-black/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold uppercase text-white tracking-wider block">
                      Active Control Scheme
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      Switch between Keyboard & Mouse or Controller
                    </span>
                  </div>
                  <button 
                    onClick={toggleInputType}
                    className={`min-h-[44px] px-5 py-2.5 border font-mono text-xs font-bold rounded-none transition-all cursor-pointer ${
                      inputType === 'gamepad'
                        ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                        : 'bg-blue-950/80 border-blue-700 text-blue-300'
                    }`}
                  >
                    {inputType === 'gamepad' ? 'GAMEPAD MODE' : 'KEYBOARD & MOUSE'}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-none border border-neutral-800 bg-black/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold uppercase text-white tracking-wider block">
                      Keyboard Shortcuts HUD
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      Display or hide floating top shortcut bar during play
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      const nextVal = !showKeyboardHudSetting;
                      setShowKeyboardHudSetting(nextVal);
                      handleCustomSetting({ showKeyboardHud: nextVal });
                    }}
                    className={`min-h-[44px] px-5 py-2.5 border font-mono text-xs font-bold rounded-none transition-all cursor-pointer ${
                      showKeyboardHudSetting
                        ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                        : 'bg-red-950/80 border-red-800 text-red-400'
                    }`}
                  >
                    {showKeyboardHudSetting ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-none border border-neutral-800 bg-black/60 space-y-3 font-mono text-xs">
                <h3 className="text-neutral-400 uppercase text-[11px] tracking-wider font-bold">Intuitive Keyboard & Controller Controls</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-300">
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Shoot Self</span>
                    <span className="bg-blue-950 text-blue-400 px-2 py-0.5 rounded-none font-bold border border-blue-800">S / ←</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Shoot Dealer</span>
                    <span className="bg-red-950 text-red-400 px-2 py-0.5 rounded-none font-bold border border-red-800">D / →</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Navigate Arena & Target</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-neutral-300 font-bold border border-neutral-700">ARROW KEYS / A, D</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Use Item (Slots 1-8)</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-amber-400 font-bold border border-amber-800/80">1 - 8</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Market / Shop View</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-amber-400 font-bold border border-amber-800/80">Q / ↓, ↑</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Confirm / Primary Action</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-emerald-400 font-bold border border-emerald-800/80">SPACE / ENTER / [A]</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Toggle Settings Panel</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-neutral-400 font-bold border border-neutral-700">TAB / ESC</span>
                  </div>
                  <div className="p-2.5 rounded-none bg-neutral-900 border border-neutral-800 flex justify-between items-center">
                    <span>Menu Navigation</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded-none text-neutral-400 font-bold border border-neutral-700">LEFT / RIGHT ARROWS</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DEALER AI PROVIDER & API KEYS */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div className="border border-red-900/60 bg-red-950/30 p-3.5 sm:p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 font-mono text-red-400 font-bold uppercase tracking-wider">
                  <Cpu className="w-4 h-4 text-red-500" />
                  <span>DEALER INTELLIGENCE PROVIDER & CUSTOM API KEYS</span>
                </div>
                <p className="text-neutral-300 font-sans leading-relaxed text-[11px] sm:text-xs">
                  Choose your preferred AI Provider and enter a custom API Key to power the Dealer's decision engine (Gemini, ChatGPT, Claude, Grok, or Mistral). All key preferences are persisted locally in your browser storage. If quota is exceeded or no key is provided, the game automatically switches to the offline local tactical engine.
                </p>
              </div>

              <div className="space-y-4">
                {/* Provider Select */}
                <CustomSelect<AiProvider>
                  label="AI Model Provider"
                  options={[
                    { value: "gemini", label: "Google Gemini", description: "Google DeepMind" },
                    { value: "chatgpt", label: "OpenAI ChatGPT", description: "OpenAI" },
                    { value: "claude", label: "Anthropic Claude", description: "Anthropic" },
                    { value: "grok", label: "xAI Grok", description: "xAI" },
                    { value: "mistral", label: "Mistral AI", description: "Mistral AI" }
                  ]}
                  value={aiProvider}
                  onChange={(val) => handleAiSettingChange({ aiProvider: val })}
                />

                {/* API Key Input */}
                <div className="flex flex-col gap-1.5 font-mono">
                  <label className="text-neutral-400 uppercase text-xs font-bold flex justify-between items-center flex-wrap gap-1">
                    <span>{aiProvider.toUpperCase()} API KEY</span>
                    <span className="text-[10px] text-emerald-400/90 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 flex items-center gap-1 font-normal">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>AES-256 E2E ENCRYPTED AT REST</span>
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showKey ? "text" : "password"}
                      value={aiApiKey}
                      onChange={(e) => handleAiSettingChange({ aiApiKey: e.target.value })}
                      placeholder={`Enter custom ${aiProvider.toUpperCase()} API key...`}
                      className="w-full min-h-[44px] bg-neutral-950 border border-neutral-700 text-neutral-100 px-3 py-2.5 pr-14 text-xs font-mono focus:border-red-600 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((p) => !p)}
                      className="absolute right-2 text-neutral-400 hover:text-white px-2 py-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer bg-neutral-900 border border-neutral-700"
                    >
                      {showKey ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 font-sans">
                    {aiProvider === 'gemini' && 'Obtain key from Google AI Studio (aistudio.google.com)'}
                    {aiProvider === 'chatgpt' && 'Obtain key from OpenAI Platform (platform.openai.com)'}
                    {aiProvider === 'claude' && 'Obtain key from Anthropic Console (console.anthropic.com)'}
                    {aiProvider === 'grok' && 'Obtain key from xAI Console (console.x.ai)'}
                    {aiProvider === 'mistral' && 'Obtain key from Mistral AI Console (console.mistral.ai)'}
                  </p>
                </div>

                {/* Custom Model Name Input */}
                <div className="flex flex-col gap-1.5 font-mono">
                  <label className="text-neutral-400 uppercase text-xs font-bold flex justify-between items-center">
                    <span>MODEL OVERRIDE (OPTIONAL)</span>
                    <span className="text-[10px] text-neutral-500">LEAVE BLANK FOR DEFAULT</span>
                  </label>
                  <input
                    type="text"
                    value={aiCustomModel}
                    onChange={(e) => handleAiSettingChange({ aiCustomModel: e.target.value })}
                    placeholder={aiProvider === 'gemini' ? 'Default: gemini-3.7-flash (or enter custom model...)' : 'Enter custom model identifier...'}
                    className="w-full min-h-[44px] bg-neutral-950 border border-neutral-700 text-neutral-100 px-3 py-2.5 text-xs font-mono focus:border-red-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Test Connection Button & Status */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={testAiConnection}
                    disabled={testLoading}
                    className="min-h-[44px] px-5 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-600 text-red-100 font-mono text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {testLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                        <span>TESTING CONNECTION...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-red-400" />
                        <span>TEST API CONNECTION</span>
                      </>
                    )}
                  </button>

                  {testStatus === 'success' && (
                    <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs bg-emerald-950/60 border border-emerald-800 px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{testMessage}</span>
                    </div>
                  )}

                  {testStatus === 'error' && (
                    <div className="flex items-center gap-2 text-red-400 font-mono text-xs bg-red-950/60 border border-red-800 px-3 py-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{testMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </IndustrialScrollArea>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t-2 border-red-950 bg-neutral-950 flex items-center justify-end gap-4">
          <button 
            className="btn-rusty rounded-none flex-1 sm:flex-initial min-h-[48px] px-8 py-3 text-sm font-extrabold tracking-widest border-2 border-neutral-700 hover:border-red-600 hover:bg-red-900/90 flex items-center justify-center gap-3 cursor-pointer" 
            onClick={onClose}
          >
            {inputType === 'gamepad' && (
              <span className="gamepad-indicator-btn-a gp-size-medium shadow-[0_0_8px_rgba(16,185,129,0.5)]">A</span>
            )}
            <span>RETURN TO GAME</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
