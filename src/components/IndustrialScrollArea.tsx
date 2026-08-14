import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface IndustrialScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  showSteppers?: boolean;
  alwaysShowRail?: boolean;
  railWidthClass?: string;
}

export function IndustrialScrollArea({
  children,
  className = '',
  viewportClassName = '',
  showSteppers = true,
  alwaysShowRail = true,
  railWidthClass = 'w-6 sm:w-7',
}: IndustrialScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  
  const [thumbHeight, setThumbHeight] = useState<number>(40);
  const [thumbTop, setThumbTop] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [canScroll, setCanScroll] = useState<boolean>(true);
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  const dragStartYRef = useRef<number>(0);
  const dragStartScrollTopRef = useRef<number>(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update thumb height and position based on viewport scroll state
  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const trackHeight = track?.clientHeight || clientHeight;

    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const hasOverflow = maxScroll > 2;

    setCanScroll(hasOverflow);

    if (!hasOverflow || trackHeight <= 0) {
      setThumbTop(0);
      setThumbHeight(Math.max(30, trackHeight));
      setScrollProgress(0);
      return;
    }

    // Proportional thumb height (minimum 36px so it's always easily grabbable, max trackHeight - 10)
    const ratio = clientHeight / scrollHeight;
    const calculatedHeight = Math.max(36, Math.min(trackHeight * ratio, trackHeight - 10));
    setThumbHeight(calculatedHeight);

    // Compute thumb top offset
    const maxThumbTop = Math.max(1, trackHeight - calculatedHeight);
    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    setScrollProgress(progress);
    setThumbTop(progress * maxThumbTop);
  }, []);

  // Sync on mount, resize, content mutation, and tab switches
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollState();

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });

    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }

    const mutationObserver = new MutationObserver(() => {
      updateScrollState();
    });

    mutationObserver.observe(viewport, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    const handleScroll = () => {
      if (!isDragging) {
        updateScrollState();
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });

    // Initial delayed checks to handle CSS transitions/mount animations
    const t1 = setTimeout(updateScrollState, 50);
    const t2 = setTimeout(updateScrollState, 200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [updateScrollState, isDragging, children]);

  // Window-level dragging for seamless tracking even if mouse leaves the rail
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;

      const deltaY = e.clientY - dragStartYRef.current;
      const trackHeight = track.clientHeight;
      const maxThumbTop = trackHeight - thumbHeight;

      if (maxThumbTop <= 0) return;

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      const scrollDelta = (deltaY / maxThumbTop) * maxScrollTop;

      viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, dragStartScrollTopRef.current + scrollDelta));
      updateScrollState();
    };

    const handleGlobalPointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDragging, thumbHeight, updateScrollState]);

  // Handle Drag Start
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canScroll) return;
    e.preventDefault();
    e.stopPropagation();

    const viewport = viewportRef.current;
    if (!viewport) return;

    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = viewport.scrollTop;
  };

  // Click on track to jump
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canScroll) return;
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const maxThumbTop = track.clientHeight - thumbHeight;
    const targetThumbTop = Math.max(0, Math.min(maxThumbTop, clickY - thumbHeight / 2));

    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const targetScrollTop = (targetThumbTop / maxThumbTop) * maxScrollTop;

    viewport.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  };

  // Stepper buttons (scroll up / down)
  const handleStep = (direction: 'up' | 'down') => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const stepAmount = 140;
    viewport.scrollBy({
      top: direction === 'up' ? -stepAmount : stepAmount,
      behavior: 'smooth'
    });
  };

  const startContinuousStep = (direction: 'up' | 'down') => {
    handleStep(direction);
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    stepIntervalRef.current = setInterval(() => {
      handleStep(direction);
    }, 100);
  };

  const stopContinuousStep = () => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  };

  const shouldShowRail = alwaysShowRail || canScroll;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-row items-stretch overflow-hidden select-none ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Scrollable Viewport with zero browser scrollbars */}
      <div
        ref={viewportRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar ${viewportClassName}`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>

      {/* Custom Gritty Industrial Scrollbar Rail */}
      {shouldShowRail && (
        <div className={`${railWidthClass} flex flex-col bg-[#050508] border-l-2 border-red-950/90 shrink-0 select-none z-20 shadow-[inset_2px_0_10px_rgba(0,0,0,0.95)]`}>
          {/* Top Industrial Stepper */}
          {showSteppers && (
            <button
              type="button"
              onMouseDown={() => startContinuousStep('up')}
              onMouseUp={stopContinuousStep}
              onMouseLeave={stopContinuousStep}
              disabled={!canScroll || scrollProgress <= 0.01}
              className={`h-6 sm:h-7 w-full flex items-center justify-center border-b-2 border-red-950/90 transition-all cursor-pointer select-none ${
                canScroll && scrollProgress > 0.01
                  ? 'bg-neutral-950 hover:bg-red-950 text-neutral-400 hover:text-red-200 active:bg-red-900 border-b-red-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : 'bg-[#060609] text-neutral-700 cursor-not-allowed opacity-60'
              }`}
              title="Scroll Up (Hold for continuous)"
              aria-label="Scroll Up"
            >
              <div className="relative flex items-center justify-center">
                <ChevronUp className="w-3.5 h-3.5" />
              </div>
            </button>
          )}

          {/* Stepper Rail Track */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className={`flex-1 relative cursor-pointer overflow-hidden bg-[#06060a] shadow-[inset_0_0_12px_rgba(0,0,0,0.98)] ${
              canScroll ? 'cursor-pointer' : 'cursor-default'
            }`}
            style={{
              backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 2px, transparent 8px)'
            }}
          >
            {/* Center Track Slotted Channel Guideline */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] bg-neutral-950 border-x border-red-950/40 pointer-events-none" />

            {/* Industrial Height Marker Notches */}
            <div className="absolute inset-y-0 left-0 right-0 pointer-events-none flex flex-col justify-between py-2 px-1 opacity-20 text-[7px] font-mono text-red-500 select-none">
              <span>-0</span>
              <span>-50</span>
              <span>-99</span>
            </div>

            {/* Industrial Steel Thumb */}
            <div
              onPointerDown={handlePointerDown}
              style={{
                height: `${thumbHeight}px`,
                transform: `translateY(${thumbTop}px)`,
                touchAction: 'none',
              }}
              className={`absolute left-0.5 right-0.5 transition-colors duration-75 border-2 ${
                !canScroll
                  ? 'bg-neutral-950/80 border-neutral-800 opacity-40 cursor-default'
                  : isDragging
                  ? 'bg-[#7f1d1d] border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.9),inset_0_1px_0_rgba(255,255,255,0.4)] cursor-grabbing'
                  : isHovering
                  ? 'bg-neutral-800 border-red-700/90 shadow-[0_0_12px_rgba(220,38,38,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] cursor-grab'
                  : 'bg-[#18181b] border-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_rgba(0,0,0,0.9)] cursor-grab'
              }`}
            >
              {/* Metallic knurled surface pattern */}
              <div 
                className="w-full h-full flex flex-col items-center justify-between py-1 pointer-events-none opacity-90"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 1px, transparent 1px, transparent 3px)'
                }}
              >
                {/* Top Rivet */}
                <div className={`w-1.5 h-1 ${isDragging ? 'bg-red-300' : 'bg-neutral-500'} shadow-sm`} />

                {/* Center Industrial Grip Grooves */}
                <div className="flex flex-col gap-0.5 items-center justify-center w-full px-1">
                  <div className={`w-full h-0.5 ${isDragging ? 'bg-red-200' : 'bg-neutral-400'}`} />
                  <div className={`w-full h-0.5 ${isDragging ? 'bg-red-200' : 'bg-neutral-400'}`} />
                  <div className={`w-full h-0.5 ${isDragging ? 'bg-red-200' : 'bg-neutral-400'}`} />
                </div>

                {/* Bottom Rivet */}
                <div className={`w-1.5 h-1 ${isDragging ? 'bg-red-300' : 'bg-neutral-500'} shadow-sm`} />
              </div>
            </div>
          </div>

          {/* Bottom Industrial Stepper */}
          {showSteppers && (
            <button
              type="button"
              onMouseDown={() => startContinuousStep('down')}
              onMouseUp={stopContinuousStep}
              onMouseLeave={stopContinuousStep}
              disabled={!canScroll || scrollProgress >= 0.99}
              className={`h-6 sm:h-7 w-full flex items-center justify-center border-t-2 border-red-950/90 transition-all cursor-pointer select-none ${
                canScroll && scrollProgress < 0.99
                  ? 'bg-neutral-950 hover:bg-red-950 text-neutral-400 hover:text-red-200 active:bg-red-900 border-t-red-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : 'bg-[#060609] text-neutral-700 cursor-not-allowed opacity-60'
              }`}
              title="Scroll Down (Hold for continuous)"
              aria-label="Scroll Down"
            >
              <div className="relative flex items-center justify-center">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
