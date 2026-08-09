import React, { useEffect, useState } from 'react';
import { Chamber } from '../types';
import { playBulletLoad } from '../audio';

interface CylinderProps {
  chambers: Chamber[];
  currentIndex: number;
  spinning: boolean;
}

export function Cylinder({ chambers, currentIndex, spinning }: CylinderProps) {
  const [revealedCount, setRevealedCount] = useState(chambers?.length || 0);

  useEffect(() => {
    if (spinning && chambers.length > 0) {
      setRevealedCount(0);
      let count = 0;
      const interval = setInterval(() => {
        if (count < chambers.length) {
          count++;
          setRevealedCount(count);
          playBulletLoad();
        } else {
          clearInterval(interval);
        }
      }, 250);
      return () => clearInterval(interval);
    } else {
       setRevealedCount(chambers.length);
    }
  }, [spinning, chambers]);

  if (chambers.length === 0) return null;

  const rotation = currentIndex * (360 / chambers.length);

  return (
    <div className="relative w-48 h-48 mx-auto flex items-center justify-center filter drop-shadow-[0_0_15px_rgba(255,0,0,0.1)]">
      <div 
        className={`w-40 h-40 rounded-full bg-[#111] border-4 border-[#222] relative transition-transform ${spinning ? 'duration-[2000ms] ease-out' : 'duration-500 ease-in-out'}`}
        style={{ transform: `rotate(${-rotation}deg)` }}
      >
        {/* Center pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#050505] border border-[#333] z-10 shadow-[inset_0_0_10px_black]"></div>

        {chambers.map((chamber, i) => {
          const angle = (i * (360 / chambers.length)) - 90; // -90 to start at top
          // Calculate position
          const radius = 55;
          const x = 50 + radius * Math.cos(angle * Math.PI / 180);
          const y = 50 + radius * Math.sin(angle * Math.PI / 180);

          const isVisible = i < revealedCount;
          return (
            <div 
              key={i}
              className={`absolute w-12 h-12 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 transition-all duration-300 ${chamber.isSpent ? 'bg-[#0a0a0a] border-[#222]' : 'bg-[#151515] border-[#444] shadow-[inset_0_0_15px_rgba(0,0,0,1)]'} ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {!chamber.isSpent && isVisible && (
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-yellow-700/20 to-yellow-900/40 border border-yellow-800/30"></div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Current Chamber indicator */}
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-red-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6-6 6 6"/><path d="M12 3v18"/></svg>
      </div>
    </div>
  );
}
