import gachaPoolJson from './gacha-pool.json';
import { GACHA_SCHEMA_VERSION } from './gacha-schema';
import type { CardDefinition, CardId } from '../game/types';

/** 抽卡配置运行时校验与卡池派生（load-demo-data.ts 同纪律：原始数据保持完整，非法记录绝不静默修正）。 */

export interface GachaRatesConfig {
  readonly sixStar: number;
  readonly fiveStar: number;
}
export interface GachaPityConfig {
  readonly softPityFrom: number;
  readonly softPityStep: number;
  readonly hardPityAt: number;
}
export interface GachaPoolConfig {
  readonly poolId: string;
  readonly label: string;
  /** 进入卡池的最低星级（低于该星级的干员不进池，由初始附赠覆盖）。 */
  readonly minRarity: number;
  readonly rates: GachaRatesConfig;
  readonly cost: { readonly single: number; readonly ten: number };
  readonly pity: GachaPityConfig;
}
export interface GachaEconomyConfig {
  readonly currencyId: string;
  readonly initialOriginite: number;
  readonly testAccountOriginite: number;
  readonly battleRewards: { readonly win: number; readonly lose: number; readonly draw: number };
  readonly conversion: { readonly '4': number; readonly '5': number; readonly '6': number };
  readonly ownedLimit: number;
}
export interface GachaConfig {
  readonly schemaVersion: number;
  readonly pools: readonly GachaPoolConfig[];
  readonly economy: GachaEconomyConfig;
}

export type GachaIssueSeverity = 'error' | 'warning';
export interface GachaIssue {
  readonly severity: GachaIssueSeverity;
  readonly code: string;
  readonly message: string;
}
export interface GachaLoadResult {
  readonly config: GachaConfig | null;
  readonly issues: readonly GachaIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
function isUnitRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1;
}
function issue(issues: GachaIssue[], severity: GachaIssueSeverity, code: string, message: string): void {
  issues.push({ severity, code, message });
}

