export interface PoolState {
  selectedPool: string;
  ammIndex: string;
  mintA: string;
  mintB: string;
  poolReserveA: string;
  poolReserveB: string;
  poolFee?: number;
}

export interface BalancesState {
  balanceA: string;
  balanceB: string;
}

export interface UIState {
  loading: boolean;
  status: string;
}

