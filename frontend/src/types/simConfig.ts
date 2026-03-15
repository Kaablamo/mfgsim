export interface SimConfig {
  duration: number;
  warmup_period: number;
  rng_seed?: number;
  tick_interval: number;
}

export const defaultSimConfig: SimConfig = {
  duration: 480,
  warmup_period: 0,
  tick_interval: 1,
};