function validatePool(entry: unknown, index: number, issues: GachaIssue[]): GachaPoolConfig | null {
  if (!isRecord(entry)) {
    issue(issues, 'error', 'INVALID_POOL', `pools[${index}] 必须是对象。`);
    return null;
  }
  let valid = true;
  const poolId = entry.poolId;
  if (typeof poolId !== 'string' || poolId === '') {
    issue(issues, 'error', 'INVALID_POOL_ID', `pools[${index}].poolId 必须是非空字符串。`);
    valid = false;
  }
  if (typeof entry.label !== 'string' || entry.label === '') {
    issue(issues, 'error', 'INVALID_POOL_LABEL', `pools[${index}].label 必须是非空字符串。`);
    valid = false;
  }
  if (!isPositiveInt(entry.minRarity) || (entry.minRarity as number) > 6) {
    issue(issues, 'error', 'INVALID_MIN_RARITY', `pools[${index}].minRarity 必须是 1–6 的整数。`);
    valid = false;
  }
  let sixStar = 0;
  let fiveStar = 0;
  if (!isRecord(entry.rates)) {
    issue(issues, 'error', 'INVALID_RATES', `pools[${index}].rates 必须是对象。`);
    valid = false;
  } else {
    if (!isUnitRate(entry.rates.sixStar)) {
      issue(issues, 'error', 'INVALID_SIX_STAR_RATE', `pools[${index}].rates.sixStar 必须是 (0,1) 内的数值。`);
      valid = false;
    } else sixStar = entry.rates.sixStar;
    if (!isUnitRate(entry.rates.fiveStar)) {
      issue(issues, 'error', 'INVALID_FIVE_STAR_RATE', `pools[${index}].rates.fiveStar 必须是 (0,1) 内的数值。`);
      valid = false;
    } else fiveStar = entry.rates.fiveStar;
    if (sixStar > 0 && fiveStar > 0 && sixStar + fiveStar >= 1) {
      issue(issues, 'error', 'RATES_OVERFLOW', `pools[${index}].rates 六星+五星概率之和必须小于 1。`);
      valid = false;
    }
  }
  let single = 0;
  let ten = 0;
  if (!isRecord(entry.cost)) {
    issue(issues, 'error', 'INVALID_COST', `pools[${index}].cost 必须是对象。`);
    valid = false;
  } else {
    if (!isPositiveInt(entry.cost.single)) {
      issue(issues, 'error', 'INVALID_SINGLE_COST', `pools[${index}].cost.single 必须是正整数。`);
      valid = false;
    } else single = entry.cost.single;
    if (!isPositiveInt(entry.cost.ten)) {
      issue(issues, 'error', 'INVALID_TEN_COST', `pools[${index}].cost.ten 必须是正整数。`);
      valid = false;
    } else ten = entry.cost.ten;
    if (single > 0 && ten > 0 && ten < single) {
      issue(issues, 'error', 'TEN_COST_BELOW_SINGLE', `pools[${index}].cost.ten 不得低于 cost.single。`);
      valid = false;
    }
  }
  let softPityFrom = 0;
  let softPityStep = 0;
  let hardPityAt = 0;
  if (!isRecord(entry.pity)) {
    issue(issues, 'error', 'INVALID_PITY', `pools[${index}].pity 必须是对象。`);
    valid = false;
  } else {
    if (!isPositiveInt(entry.pity.softPityFrom) || (entry.pity.softPityFrom as number) < 2) {
      issue(issues, 'error', 'INVALID_SOFT_PITY_FROM', `pools[${index}].pity.softPityFrom 必须是不小于 2 的整数。`);
      valid = false;
    } else softPityFrom = entry.pity.softPityFrom;
    if (typeof entry.pity.softPityStep !== 'number' || !Number.isFinite(entry.pity.softPityStep) || entry.pity.softPityStep <= 0 || entry.pity.softPityStep > 1) {
      issue(issues, 'error', 'INVALID_SOFT_PITY_STEP', `pools[${index}].pity.softPityStep 必须是 (0,1] 内的数值。`);
      valid = false;
    } else softPityStep = entry.pity.softPityStep;
    if (!isPositiveInt(entry.pity.hardPityAt)) {
      issue(issues, 'error', 'INVALID_HARD_PITY_AT', `pools[${index}].pity.hardPityAt 必须是正整数。`);
      valid = false;
    } else hardPityAt = entry.pity.hardPityAt;
    if (softPityFrom > 0 && hardPityAt > 0 && hardPityAt <= softPityFrom) {
      issue(issues, 'error', 'HARD_PITY_BEFORE_SOFT', `pools[${index}].pity.hardPityAt 必须大于 softPityFrom。`);
      valid = false;
    }
  }
  if (!valid) return null;
  return {
    poolId: poolId as string,
    label: entry.label as string,
    minRarity: entry.minRarity as number,
    rates: { sixStar, fiveStar },
    cost: { single, ten },
    pity: { softPityFrom, softPityStep, hardPityAt },
  };
}

function validateEconomy(entry: unknown, issues: GachaIssue[]): GachaEconomyConfig | null {
  if (!isRecord(entry)) {
    issue(issues, 'error', 'INVALID_ECONOMY', 'economy 必须是对象。');
    return null;
  }
  let valid = true;
  if (entry.currencyId !== 'originite') {
    issue(issues, 'error', 'INVALID_CURRENCY', `economy.currencyId 目前仅支持 originite，当前 ${String(entry.currencyId)}。`);
    valid = false;
  }
  for (const field of ['initialOriginite', 'testAccountOriginite'] as const) {
    if (!isNonNegativeInt(entry[field])) {
      issue(issues, 'error', 'INVALID_ECONOMY_FIELD', `economy.${field} 必须是非负整数。`);
      valid = false;
    }
  }
  if (!isRecord(entry.battleRewards)) {
    issue(issues, 'error', 'INVALID_BATTLE_REWARDS', 'economy.battleRewards 必须是对象。');
    valid = false;
  } else {
    for (const field of ['win', 'lose', 'draw'] as const) {
      if (!isNonNegativeInt(entry.battleRewards[field])) {
        issue(issues, 'error', 'INVALID_BATTLE_REWARD', `economy.battleRewards.${field} 必须是非负整数。`);
        valid = false;
      }
    }
  }
  const conversion: Record<'4' | '5' | '6', number> = { '4': 0, '5': 0, '6': 0 };
  if (!isRecord(entry.conversion)) {
    issue(issues, 'error', 'INVALID_CONVERSION', 'economy.conversion 必须是对象。');
    valid = false;
  } else {
    for (const key of ['4', '5', '6'] as const) {
      if (!isNonNegativeInt(entry.conversion[key])) {
        issue(issues, 'error', 'INVALID_CONVERSION_VALUE', `economy.conversion["${key}"] 必须是非负整数。`);
        valid = false;
      } else conversion[key] = entry.conversion[key];
    }
  }
  if (!isPositiveInt(entry.ownedLimit)) {
    issue(issues, 'error', 'INVALID_OWNED_LIMIT', 'economy.ownedLimit 必须是正整数。');
    valid = false;
  }
  if (!valid) return null;
  return {
    currencyId: 'originite',
    initialOriginite: entry.initialOriginite as number,
    testAccountOriginite: entry.testAccountOriginite as number,
    battleRewards: {
      win: (entry.battleRewards as Record<string, number>).win!,
      lose: (entry.battleRewards as Record<string, number>).lose!,
      draw: (entry.battleRewards as Record<string, number>).draw!,
    },
    conversion,
    ownedLimit: entry.ownedLimit as number,
  };
}

