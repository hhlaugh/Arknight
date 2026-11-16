import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNTS_STORAGE_KEY,
  LEGACY_CUSTOM_DECKS_KEY,
  addOriginiteToActive,
  applyPullOutcome,
  awardBattleReward,
  buildInitialCollection,
  buildTestCollection,
  createAccount,
  ensureAccountsStore,
  exportAccountsJson,
  getActiveAccountName,
  getActiveCollection,
  getDeckMode,
  importAccountsJson,
  isTestAccount,
  listAccounts,
  setActiveAccount,
  setDeckMode,
} from './player-collection';
import { performPull } from './recruitment';
import { DEFAULT_POOL, GACHA_CONFIG, derivePoolMembers } from './load-gacha-data';
import { VALID_CARDS } from './player-collection';
import type { DeckDefinition } from '../game/types';

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('playerCollection 账户存档层（GACHA_PLAN_v0.3 方案 A）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('引导：默认账户 + hhlaugh-1/hhlaugh-2 全解锁测试账户', () => {
    mockLocalStorage();
    const store = ensureAccountsStore();
    expect(Object.keys(store.accounts).sort()).toEqual(['hhlaugh-1', 'hhlaugh-2', '指挥官']);
    expect(store.active).toBe('指挥官');
    expect(store.accounts['hhlaugh-1']!.isTest).toBe(true);
    expect(store.accounts['hhlaugh-2']!.isTest).toBe(true);
    expect(isTestAccount()).toBe(false);
    expect(isTestAccount('hhlaugh-1')).toBe(true);
  });

  it('初始授予：3★ 干员全量 ×2 + 6000 合成玉；测试账户全卡 ×2 + 999999 玉', () => {
    mockLocalStorage();
    const initial = buildInitialCollection();
    const threeStar = VALID_CARDS.filter((card) => card.card_type === 'operator' && card.rarity < 4);
    expect(threeStar.length).toBe(12);
    expect(Object.keys(initial.owned)).toHaveLength(12);
    expect(Object.values(initial.owned).every((count) => count === 2)).toBe(true);
    expect(initial.currency.originite).toBe(6000);

    const test = buildTestCollection();
    expect(Object.keys(test.owned)).toHaveLength(VALID_CARDS.length);
    expect(Object.values(test.owned).every((count) => count === 2)).toBe(true);
    expect(test.currency.originite).toBe(999999);
  });

  it('旧自定义牌组（mrfz_custom_decks）迁入活跃账户并移除旧键', () => {
    const legacyDeck: DeckDefinition = {
      deck_id: 'CUSTOM-LEGACY-01',
      deck_name_zh: '历史自定义卡组',
      cards: [{ card_id: 'OP-VAN-001', quantity: 2 }],
    };
    const storage = mockLocalStorage({ mrfz_custom_decks: JSON.stringify([legacyDeck]) });
    const store = ensureAccountsStore();
    expect(store.accounts[store.active]!.customDecks).toHaveLength(1);
    expect(store.accounts[store.active]!.customDecks[0]!.deck_id).toBe('CUSTOM-LEGACY-01');
    expect(storage.getItem(LEGACY_CUSTOM_DECKS_KEY)).toBeNull();
  });

  it('快照恢复：主档损坏时从最近快照恢复', () => {
    const storage = mockLocalStorage();
    ensureAccountsStore();
    addOriginiteToActive(900);
    expect(getActiveCollection().currency.originite).toBe(6900);
    storage.setItem(ACCOUNTS_STORAGE_KEY, '{broken json');
    const recovered = ensureAccountsStore();
    expect(recovered.accounts[recovered.active]!.currency.originite).toBe(6900);
  });

  it('导出/导入往返；非法导入被拒绝且不动现档', () => {
    mockLocalStorage();
    addOriginiteToActive(-100);
    const before = getActiveCollection().currency.originite;
    expect(importAccountsJson('not json')).toEqual({ ok: false, error: expect.any(String) });
    expect(importAccountsJson(JSON.stringify({ schemaVersion: 9, active: 'x', accounts: {} }))).toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(getActiveCollection().currency.originite).toBe(before);

    const json = exportAccountsJson();
    const result = importAccountsJson(json);
    expect(result.ok).toBe(true);
    expect(result.accountCount).toBe(listAccounts().length);
    expect(getActiveCollection().currency.originite).toBe(before);
  });

  it('新建/切换账户；结算奖励按结果档位发放', () => {
    mockLocalStorage();
    expect(createAccount('  小A  ').ok).toBe(true);
    expect(getActiveAccountName()).toBe('小A');
    expect(createAccount('小A').ok).toBe(false);
    expect(awardBattleReward('win')).toBe(900);
    expect(getActiveCollection().currency.originite).toBe(6900);
    expect(awardBattleReward('draw')).toBe(300);
    expect(getActiveCollection().currency.originite).toBe(7200);
    expect(() => setActiveAccount('不存在的账户')).toThrow();
    setActiveAccount('指挥官');
    expect(getActiveAccountName()).toBe('指挥官');
    expect(isTestAccount()).toBe(false);
  });

  it('构筑模式：默认收录模式，可切换自由构筑', () => {
    mockLocalStorage();
    expect(getDeckMode()).toBe('collection');
    setDeckMode('free');
    expect(getDeckMode()).toBe('free');
    setDeckMode('collection');
    expect(getDeckMode()).toBe('collection');
  });

  it('applyPullOutcome：扣费、转化入账、天井更新、历史滚动、库存上限', () => {
    mockLocalStorage();
    const { byRarity } = derivePoolMembers(VALID_CARDS, DEFAULT_POOL);
    const outcome = performPull({
      owned: {},
      since6Star: 3,
      membersByRarity: byRarity,
      economy: GACHA_CONFIG.economy,
      count: 10,
      seed: 314159,
    });
    applyPullOutcome(outcome, DEFAULT_POOL.poolId, 314159, 10);
    const collection = getActiveCollection();
    expect(collection.currency.originite).toBe(6000 - outcome.cost + outcome.originiteGained);
    expect(collection.pity[DEFAULT_POOL.poolId]!.since6Star).toBe(outcome.since6Star);
    expect(collection.pullHistory).toHaveLength(1);
    expect(collection.pullHistory[0]!.seed).toBe(314159);
    expect(collection.pullHistory[0]!.results).toEqual(outcome.results);
    expect(collection.pullHistory[0]!.conversions).toEqual(outcome.conversions);
    for (const count of Object.values(collection.owned)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});
