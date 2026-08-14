import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Cpu, Wrench, Check } from 'lucide-react';
import { GpuDetectionResult } from '../utils/hardwareDetector';

interface HardwareWarningModalProps {
  detection: GpuDetectionResult;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export function HardwareWarningModal({
  detection,
  onDismiss,
  onOpenSettings,
}: HardwareWarningModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="w-full max-w-lg border-2 border-amber-900/80 bg-[#0a050d]/96 shadow-[0_0_50px_rgba(0,0,0,0.95)] rounded-none overflow-hidden text-neutral-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-amber-950 bg-neutral-950/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 flex items-center justify-center bg-amber-950/80 border border-amber-600/80 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-amber-400 font-mono tracking-widest text-xs sm:text-sm font-extrabold uppercase flex items-center gap-1.5">
                <span>SYSTEM ADVISORY</span>
                <span className="text-neutral-500">//</span>
                <span className="text-neutral-300">GPU PROFILE</span>
              </h2>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 border border-amber-800/80 px-2 py-0.5 uppercase tracking-wider">
            {detection.isFallback ? 'SOFTWARE ADAPTER' : detection.isIntegrated ? 'INTEGRATED GPU' : 'ENTRY-LEVEL GPU'}
          </span>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-4 font-mono">
          {/* Telemetry Box */}
          <div className="bg-neutral-950/80 border border-neutral-800/90 p-3.5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2 border-b border-neutral-900 pb-2">
              <span className="text-neutral-500 uppercase tracking-wider text-[10px]">DETECTED ADAPTER</span>
              <span className="text-neutral-200 font-bold text-right truncate max-w-[280px]">
                {detection.gpuName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-neutral-900 pb-2">
              <span className="text-neutral-500 uppercase tracking-wider text-[10px]">ARCHITECTURE</span>
              <span className="text-neutral-300 text-right">
                {detection.vendor !== 'Unknown' ? detection.vendor : 'Generic'} {detection.architecture !== 'Generic' && detection.architecture !== 'Unknown' ? `(${detection.architecture})` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500 uppercase tracking-wider text-[10px]">DIAGNOSIS</span>
              <span className="text-amber-400 font-bold text-right text-[11px]">
                {detection.reason}
              </span>
            </div>
          </div>

          {/* Minimalist Advisory Paragraph */}
          <div className="space-y-2 text-xs text-neutral-300 leading-relaxed font-sans">
            <p>
              This game is <span className="text-amber-400 font-bold font-mono">HIGHLY DEMANDING</span> and features real-time 3D lighting, screen-space reflections, compute shader physics, and post-processing passes.
            </p>
            <p className="text-neutral-400 text-[11px]">
              Graphics are locked to the <span className="text-neutral-200 font-mono font-bold">Low</span> preset to maintain playable framerates on integrated and entry-level hardware while maintaining artistic integrity. <span className="text-amber-400 font-mono">WebGPU Spatial Upscaling (FSR 1.0)</span> and sharpening remain fully customizable in Settings. Even with these optimizations, performance may be suboptimal.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={onDismiss}
              className="btn-rusty px-4 py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-2 border-amber-900/60 hover:border-amber-500 text-amber-200 bg-neutral-900 hover:bg-amber-950/80 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-amber-400" />
              <span>ACKNOWLEDGE & PROCEED</span>
            </button>

            <button
              onClick={() => {
                onDismiss();
                onOpenSettings();
              }}
              className="btn-rusty px-4 py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-2 border-neutral-700 hover:border-red-600 text-neutral-300 hover:text-white bg-neutral-900 hover:bg-red-950/80 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5 text-neutral-400" />
              <span>ADJUST SETTINGS</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
