import { describe, expect, it } from 'vitest';
import { mulberry32, performPull, sixStarRate } from './recruitment';
import { DEFAULT_POOL, GACHA_CONFIG, derivePoolMembers } from './load-gacha-data';
import type { GachaPoolMember } from './load-gacha-data';
import { VALID_CARDS } from './playerCollection';

const { byRarity } = derivePoolMembers(VALID_CARDS, DEFAULT_POOL);
const economy = GACHA_CONFIG.economy;
const limit = economy.ownedLimit;

const rarityByCard = new Map<string, number>();
for (const members of byRarity.values()) {
  for (const member of members) rarityByCard.set(member.cardId, member.rarity);
}

function fullWarehouseOwned(): Record<string, number> {
  const owned: Record<string, number> = {};
  for (const members of byRarity.values()) {
    for (const member of members as readonly GachaPoolMember[]) owned[member.cardId] = limit;
  }
  return owned;
}

describe('recruitment 抽卡纯函数', () => {
  it('mulberry32 同 seed 序列完全一致且取值在 [0,1)', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('seed 重放：同输入永远同结果', () => {
    const run = (seed: number) =>
      performPull({ owned: {}, since6Star: 0, membersByRarity: byRarity, economy, count: 10, seed });
    expect(run(42)).toEqual(run(42));
    expect(run(42).results).not.toEqual(run(43).results);
  });

  it('六星概率随抽序推进：第 50 抽 2%、第 51 抽 4%、第 99 抽必出', () => {
    expect(sixStarRate(1)).toBeCloseTo(0.02);
    expect(sixStarRate(50)).toBeCloseTo(0.02);
    expect(sixStarRate(51)).toBeCloseTo(0.04);
    expect(sixStarRate(80)).toBeCloseTo(0.02 + 0.02 * 30);
    expect(sixStarRate(99)).toBe(1);
    expect(sixStarRate(150)).toBe(1);
  });

  it('费用与转化记账：满仓单抽必转化，返还值命中配置档位', () => {
    const owned = fullWarehouseOwned();
    const outcome = performPull({ owned, since6Star: 0, membersByRarity: byRarity, economy, count: 1, seed: 7 });
    expect(outcome.cost).toBe(600);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.conversions).toHaveLength(1);
    expect([100, 300, 1200]).toContain(outcome.conversions[0]!.originite);
    expect(outcome.originiteGained).toBe(outcome.conversions[0]!.originite);
  });

  it('同批寻访内累计判定：从空仓库十连，第 3 张同卡开始转化', () => {
    // 固定 seed 扫描（确定性）：找到某次十连中同一张卡出现 ≥3 次
    let found = false;
    for (let seed = 1; seed <= 500 && !found; seed += 1) {
      const outcome = performPull({ owned: {}, since6Star: 0, membersByRarity: byRarity, economy, count: 10, seed });
      const counts = new Map<string, number>();
      for (const cardId of outcome.results) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
      for (const [cardId, n] of counts) {
        if (n >= 3) {
          found = true;
          const conversionsForCard = outcome.conversions.filter((c) => c.cardId === cardId);
          expect(conversionsForCard).toHaveLength(n - 2);
          break;
        }
      }
      // 不变量：每张卡的转化数 = max(0, 出现次数 - 2)
      let expectedConversions = 0;
      for (const n of counts.values()) expectedConversions += Math.max(0, n - 2);
      expect(outcome.conversions).toHaveLength(expectedConversions);
    }
    expect(found).toBe(true);
  });

  it('10 万次模拟：5★=8%±0.5%，基础区间 6★=2%±0.5%，天井抬升整体 6★ 率', { timeout: 20000 }, () => {
    const N = 100000;
    let since6Star = 0;
    let fiveStar = 0;
    let sixStar = 0;
    let baseZonePulls = 0;
    let baseZoneSix = 0;
    const owned: Record<string, number> = {};
    let seed = 987654321;
    for (let i = 0; i < N; i += 1) {
      const outcome = performPull({ owned, since6Star, membersByRarity: byRarity, economy, count: 1, seed });
      seed += 1;
      const rarity = rarityByCard.get(outcome.results[0]!)!;
      if (rarity === 5) fiveStar += 1;
      if (rarity === 6) {
        sixStar += 1;
        if (since6Star + 1 <= 50) baseZoneSix += 1;
      }
      if (since6Star + 1 <= 50) baseZonePulls += 1;
      since6Star = outcome.since6Star;
      owned[outcome.results[0]!] = Math.min(limit, (owned[outcome.results[0]!] ?? 0) + 1);
    }
    expect(Math.abs(fiveStar / N - 0.08)).toBeLessThan(0.005);
    expect(baseZonePulls).toBeGreaterThan(N * 0.8); // 多数抽卡处于基础概率区间
    expect(Math.abs(baseZoneSix / baseZonePulls - 0.02)).toBeLessThan(0.005);
    expect(sixStar / N).toBeGreaterThan(0.02);
    expect(sixStar / N).toBeLessThan(0.04);
  });

  it('天井上限：连续未出 6★ 的最长间隔 ≤ 99 抽', { timeout: 15000 }, () => {
    let since6Star = 0;
    let maxGap = 0;
    const owned: Record<string, number> = {};
    let seed = 1;
    for (let i = 0; i < 20000; i += 1) {
      const outcome = performPull({ owned, since6Star, membersByRarity: byRarity, economy, count: 1, seed });
      seed += 1;
      if (rarityByCard.get(outcome.results[0]!) === 6) {
        maxGap = Math.max(maxGap, since6Star + 1);
        since6Star = 0;
      } else {
        since6Star = outcome.since6Star;
      }
    }
    expect(maxGap).toBeLessThanOrEqual(99);
  });

  it('通胀断言（GACHA_PLAN_v0.3 §1）：满仓状态期望返还/成本 < 25%，且 ≈138 玉/抽', { timeout: 15000 }, () => {
    const owned = fullWarehouseOwned();
    const N = 20000;
    let gained = 0;
    let cost = 0;
    let since6Star = 0;
    let seed = 555;
    for (let i = 0; i < N; i += 1) {
      const outcome = performPull({ owned, since6Star, membersByRarity: byRarity, economy, count: 1, seed });
      seed += 1;
      gained += outcome.originiteGained;
      cost += outcome.cost;
      since6Star = outcome.since6Star;
      for (const cardId of outcome.results) {
        expect((owned[cardId] ?? 0)).toBeGreaterThanOrEqual(limit); // 满仓必转化
      }
    }
    const ratio = gained / cost;
    expect(ratio).toBeLessThan(0.25);
    expect(gained / N).toBeGreaterThan(120);
    expect(gained / N).toBeLessThan(165);
  });
});
