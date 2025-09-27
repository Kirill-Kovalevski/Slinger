export type GameMode = 'P1vCPU' | 'P1vP2';

export type Phase =
  | 'present'   // intro animation
  | 'countdown' // 3..2..1
  | 'drop'      // feather falling
  | 'land'      // feather touches ring + fades
  | 'glow'      // "armed": blur on, players can fire
  | 'replay'    // slow-motion bullet replay with time delta
  | 'result';

export type Winner =
  | 'P1' | 'P2' | 'CPU' | 'None'
  | 'FalseStartP1' | 'FalseStartP2';

export interface Scores { p1: number; p2: number; }

export type GunKind = 'revolver' | 'pistol' | 'smg' | 'shotgun';

export interface Shot {
  shooter: 'P1' | 'P2' | 'CPU';
  id: number;
}

export interface RoundTimes {
  p1?: number;
  p2?: number; // P2 or CPU
  delta?: number;
}
