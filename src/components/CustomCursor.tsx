import React, { useEffect, useState, useRef } from 'react';

export const CustomCursor: React.FC = () => {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [trailPos, setTrailPos] = useState({ x: -100, y: -100 });
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const posRef = useRef({ x: -100, y: -100 });
  const trailRef = useRef({ x: -100, y: -100 });
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      setPos({ x: e.clientX, y: e.clientY });
      if (!isVisible) setIsVisible(true);

      // Check hover status
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(
          target.closest('button, a, select, input, textarea, [role="button"], .cursor-pointer, option, [data-interactive]') ||
          window.getComputedStyle(target).cursor === 'pointer'
        );
        setIsHovered(isInteractive);
      }
    };

    const handleMouseDown = () => setIsClicked(true);
    const handleMouseUp = () => setIsClicked(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    // Smooth trail loop
    const updateTrail = () => {
      const dx = posRef.current.x - trailRef.current.x;
      const dy = posRef.current.y - trailRef.current.y;
      
      trailRef.current.x += dx * 0.35;
      trailRef.current.y += dy * 0.35;
      
      setTrailPos({ x: trailRef.current.x, y: trailRef.current.y });
      animFrameRef.current = requestAnimationFrame(updateTrail);
    };

    animFrameRef.current = requestAnimationFrame(updateTrail);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden select-none">
      {/* Lagging trailing blood dot */}
      <div
        className="absolute rounded-full pointer-events-none transition-opacity duration-300"
        style={{
          left: `${trailPos.x}px`,
          top: `${trailPos.y}px`,
          width: isHovered ? '24px' : '10px',
          height: isHovered ? '24px' : '10px',
          transform: 'translate(-50%, -50%)',
          backgroundColor: isHovered ? 'rgba(220, 38, 38, 0.25)' : 'rgba(185, 28, 28, 0.35)',
          boxShadow: isHovered ? '0 0 12px rgba(239, 68, 68, 0.6)' : '0 0 6px rgba(185, 28, 28, 0.4)',
          border: isHovered ? '1px border-red-500/50' : 'none',
        }}
      />

      {/* Main Gritty Reticle Cursor */}
      <div
        className="absolute pointer-events-none transition-transform duration-75 ease-out"
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          transform: `translate(-50%, -50%) scale(${isClicked ? 0.8 : isHovered ? 1.25 : 1}) rotate(${isHovered ? '45deg' : '0deg'})`,
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_8px_rgba(220,38,38,0.7)]"
        >
          {/* Outer Segmented Ring */}
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke={isHovered ? "#ef4444" : "#7f1d1d"}
            strokeWidth="1.5"
            strokeDasharray="6 4 2 4"
            className={`transition-colors duration-200 ${isHovered ? 'animate-spin' : ''}`}
            style={{ animationDuration: '8s' }}
          />

          {/* Inner Corner Brackets / Target Locks */}
          <path
            d="M 12 8 L 8 8 L 8 12"
            stroke={isHovered ? "#f87171" : "#dc2626"}
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d="M 28 8 L 32 8 L 32 12"
            stroke={isHovered ? "#f87171" : "#dc2626"}
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d="M 12 32 L 8 32 L 8 28"
            stroke={isHovered ? "#f87171" : "#dc2626"}
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d="M 28 32 L 32 32 L 32 28"
            stroke={isHovered ? "#f87171" : "#dc2626"}
            strokeWidth="1.5"
            strokeLinecap="square"
          />

          {/* Gritty Crosshair Lines */}
          <line x1="20" y1="4" x2="20" y2="12" stroke={isHovered ? "#f87171" : "#991b1b"} strokeWidth="1.5" />
          <line x1="20" y1="28" x2="20" y2="36" stroke={isHovered ? "#f87171" : "#991b1b"} strokeWidth="1.5" />
          <line x1="4" y1="20" x2="12" y2="20" stroke={isHovered ? "#f87171" : "#991b1b"} strokeWidth="1.5" />
          <line x1="28" y1="20" x2="36" y2="20" stroke={isHovered ? "#f87171" : "#991b1b"} strokeWidth="1.5" />

          {/* Center Red Dot / Blood Drop */}
          <circle
            cx="20"
            cy="20"
            r={isClicked ? "4" : isHovered ? "3" : "2"}
            fill={isHovered ? "#ef4444" : "#dc2626"}
            className="transition-all duration-150"
          />

          {/* Blood Splatter Accents */}
          <circle cx="14" cy="11" r="0.8" fill="#7f1d1d" opacity="0.8" />
          <circle cx="27" cy="25" r="1.1" fill="#991b1b" opacity="0.9" />
          <circle cx="25" cy="13" r="0.7" fill="#7f1d1d" opacity="0.7" />
          <circle cx="11" cy="27" r="0.9" fill="#b91c1c" opacity="0.85" />
        </svg>
      </div>

      {/* Click burst ripple */}
      {isClicked && (
        <div
          className="absolute rounded-full pointer-events-none border-2 border-red-600 animate-ping"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: '36px',
            height: '36px',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
};
