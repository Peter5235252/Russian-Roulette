import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { ItemType, Difficulty } from '../types';
import { ITEM_METADATA, getItemPrice, DIFFICULTY_PRICE_MULTIPLIERS, getRarityBadgeClasses } from '../gameData';
import { playPurchaseSound } from '../audio';

interface ItemShopProps {
  bloodCurrency: number;
  onBuyItem: (item: ItemType, cost: number) => void;
  onClose: () => void;
  playerItemCount: number;
  difficulty?: Difficulty;
}

const ITEMS_LIST: ItemType[] = [
  'MIRROR',
  'PLIERS',
  'WHISKEY',
  'TOURNIQUET',
  'CIGARETTE',
  'SCALPEL',
  'DEFIBRILLATOR',
  'PENTAGRAM',
  'RAZORBLADE',
  'SYRINGE'
];

export function ItemShop({
  bloodCurrency,
  onBuyItem,
  onClose,
  playerItemCount,
  difficulty = 'NORMAL'
}: ItemShopProps) {
  const [purchasedItem, setPurchasedItem] = useState<ItemType | null>(null);

  const mult = DIFFICULTY_PRICE_MULTIPLIERS[difficulty] || 1.0;
  const inflationPct = Math.round((mult - 1.0) * 100);

  const handleBuy = useCallback(
    (item: ItemType, cost: number) => {
      if (bloodCurrency >= cost && playerItemCount < 8) {
        playPurchaseSound();
        setPurchasedItem(item);
        setTimeout(() => setPurchasedItem(null), 300);
        onBuyItem(item, cost);
      }
    },
    [bloodCurrency, playerItemCount, onBuyItem]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="frosted-glass-ui border-2 border-red-950/90 p-6 sm:p-8 flex flex-col gap-6 w-full max-w-2xl shadow-[0_0_60px_rgba(0,0,0,0.95)] text-neutral-200"
      >
        <div className="flex justify-between items-end border-b border-red-950/80 pb-4">
          <div>
            <h2 className="text-red-500 font-mono tracking-widest text-2xl sm:text-3xl uppercase font-bold flex items-center gap-3">
              <span className="text-red-700">//</span>
              <span>BLACK MARKET</span>
            </h2>
            <div className="text-[10px] font-mono tracking-wider text-neutral-400 mt-1 flex items-center gap-2">
              <span className="text-neutral-500">DIFFICULTY MULTIPLIER:</span>
              <span className={inflationPct > 0 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                {difficulty} {inflationPct > 0 ? `(+${inflationPct}% INFLATION)` : '(STANDARD)'}
              </span>
            </div>
          </div>

          <div className="text-neutral-300 font-mono text-base sm:text-lg flex items-center gap-2">
            <span>BLOOD:</span>
            <span className="text-red-500 font-extrabold">{bloodCurrency}</span>
          </div>
        </div>

        <p className="text-neutral-400 font-serif italic text-xs sm:text-sm -mt-2">
          Trade the blood of the Dealer for tools of survival. High difficulties raise black market demand.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2">
          {ITEMS_LIST.map((item) => {
            const meta = ITEM_METADATA[item];
            const cost = getItemPrice(item, difficulty);
            const canAfford = bloodCurrency >= cost;
            const isFull = playerItemCount >= 8;
            const disabled = !canAfford || isFull;
            const isPurchased = purchasedItem === item;

            const badgeClass = getRarityBadgeClasses(meta.rarity);

            return (
              <button
                key={item}
                onClick={() => handleBuy(item, cost)}
                disabled={disabled}
                className={`group relative p-3 sm:p-4 flex flex-col items-center gap-2 transition-all duration-200 ${
                  isPurchased
                    ? 'frosted-glass-item-selected scale-110 z-10 shake-intense'
                    : disabled
                    ? 'frosted-glass-item opacity-40 cursor-not-allowed grayscale'
                    : 'frosted-glass-item hover:border-red-500/80 hover:bg-red-950/40 cursor-pointer active:scale-95'
                }`}
              >
                <div className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-widest uppercase border ${badgeClass}`}>
                  {meta.rarity}
                </div>

                <span className="text-3xl sm:text-4xl drop-shadow-[0_0_10px_rgba(255,0,0,0.4)]">
                  {meta.icon}
                </span>

                <div className="text-center w-full">
                  <div className="text-neutral-200 font-mono text-[10px] sm:text-xs uppercase tracking-wider font-bold mb-1 line-clamp-1">
                    {meta.name}
                  </div>
                  <div className="text-red-500 font-mono text-xs font-bold">
                    {cost} BLOOD
                  </div>
                </div>

                {/* Tooltip on hover */}
                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity frosted-glass-ui border border-red-900/60 p-2.5 text-[10px] sm:text-xs text-neutral-200 font-mono z-20 w-52 bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none text-center shadow-2xl">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-1 mb-1">
                    <span className="text-red-400 font-bold">{meta.name}</span>
                    <span className={`text-[8px] font-bold px-1 rounded border ${badgeClass}`}>{meta.rarity}</span>
                  </div>
                  <p className="text-neutral-300">{meta.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-4 sm:mt-6 pt-4 border-t border-red-950/80">
          <div className="text-xs text-red-500 font-mono uppercase font-bold tracking-wider">
            {playerItemCount >= 8 ? 'Inventory Full (8/8)' : `Inventory: ${playerItemCount}/8 Items`}
          </div>

          <button
            className="btn-rusty px-6 sm:px-8 py-2.5 sm:py-3 text-xs sm:text-sm flex gap-2 items-center frosted-glass-ui hover:bg-red-950/50 text-red-400 hover:text-red-300 font-mono uppercase tracking-widest transition-all"
            onClick={onClose}
          >
            <span>RETURN</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
