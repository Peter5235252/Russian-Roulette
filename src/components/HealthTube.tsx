import React from 'react';

interface HealthTubeProps {
  health: number;
  maxHealth: number;
  label: string;
  isPlayer?: boolean;
}

export function HealthTube({ health, maxHealth, label, isPlayer }: HealthTubeProps) {
  const percentage = Math.max(0, Math.min(100, (health / maxHealth) * 100));

  return (
    <div className={`flex flex-col gap-2 w-64 ${isPlayer ? 'items-start' : 'items-end'}`}>
      <div className="font-mono text-sm tracking-[0.2em] text-gray-400">
        {label} [{Math.round(health)}]
      </div>
      
      <div className="relative w-full h-8 frosted-glass-ui backdrop-blur-md border-2 border-red-950/80 rounded-none overflow-hidden shell">
        {/* The glass reflection */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/5 z-10 pointer-events-none"></div>
        
        {/* The blood liquid */}
        <div 
          className="absolute top-0 bottom-0 left-0 bg-[var(--color-blood)] transition-all duration-1000 ease-in-out"
          style={{ 
            width: `${percentage}%`,
            right: !isPlayer ? 0 : 'auto',
            left: isPlayer ? 0 : 'auto',
            boxShadow: '0 0 20px var(--color-gore) inset'
          }}
        >
          {/* Bubbles / noise effect could go here */}
        </div>
        
        {/* Tick marks */}
        <div className="absolute inset-0 flex justify-between px-1 z-20 opacity-30">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="w-[1px] h-full bg-white/20"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
