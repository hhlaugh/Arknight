import { DEFAULT_POOL } from './load-gacha-data';
import type { GachaEconomyConfig, GachaPoolConfig, GachaPoolMember } from './load-gacha-data';
import type { CardId } from '../game/types';

/**
 * 抽卡纯函数层：seed 可复现，只计算不落库（先算后演）。
 * 概率模型（standard-1）：池内 6★ 基础 2%，第 softPityFrom 抽起每抽 +2%，第 hardPityAt 抽必出；
 * 5★ 独立 8%（在未出 6★ 的部分内）；其余为 4★。池内最低 4★，十连 4★ 保底自动满足。
 */

/** mulberry32：小型确定性 PRNG，seed 重放可精确复现抽卡结果。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 当前连抽序号（自上次 6★ 起第 N 抽）的 6★ 概率。 */
export function sixStarRate(pullNumberInStreak: number, pool: GachaPoolConfig = DEFAULT_POOL): number {
  const { softPityFrom, softPityStep, hardPityAt } = pool.pity;
  if (pullNumberInStreak >= hardPityAt) return 1;
  if (pullNumberInStreak >= softPityFrom) {
    return Math.min(1, pool.rates.sixStar + softPityStep * (pullNumberInStreak - softPityFrom + 1));
  }
  return pool.rates.sixStar;
}

export interface PullConversion {
  readonly cardId: CardId;
  readonly originite: number;
}

export interface PullParams {
  readonly owned: Readonly<Record<string, number>>;
  /** 进入本次寻访前，当前池的 6★ 天井计数。 */
  readonly since6Star: number;
  readonly pool?: GachaPoolConfig;
  readonly membersByRarity: ReadonlyMap<number, readonly GachaPoolMember[]>;
  readonly economy: GachaEconomyConfig;
  readonly count: 1 | 10;
  readonly seed: number;
}

export interface PullOutcome {
  readonly results: readonly CardId[];
  readonly conversions: readonly PullConversion[];
  /** 本轮结束后的 6★ 天井计数。 */
  readonly since6Star: number;
  readonly cost: number;
  readonly originiteGained: number;
}

function pickMember(rand: () => number, members: readonly GachaPoolMember[]): GachaPoolMember {
  if (members.length === 0) throw new Error('卡池该星级没有可用干员。');
  return members[Math.floor(rand() * members.length)]!;
}

/**
 * 纯函数抽卡：不读不写存储。同一 (owned, since6Star, seed, count) 输入永远得到同一输出。
 * 持有量达到 economy.ownedLimit 的干员再次被抽到时转为合成玉（不增加库存）；
 * 同一次寻访内重复抽到也按累计持有量判定。
 */
export function performPull(params: PullParams): PullOutcome {
  const pool = params.pool ?? DEFAULT_POOL;
  const rand = mulberry32(params.seed);
  const limit = params.economy.ownedLimit;
  const tempOwned: Record<string, number> = { ...params.owned };
  let since6Star = params.since6Star;
  const results: CardId[] = [];
  const conversions: PullConversion[] = [];
  let originiteGained = 0;

  for (let i = 0; i < params.count; i += 1) {
    since6Star += 1;
    let rarity: 4 | 5 | 6 = 4;
    if (rand() < sixStarRate(since6Star, pool)) rarity = 6;
    else if (rand() < pool.rates.fiveStar) rarity = 5;
    const member = pickMember(rand, params.membersByRarity.get(rarity) ?? []);
    results.push(member.cardId);
    if ((tempOwned[member.cardId] ?? 0) >= limit) {
      const gain = params.economy.conversion[String(rarity) as '4' | '5' | '6'] ?? 0;
      conversions.push({ cardId: member.cardId, originite: gain });
      originiteGained += gain;
    } else {
      tempOwned[member.cardId] = (tempOwned[member.cardId] ?? 0) + 1;
    }
    if (rarity === 6) since6Star = 0;
  }

  const cost = params.count === 10 ? pool.cost.ten : pool.cost.single;
  return { results, conversions, since6Star, cost, originiteGained };
}
