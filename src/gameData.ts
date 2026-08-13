import { Difficulty, ItemType } from './types';

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EXOTIC';

export interface ItemInfo {
  type: ItemType;
  name: string;
  icon: string;
  rarity: ItemRarity;
  basePrice: number;
  description: string;
}

export const ITEM_METADATA: Record<ItemType, ItemInfo> = {
  MIRROR: {
    type: 'MIRROR',
    name: 'MIRROR',
    icon: '🔍',
    rarity: 'COMMON',
    basePrice: 10,
    description: 'Peer into the chamber. See the truth before the trigger.',
  },
  PLIERS: {
    type: 'PLIERS',
    name: 'PLIERS',
    icon: '🔧',
    rarity: 'COMMON',
    basePrice: 15,
    description: 'Pry out the current shell. The chamber will be empty. Leaves you bleeding.',
  },
  WHISKEY: {
    type: 'WHISKEY',
    name: 'WHISKEY',
    icon: '🥃',
    rarity: 'COMMON',
    basePrice: 15,
    description: 'Numb the pain. Restores a small amount of vitality, blurs the mind.',
  },
  TOURNIQUET: {
    type: 'TOURNIQUET',
    name: 'TOURNIQUET',
    icon: '🩸',
    rarity: 'UNCOMMON',
    basePrice: 20,
    description: 'Stem the flow. Reduces damage from the next live round by half.',
  },
  CIGARETTE: {
    type: 'CIGARETTE',
    name: 'CIGARETTE',
    icon: '🚬',
    rarity: 'UNCOMMON',
    basePrice: 25,
    description: 'Calms nicotine cravings & steady nerves. Reduces damage taken by 30 HP for 20 seconds.',
  },
  SCALPEL: {
    type: 'SCALPEL',
    name: 'SCALPEL',
    icon: '🔪',
    rarity: 'UNCOMMON',
    basePrice: 35,
    description: 'Surgical precision. Doubles the damage of your next shot.',
  },
  DEFIBRILLATOR: {
    type: 'DEFIBRILLATOR',
    name: 'DEFIBRILLATOR',
    icon: '⚡',
    rarity: 'RARE',
    basePrice: 50,
    description: 'A violent jolt. Restores 40 HP, but permanently burns 10 Max HP.',
  },
  PENTAGRAM: {
    type: 'PENTAGRAM',
    name: 'PENTAGRAM',
    icon: '⛧',
    rarity: 'RARE',
    basePrice: 55,
    description: 'Dark bargain. Swap your health percentage with the Dealer.',
  },
  RAZORBLADE: {
    type: 'RAZORBLADE',
    name: 'RUSTY RAZORBLADE',
    icon: '🪒',
    rarity: 'EXOTIC',
    basePrice: 60,
    description: 'Flawless visceral self-mutilation. Deals 10 damage to yourself. If the chamber is a blank, it becomes LIVE. If already LIVE, its damage is doubled!',
  },
  SYRINGE: {
    type: 'SYRINGE',
    name: 'SYRINGE',
    icon: '💉',
    rarity: 'EXOTIC',
    basePrice: 75,
    description: 'Adrenaline booster. Slam into your chest to instantly restore 50 HP.',
  },
  MEDKIT: {
    type: 'MEDKIT',
    name: 'FIRST AID MEDKIT',
    icon: '🚑',
    rarity: 'EXOTIC',
    basePrice: 150,
    description: 'Advanced medical supplies. Fully restores health to maximum.',
  },
};

export const ITEM_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(ITEM_METADATA).map(([key, val]) => [key, val.description])
);

export const DIFFICULTY_PRICE_MULTIPLIERS: Record<Difficulty, number> = {
  NORMAL: 1.0,
  HARD: 1.35,
  VERY_HARD: 1.75,
  NIGHTMARE: 2.3,
};

export function getItemPrice(item: ItemType, difficulty: Difficulty = 'NORMAL'): number {
  const info = ITEM_METADATA[item];
  const base = info ? info.basePrice : 20;
  const mult = DIFFICULTY_PRICE_MULTIPLIERS[difficulty] || 1.0;
  return Math.round(base * mult);
}

export function getRarityBadgeClasses(rarity: ItemRarity): string {
  switch (rarity) {
    case 'COMMON':
      return 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40';
    case 'UNCOMMON':
      return 'text-sky-400 border-sky-800/80 bg-sky-950/40';
    case 'RARE':
      return 'text-amber-400 border-amber-800/80 bg-amber-950/40';
    case 'EXOTIC':
      return 'text-fuchsia-400 border-fuchsia-800/80 bg-fuchsia-950/40';
    default:
      return 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40';
  }
}

export function getRarityTagHtml(rarity: ItemRarity): string {
  const badgeClass = getRarityBadgeClasses(rarity);
  return `<span class="inline-block text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 border rounded ml-1.5 tracking-wider align-middle ${badgeClass}">${rarity}</span>`;
}

export interface RarityWeights {
  COMMON: number;
  UNCOMMON: number;
  RARE: number;
  EXOTIC: number;
}

export const PLAYER_DROP_WEIGHTS: Record<Difficulty, RarityWeights> = {
  NORMAL: { COMMON: 45, UNCOMMON: 35, RARE: 15, EXOTIC: 5 },
  HARD: { COMMON: 60, UNCOMMON: 25, RARE: 11, EXOTIC: 4 },
  VERY_HARD: { COMMON: 70, UNCOMMON: 20, RARE: 8, EXOTIC: 2 },
  NIGHTMARE: { COMMON: 80, UNCOMMON: 14, RARE: 5, EXOTIC: 1 },
};

export const DEALER_DROP_WEIGHTS: Record<Difficulty, RarityWeights> = {
  NORMAL: { COMMON: 45, UNCOMMON: 35, RARE: 15, EXOTIC: 5 },
  HARD: { COMMON: 35, UNCOMMON: 35, RARE: 20, EXOTIC: 10 },
  VERY_HARD: { COMMON: 25, UNCOMMON: 35, RARE: 25, EXOTIC: 15 },
  NIGHTMARE: { COMMON: 15, UNCOMMON: 30, RARE: 35, EXOTIC: 20 },
};

export function getRandomItemsByDifficulty(
  count: number,
  difficulty: Difficulty = 'NORMAL',
  recipient: 'player' | 'dealer' = 'player'
): ItemType[] {
  const weights = recipient === 'player'
    ? PLAYER_DROP_WEIGHTS[difficulty]
    : DEALER_DROP_WEIGHTS[difficulty];

  const commonItems: ItemType[] = ['MIRROR', 'PLIERS', 'WHISKEY'];
  const uncommonItems: ItemType[] = ['TOURNIQUET', 'CIGARETTE', 'SCALPEL'];
  const rareItems: ItemType[] = ['PENTAGRAM', 'DEFIBRILLATOR'];
  const exoticItems: ItemType[] = ['SYRINGE', 'RAZORBLADE', 'MEDKIT'];

  const result: ItemType[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random() * 100;
    let pool: ItemType[];

    if (roll < weights.COMMON) {
      pool = commonItems;
    } else if (roll < weights.COMMON + weights.UNCOMMON) {
      pool = uncommonItems;
    } else if (roll < weights.COMMON + weights.UNCOMMON + weights.RARE) {
      pool = rareItems;
    } else {
      pool = exoticItems;
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];
    result.push(picked);
  }

  return result;
}

export const DEADLY_QUOTES = [
  "Click or bang.",
  "Spin it.",
  "Blood is just fuel.",
  "One contains the void.",
  "Your hands are shaking.",
  "Do not hesitate.",
  "Stop overthinking."
];
