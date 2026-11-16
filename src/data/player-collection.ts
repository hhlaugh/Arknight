import cardPoolJson from './card-pool.json';
import { loadDemoData } from './load-card-data';
import { GACHA_CONFIG, DEFAULT_POOL } from './load-gacha-data';
import type { PullOutcome } from './recruitment';
import { DECK_MODES } from './gacha-schema';
import type { CardDefinition, CardId, DeckDefinition } from '../game/types';

/**
 * 账户存档层（GACHA_PLAN_v0.3 §6 方案 A）：
 * - localStorage 主存 arknights_accounts_v1（多账户单档）+ 快照最近 3 份（arknight_accounts_snapshots_v1）。
 * - 主档损坏时按快照从新到旧恢复；均不可用时引导初始化（默认账户 + hhlaugh-1/2 全解锁测试账户）。
 * - 旧版自定义牌组（mrfz_custom_decks）引导时原样迁入活跃账户，成功后移除旧键。
 * - 所有 localStorage 读写集中在本文件；无 localStorage 环境（SSR/测试）自动降级为内存存储。
 */

export const ACCOUNTS_STORAGE_KEY = 'arknight_accounts_v1';
export const SNAPSHOTS_STORAGE_KEY = 'arknight_accounts_snapshots_v1';
export const DECK_MODE_STORAGE_KEY = 'arknight_deck_mode';
export const LEGACY_CUSTOM_DECKS_KEY = 'mrfz_custom_decks';
export const DEFAULT_ACCOUNT_NAME = '指挥官';
export const TEST_ACCOUNT_NAMES = ['hhlaugh-1', 'hhlaugh-2'] as const;
export const SNAPSHOT_LIMIT = 3;
export const PULL_HISTORY_LIMIT = 200;

export type DeckMode = (typeof DECK_MODES)[number];

export interface PullRecord {
  readonly id: string;
  readonly ts: number;
  readonly seed: number;
  readonly poolId: string;
  readonly count: number;
  readonly cost: number;
  readonly results: readonly CardId[];
  readonly conversions: readonly { readonly cardId: CardId; readonly originite: number }[];
}

export interface Collection {
  readonly isTest?: boolean;
  /** cardId → 持有数量；上限 economy.ownedLimit，超出部分寻访时自动转化为合成玉。 */
  readonly owned: Readonly<Record<string, number>>;
  readonly currency: { readonly originite: number };
  readonly pity: Readonly<Record<string, { readonly since6Star: number }>>;
  readonly pullHistory: readonly PullRecord[];
  readonly customDecks: readonly DeckDefinition[];
  readonly createdAt: number;
}

export interface AccountsStore {
  readonly schemaVersion: number;
  readonly active: string;
  readonly accounts: Readonly<Record<string, Collection>>;
}

export interface AccountSummary {
  readonly name: string;
  readonly isTest: boolean;
  readonly originite: number;
  readonly ownedKinds: number;
}

const demoLoad = loadDemoData(cardPoolJson);
const demoErrors = demoLoad.issues.filter((item) => item.severity === 'error');
if (demoErrors.length > 0) {
  throw new Error(`Demo 数据校验失败：${demoErrors.map((item) => `${item.code} ${item.message}`).join('；')}`);
}
/** 唯一合法卡源（loadDemoData().validCards）：初始授予与卡池派生均以此为基准。 */
export const VALID_CARDS: readonly CardDefinition[] = demoLoad.validCards;

// ---------------------------------------------------------------------------
// 存储 KV 抽象：优先 localStorage，不可用（SSR/测试/配额满）时降级为内存 Map。
// ---------------------------------------------------------------------------

const memoryKv = new Map<string, string>();

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function kvGet(key: string): string | null {
  const ls = getLocalStorage();
  if (ls) {
    try {
      return ls.getItem(key);
    } catch {
      // fall through to memory
    }
  }
  return memoryKv.get(key) ?? null;
}

function kvSet(key: string, value: string): void {
  const ls = getLocalStorage();
  if (ls) {
    try {
      ls.setItem(key, value);
      memoryKv.delete(key);
      return;
    } catch {
      // quota/security error: fall through to memory
    }
  }
  memoryKv.set(key, value);
}

