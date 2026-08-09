import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
  colorClass?: string;
  badge?: string;
}

export interface CustomSelectProps<T extends string | number = string> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  optionClassName?: string;
  disabled?: boolean;
  align?: 'left' | 'right' | 'center';
}

export function CustomSelect<T extends string | number = string>({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select option...',
  className = '',
  buttonClassName = '',
  optionClassName = '',
  disabled = false,
  align = 'left'
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      const currentIndex = options.findIndex((opt) => opt.value === value);
      if (e.key === 'ArrowDown') {
        const nextIndex = (currentIndex + 1) % options.length;
        onChange(options[nextIndex].value);
      } else {
        const prevIndex = (currentIndex - 1 + options.length) % options.length;
        onChange(options[prevIndex].value);
      }
    }
  };

  return (
    <div className={`relative w-full text-left font-mono ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-neutral-400 font-mono uppercase text-xs font-bold mb-1.5 tracking-wider">
          {label}
        </label>
      )}

      {/* Main Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`w-full min-h-[44px] frosted-glass-ui border transition-all duration-150 rounded-none px-3 py-2.5 flex items-center justify-between gap-3 text-xs tracking-wider outline-none cursor-pointer ${
          isOpen
            ? 'border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.25)] text-white'
            : 'border-neutral-700/80 hover:border-neutral-500 text-neutral-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          <span
            className={`truncate font-bold tracking-widest ${
              selectedOption?.colorClass || 'text-neutral-200'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="text-[10px] bg-neutral-800/80 text-neutral-300 px-1.5 py-0.5 rounded-none font-mono">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="text-neutral-400 flex-shrink-0"
        >
          <ChevronDown className={`w-4 h-4 ${isOpen ? 'text-red-500' : 'text-neutral-400'}`} />
        </motion.div>
      </button>

      {/* Industrial Dropdown Options Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={`absolute left-0 right-0 mt-1 z-50 frosted-glass-ui border-2 border-red-900/90 shadow-[0_12px_32px_rgba(0,0,0,0.95),0_0_20px_rgba(153,27,27,0.3)] max-h-60 overflow-y-auto custom-scrollbar ${
              align === 'right' ? 'right-0 left-auto' : ''
            }`}
          >
            {/* Top decorative hazard accent line */}
            <div className="h-0.5 w-full bg-gradient-to-r from-red-600 via-neutral-800 to-red-600" />

            <div className="p-1 space-y-0.5">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-all duration-100 cursor-pointer ${
                      isSelected
                        ? 'bg-red-950/70 border-l-2 border-l-red-500 text-white font-bold shadow-inner'
                        : 'text-neutral-300 hover:bg-neutral-900 hover:text-white border-l-2 border-l-transparent hover:border-l-red-700/60'
                    } ${optionClassName}`}
                  >
                    <div className="flex flex-col gap-0.5 truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`truncate tracking-wider ${option.colorClass || ''}`}>
                          {option.label}
                        </span>
                        {option.badge && (
                          <span className="text-[9px] bg-red-950/80 text-red-400 border border-red-800 px-1 py-0.2 font-mono">
                            {option.badge}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <span className="text-[10px] text-neutral-400 font-sans tracking-normal font-normal">
                          {option.description}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-red-500 flex-shrink-0 ml-1 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
