/** Numbers behind the six upgrades. Part of the live tuning object (`?dev` panel). */
export interface UpgradeTuning {
  /** Explosive fragments: a break also breaks live clays within this radius. */
  explosiveRadius: number;
  /** Chain shatter: arc to the nearest live clay within this radius, up to `chainLinks` times. */
  chainRadius: number;
  chainLinks: number;
  /** Synergy Shrapnel Storm: extra chain range (fraction). */
  synergyChainBonus: number;
  /** Slug: pattern radius multiplier, shot flight-time multiplier (<1 = faster), score multiplier. */
  slugRadiusMul: number;
  slugTimeMul: number;
  slugScoreMul: number;
  /** Curse: pattern radius multiplier and score multiplier. */
  curseRadiusMul: number;
  curseScoreMul: number;
  /** Wind gusts: lateral acceleration range (units / s^2), gust length and gap ranges (s). */
  windAccelMin: number;
  windAccelMax: number;
  windGustMin: number;
  windGustMax: number;
  windGapMin: number;
  windGapMax: number;
  /** Seconds the streaks show before a gust starts. */
  windTelegraph: number;
  /** Heavier gravity multiplier (launch speed is scaled by its square root). */
  gravityMul: number;
}

export const defaultUpgradeTuning: Readonly<UpgradeTuning> = {
  explosiveRadius: 11,
  chainRadius: 17,
  chainLinks: 3,
  synergyChainBonus: 0.25,
  slugRadiusMul: 0.4,
  slugTimeMul: 0.6,
  slugScoreMul: 1.5,
  curseRadiusMul: 0.7,
  curseScoreMul: 2,
  windAccelMin: 9,
  windAccelMax: 15,
  windGustMin: 1.0,
  windGustMax: 2.0,
  windGapMin: 1.0,
  windGapMax: 2.6,
  windTelegraph: 0.5,
  gravityMul: 1.5,
};