export function loadGachaConfig(raw: unknown = gachaPoolJson): GachaLoadResult {
  const issues: GachaIssue[] = [];
  if (!isRecord(raw)) {
    issue(issues, 'error', 'INVALID_GACHA_ROOT', '抽卡配置根节点必须是对象。');
    return { config: null, issues };
  }
  if (raw.schemaVersion !== GACHA_SCHEMA_VERSION) {
    issue(issues, 'error', 'UNSUPPORTED_SCHEMA_VERSION', `schemaVersion 必须为 ${GACHA_SCHEMA_VERSION}，当前 ${String(raw.schemaVersion)}。`);
  }
  if (!Array.isArray(raw.pools) || raw.pools.length === 0) {
    issue(issues, 'error', 'NO_POOLS', 'pools 必须是非空数组。');
    return { config: null, issues };
  }
  const pools: GachaPoolConfig[] = [];
  for (const [index, entry] of raw.pools.entries()) {
    const pool = validatePool(entry, index, issues);
    if (pool) pools.push(pool);
  }
  const economy = validateEconomy(raw.economy, issues);
  const poolIds = new Set<string>();
  for (const pool of pools) {
    if (poolIds.has(pool.poolId)) issue(issues, 'error', 'DUPLICATE_POOL_ID', `重复 poolId：${pool.poolId}。`);
    poolIds.add(pool.poolId);
  }
  const hasError = issues.some((item) => item.severity === 'error');
  if (hasError || pools.length === 0 || !economy) return { config: null, issues };
  return { config: { schemaVersion: GACHA_SCHEMA_VERSION, pools, economy }, issues };
}

export interface GachaPoolMember {
  readonly cardId: CardId;
  readonly cardName: string;
  readonly rarity: number;
}

/** 从合法卡牌目录派生卡池成员：干员且星级 ≥ minRarity。3★ 已附赠，不进池；新干员自动入池。 */
export function derivePoolMembers(cards: readonly CardDefinition[], pool: GachaPoolConfig): {
  byRarity: ReadonlyMap<number, readonly GachaPoolMember[]>;
  total: number;
} {
  const byRarity = new Map<number, GachaPoolMember[]>();
  for (const card of cards) {
    if (card.card_type !== 'operator') continue;
    if (card.rarity < pool.minRarity) continue;
    const list = byRarity.get(card.rarity) ?? [];
    list.push({ cardId: card.card_id, cardName: card.card_name_zh, rarity: card.rarity });
    byRarity.set(card.rarity, list);
  }
  for (const list of byRarity.values()) list.sort((a, b) => a.cardId.localeCompare(b.cardId));
  const total = [...byRarity.values()].reduce((sum, list) => sum + list.length, 0);
  return { byRarity, total };
}

const loaded = loadGachaConfig();
const fatal = loaded.issues.filter((item) => item.severity === 'error');
if (fatal.length > 0 || !loaded.config) {
  throw new Error(`抽卡配置校验失败：${fatal.map((item) => `${item.code} ${item.message}`).join('；')}`);
}

export const GACHA_CONFIG: GachaConfig = loaded.config;
export const DEFAULT_POOL: GachaPoolConfig = GACHA_CONFIG.pools[0]!;
