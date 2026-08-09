export type Participant = 'player' | 'dealer';

export type Difficulty = 'NORMAL' | 'HARD' | 'VERY_HARD' | 'NIGHTMARE';

export type GameState =
  | 'MENU'
  | 'LOADING'
  | 'PLAYER_TURN'
  | 'DEALER_TURN'
  | 'SHOOTING'
  | 'ITEM_USE'
  | 'ROUND_OVER'
  | 'GAME_OVER';

export type ItemType = 'MIRROR' | 'PLIERS' | 'WHISKEY' | 'TOURNIQUET' | 'PENTAGRAM' | 'CIGARETTE' | 'SCALPEL' | 'DEFIBRILLATOR' | 'SYRINGE' | 'RAZORBLADE';

export interface Chamber {
  isLive: boolean;
  isSpent: boolean;
}

export interface PlayerState {
  health: number; // 0 to 100
  maxHealth: number;
  items: ItemType[];
}

export interface GameContextType {
  gameState: GameState;
  chambers: Chamber[];
  currentChamberIndex: number;
  player: PlayerState;
  dealer: PlayerState;
  liveRoundsInCylinder: number;
  blankRoundsInCylinder: number;
  message: string;
  subMessage: string;
  turnCount: number;
  bloodLevel: number; // Global screen blood effect
}
