import React from 'react';
import { ItemType } from '../types';
import { ITEM_DESCRIPTIONS } from '../gameData';

interface ItemRackProps {
  items: ItemType[];
  onUseItem?: (index: number) => void;
  disabled?: boolean;
  selectedIndex?: number;
  highlightSelected?: boolean;
}

const ITEM_ICONS: Record<ItemType, string> = {
  MIRROR: '🪞',
  PLIERS: '🔧',
  WHISKEY: '🥃',
  TOURNIQUET: '🩸',
  PENTAGRAM: '⛧',
  CIGARETTE: '🚬',
  SCALPEL: '🔪',
  DEFIBRILLATOR: '⚡',
  SYRINGE: '💉',
  RAZORBLADE: '🪒',
  MEDKIT: '🚑'
};

export function ItemRack({ items, onUseItem, disabled, selectedIndex = -1, highlightSelected = false }: ItemRackProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 p-3.5 frosted-glass-ui rounded-none overflow-x-auto max-w-full">
      {items.map((item, index) => {
        const isSelected = highlightSelected && index === selectedIndex;
        return (
          <button
            key={index}
            onClick={() => onUseItem && onUseItem(index)}
            disabled={disabled}
            className={`group relative min-w-[60px] w-15 h-15 transition-all duration-200 ease-out flex items-center justify-center text-2xl ${
              isSelected 
                ? 'frosted-glass-item-selected scale-110 z-10' 
                : 'frosted-glass-item hover:border-red-500/60 hover:bg-red-950/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
            title={ITEM_DESCRIPTIONS[item]}
          >
          <span className="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform font-sans">
            {ITEM_ICONS[item]}
          </span>
          <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 text-[10px] w-48 text-center text-gray-200 p-2.5 hidden group-hover:block z-50 frosted-glass-ui font-mono pointer-events-none shadow-2xl">
            <span className="text-red-400 font-bold block mb-1">{item === 'RAZORBLADE' ? 'RUSTY RAZORBLADE' : item}</span>
            {ITEM_DESCRIPTIONS[item]}
          </div>
        </button>
        );
      })}
    </div>
  );
}
