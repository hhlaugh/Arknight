import { describe, expect, it } from 'vitest';
import { GACHA_CONFIG, DEFAULT_POOL, derivePoolMembers, loadGachaConfig } from './load-gacha-data';
import { VALID_CARDS } from './playerCollection';
import gachaPoolJson from './gacha-pool.json';

describe('gacha 配置契约（GACHA_PLAN_v0.3）', () => {
  it('模块加载即通过校验，关键数值与规划定稿一致', () => {
    expect(GACHA_CONFIG.schemaVersion).toBe(1);
    const economy = GACHA_CONFIG.economy;
    expect(economy.currencyId).toBe('originite');
    expect(economy.initialOriginite).toBe(6000);
    expect(economy.testAccountOriginite).toBe(999999);
    expect(economy.battleRewards).toEqual({ win: 900, lose: 300, draw: 300 });
    expect(economy.conversion).toEqual({ '4': 100, '5': 300, '6': 1200 });
    expect(economy.ownedLimit).toBe(2);
    expect(DEFAULT_POOL.poolId).toBe('standard-1');
    expect(DEFAULT_POOL.cost).toEqual({ single: 600, ten: 6000 });
    expect(DEFAULT_POOL.rates).toEqual({ sixStar: 0.02, fiveStar: 0.08 });
    expect(DEFAULT_POOL.pity).toEqual({ softPityFrom: 51, softPityStep: 0.02, hardPityAt: 99 });
  });

  it('非法配置整体拒绝，不静默修正（概率溢出样例）', () => {
    const broken = {
      ...gachaPoolJson,
      pools: [{ ...gachaPoolJson.pools[0], rates: { sixStar: 0.5, fiveStar: 0.8 } }],
    };
    const result = loadGachaConfig(broken);
    expect(result.config).toBeNull();
    expect(result.issues.some((item) => item.code === 'RATES_OVERFLOW')).toBe(true);
  });

  it('卡池成员派生：4★24 / 5★18 / 6★18，共 60 人；3★ 不进池', () => {
    const { byRarity, total } = derivePoolMembers(VALID_CARDS, DEFAULT_POOL);
    expect(total).toBe(60);
    expect(byRarity.get(4)!.length).toBe(24);
    expect(byRarity.get(5)!.length).toBe(18);
    expect(byRarity.get(6)!.length).toBe(18);
    expect(byRarity.has(3)).toBe(false);
    expect(byRarity.has(1)).toBe(false);
    expect(byRarity.has(2)).toBe(false);
  });
});