function kvRemove(key: string): void {
  const ls = getLocalStorage();
  if (ls) {
    try {
      ls.removeItem(key);
    } catch {
      // ignore
    }
  }
  memoryKv.delete(key);
}

// ---------------------------------------------------------------------------
// 初始授予（GACHA_PLAN_v0.3 §3）：新账户 3★ 全量 ×2 + 非干员卡全量附赠 + 6000 玉；
// 测试账户全卡 ×2 + 999999 玉。
// ---------------------------------------------------------------------------

export function buildInitialCollection(cardPool: readonly CardDefinition[] = VALID_CARDS): Collection {
  const owned: Record<string, number> = {};
  const limit = GACHA_CONFIG.economy.ownedLimit;
  for (const card of cardPool) {
    if (card.card_type !== 'operator' || card.rarity < 4) owned[card.card_id] = limit;
  }
  return {
    owned,
    currency: { originite: GACHA_CONFIG.economy.initialOriginite },
    pity: { [DEFAULT_POOL.poolId]: { since6Star: 0 } },
    pullHistory: [],
    customDecks: [],
    createdAt: Date.now(),
  };
}

export function buildTestCollection(cardPool: readonly CardDefinition[] = VALID_CARDS): Collection {
  const owned: Record<string, number> = {};
  const limit = GACHA_CONFIG.economy.ownedLimit;
  for (const card of cardPool) owned[card.card_id] = limit;
  return {
    isTest: true,
    owned,
    currency: { originite: GACHA_CONFIG.economy.testAccountOriginite },
    pity: { [DEFAULT_POOL.poolId]: { since6Star: 0 } },
    pullHistory: [],
    customDecks: [],
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// 存档校验（严格：非法档不修正、不静默洗数据，直接判废走快照/引导恢复）。
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateDeckShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.deck_id !== 'string' || value.deck_id === '') return false;
  if (typeof value.deck_name_zh !== 'string') return false;
  if (!Array.isArray(value.cards)) return false;
  const limit = GACHA_CONFIG.economy.ownedLimit;
  return value.cards.every((item) =>
    isRecord(item) &&
    typeof item.card_id === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= limit,
  );
}

function validateCollection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.isTest !== undefined && typeof value.isTest !== 'boolean') return false;
  if (!isRecord(value.owned)) return false;
  const limit = GACHA_CONFIG.economy.ownedLimit;
  for (const count of Object.values(value.owned)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > limit) return false;
  }
  if (!isRecord(value.currency) || !isNonNegativeInt(value.currency.originite)) return false;
  if (!isRecord(value.pity)) return false;
  for (const pity of Object.values(value.pity)) {
    if (!isRecord(pity) || !isNonNegativeInt(pity.since6Star)) return false;
  }
  if (!Array.isArray(value.pullHistory)) return false;
  for (const record of value.pullHistory) {
    if (!isRecord(record)) return false;
    if (typeof record.id !== 'string' || typeof record.ts !== 'number') return false;
    if (!Number.isFinite(record.seed) || typeof record.poolId !== 'string') return false;
    if (record.count !== 1 && record.count !== 10) return false;
    if (!isNonNegativeInt(record.cost)) return false;
    if (!Array.isArray(record.results) || !record.results.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(record.conversions)) return false;
    for (const conversion of record.conversions) {
      if (!isRecord(conversion) || typeof conversion.cardId !== 'string' || !isNonNegativeInt(conversion.originite)) return false;
    }
  }
  if (!Array.isArray(value.customDecks) || !value.customDecks.every(validateDeckShape)) return false;
  return isNonNegativeInt(value.createdAt);
}

/** 严格校验原始存档；合法返回 AccountsStore，否则返回 null（绝不修正）。 */
export function validateAccountsStore(raw: unknown): AccountsStore | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  if (typeof raw.active !== 'string' || raw.active === '') return null;
  if (!isRecord(raw.accounts)) return null;
  const accountNames = Object.keys(raw.accounts);
  if (accountNames.length === 0) return null;
  if (!(raw.active in raw.accounts)) return null;
  for (const collection of Object.values(raw.accounts)) {
    if (!validateCollection(collection)) return null;
  }
  return raw as unknown as AccountsStore;
}

// ---------------------------------------------------------------------------
// 读写 + 快照（每次成功保存后轮转保留最近 SNAPSHOT_LIMIT 份）。
// ---------------------------------------------------------------------------

function readSnapshots(): string[] {
  const raw = kvGet(SNAPSHOTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function persistStore(store: AccountsStore): void {
  const serialized = JSON.stringify(store);
  kvSet(ACCOUNTS_STORAGE_KEY, serialized);
  const snapshots = [...readSnapshots(), serialized].slice(-SNAPSHOT_LIMIT);
  kvSet(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
}

function readLegacyCustomDecks(): DeckDefinition[] {
  const raw = kvGet(LEGACY_CUSTOM_DECKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const limit = GACHA_CONFIG.economy.ownedLimit;
    const decks: DeckDefinition[] = [];
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.deck_id !== 'string' || !Array.isArray(item.cards)) continue;
      const cards = item.cards
        .filter((card): card is { card_id: CardId; quantity: number } =>
          isRecord(card) && typeof card.card_id === 'string' && typeof card.quantity === 'number' &&
          Number.isInteger(card.quantity) && card.quantity >= 1 && card.quantity <= limit)
        .map((card) => ({ card_id: card.card_id, quantity: card.quantity }));
      decks.push({
        deck_id: item.deck_id,
        deck_name_zh: typeof item.deck_name_zh === 'string' && item.deck_name_zh.trim() ? item.deck_name_zh : '自定义卡组',
        cards,
      });
    }
    return decks;
  } catch {
    return [];
  }
}

function bootstrapStore(): { store: AccountsStore; migratedLegacyDecks: boolean } {
  const accounts: Record<string, Collection> = {};
  let active = DEFAULT_ACCOUNT_NAME;
  accounts[active] = buildInitialCollection();
  for (const name of TEST_ACCOUNT_NAMES) {
    if (!(name in accounts)) accounts[name] = buildTestCollection();
  }
  let migratedLegacyDecks = false;
  const legacyDecks = readLegacyCustomDecks();
  if (legacyDecks.length > 0) {
    const target = accounts[active]!;
    accounts[active] = { ...target, customDecks: [...legacyDecks, ...target.customDecks] };
    migratedLegacyDecks = true;
  }
  return { store: { schemaVersion: 1, active, accounts }, migratedLegacyDecks };
}

export function ensureAccountsStore(): AccountsStore {
  const raw = kvGet(ACCOUNTS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = validateAccountsStore(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // corrupt JSON: fall through to snapshots
    }
  }
  for (const snapshot of [...readSnapshots()].reverse()) {
    try {
      const parsed = validateAccountsStore(JSON.parse(snapshot));
      if (parsed) {
        persistStore(parsed);
        return parsed;
      }
    } catch {
      // try next snapshot
    }
  }
  const { store, migratedLegacyDecks } = bootstrapStore();
  persistStore(store);
  if (migratedLegacyDecks) kvRemove(LEGACY_CUSTOM_DECKS_KEY);
  return store;
}

// ---------------------------------------------------------------------------
// 账户操作。
// ---------------------------------------------------------------------------

export function getActiveAccountName(): string {
  return ensureAccountsStore().active;
}

export function getActiveCollection(): Collection {
  const store = ensureAccountsStore();
  return store.accounts[store.active]!;
}

export function isTestAccount(name: string = getActiveAccountName()): boolean {
  return ensureAccountsStore().accounts[name]?.isTest === true;
}

export function listAccounts(): AccountSummary[] {
  const store = ensureAccountsStore();
  return Object.entries(store.accounts).map(([name, collection]) => ({
    name,
    isTest: collection.isTest === true,
    originite: collection.currency.originite,
    ownedKinds: Object.keys(collection.owned).length,
  }));
}

export function setActiveAccount(name: string): void {
  const store = ensureAccountsStore();
  if (!(name in store.accounts)) throw new Error(`账户「${name}」不存在。`);
  persistStore({ ...store, active: name });
}

export function createAccount(name: string): { ok: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: '账户名不能为空。' };
  if (trimmed.length > 24) return { ok: false, error: '账户名最长 24 个字符。' };
  const store = ensureAccountsStore();
  if (trimmed in store.accounts) return { ok: false, error: `账户「${trimmed}」已存在。` };
  persistStore({
    ...store,
    active: trimmed,
    accounts: { ...store.accounts, [trimmed]: buildInitialCollection() },
  });
  return { ok: true };
}

export function mutateActiveCollection(mutator: (collection: Collection) => Collection): Collection {
  const store = ensureAccountsStore();
  const current = store.accounts[store.active];
  if (!current) throw new Error(`活跃账户「${store.active}」不存在。`);
  const next = mutator(current);
  persistStore({ ...store, active: store.active, accounts: { ...store.accounts, [store.active]: next } });
  return next;
}

export function addOriginiteToActive(amount: number): number {
  if (!Number.isInteger(amount) || amount === 0) throw new Error('合成玉变动必须是非零整数。');
  const next = mutateActiveCollection((collection) => ({
    ...collection,
    currency: { originite: Math.max(0, collection.currency.originite + amount) },
  }));
  return next.currency.originite;
}

/** 结算页对战奖励：按结果档位给活跃账户发放合成玉，返回实际发放数额。 */
export function awardBattleReward(result: 'win' | 'lose' | 'draw'): number {
  const amount = GACHA_CONFIG.economy.battleRewards[result];
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  addOriginiteToActive(amount);
  return amount;
}

// ---------------------------------------------------------------------------
// 寻访结果落库（先算后演：recruitment.performPull 产出结果，这里才写存档）。
// ---------------------------------------------------------------------------

export function applyPullOutcome(outcome: PullOutcome, poolId: string, seed: number, count: 1 | 10): Collection {
  const limit = GACHA_CONFIG.economy.ownedLimit;
  return mutateActiveCollection((collection) => {
    const owned: Record<string, number> = { ...collection.owned };
    for (const cardId of outcome.results) {
      // 转化卡不增加库存（performPull 已判定，此处按相同规则幂等复核）
      if ((owned[cardId] ?? 0) < limit) owned[cardId] = (owned[cardId] ?? 0) + 1;
    }
    const record: PullRecord = {
      id: `${Date.now().toString(36)}-${seed.toString(36)}`,
      ts: Date.now(),
      seed,
      poolId,
      count,
      cost: outcome.cost,
      results: outcome.results,
      conversions: outcome.conversions,
    };
    return {
      ...collection,
      owned,
      currency: { originite: Math.max(0, collection.currency.originite - outcome.cost + outcome.originiteGained) },
      pity: { ...collection.pity, [poolId]: { since6Star: outcome.since6Star } },
      pullHistory: [record, ...collection.pullHistory].slice(0, PULL_HISTORY_LIMIT),
    };
  });
}

// ---------------------------------------------------------------------------
// 自定义牌组（账户内）。demoData.ts 的读写委托到这里。
// ---------------------------------------------------------------------------

export function getAccountCustomDecks(): DeckDefinition[] {
  const store = ensureAccountsStore();
  return [...(store.accounts[store.active]?.customDecks ?? [])];
}

export function saveAccountCustomDecks(decks: readonly DeckDefinition[]): void {
  mutateActiveCollection((collection) => ({ ...collection, customDecks: [...decks] }));
}

// ---------------------------------------------------------------------------
// 构筑模式（全局偏好：collection 收录（默认）/ free 自由构筑）。
// ---------------------------------------------------------------------------

export function getDeckMode(): DeckMode {
  const raw = kvGet(DECK_MODE_STORAGE_KEY);
  return raw === 'free' ? 'free' : 'collection';
}

export function setDeckMode(mode: DeckMode): void {
  if (!DECK_MODES.includes(mode)) throw new Error(`未知构筑模式：${String(mode)}`);
  kvSet(DECK_MODE_STORAGE_KEY, mode);
}

// ---------------------------------------------------------------------------
// 导出 / 导入（方案 A 备份路径）。
// ---------------------------------------------------------------------------

export function exportAccountsJson(): string {
  return JSON.stringify(ensureAccountsStore(), null, 2);
}

export function importAccountsJson(text: string): { ok: boolean; error?: string; accountCount?: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '存档文件不是合法 JSON。' };
  }
  const validated = validateAccountsStore(parsed);
  if (!validated) return { ok: false, error: '存档格式校验失败：缺少必要字段或数据非法，已放弃导入（现有存档未改动）。' };
  persistStore(validated);
  return { ok: true, accountCount: Object.keys(validated.accounts).length };
}
