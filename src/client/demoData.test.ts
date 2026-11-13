import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_CARDS,
  PRESET_DECKS,
  getAllAvailableDecks,
  getCustomDecks,
  validateDeck,
} from './demoData';
import type { CardId, DeckDefinition } from '../game/types';

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

describe('demoData custom deck sanitization and validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips removed legacy DEMO-* cards from custom decks and excludes incomplete decks from battle selection', () => {
    const legacyMixedDeck: DeckDefinition = {
      deck_id: 'CUSTOM-MWABWAWC',
      deck_name_zh: '历史混合卡组',
      cards: [
        ...PRESET_DECKS[0]!.cards.slice(0, 9),
        { card_id: 'DEMO-TAC-003' as CardId, quantity: 2 },
      ],
    };
    const legacyOnlyDemoDeck: DeckDefinition = {
      deck_id: 'CUSTOM-ONLY-DEMO',
      deck_name_zh: '纯测试卡组',
      cards: [{ card_id: 'DEMO-TAC-003' as CardId, quantity: 2 }],
    };

    const storage = mockLocalStorage({
      mrfz_custom_decks: JSON.stringify([legacyMixedDeck, legacyOnlyDemoDeck]),
    });

    const loadedCustom = getCustomDecks();
    // 纯测试卡组被丢弃；混合卡组保留剩余 18 张合法干员并清除 DEMO-TAC-003
    expect(loadedCustom).toHaveLength(1);
    expect(loadedCustom[0]!.deck_id).toBe('CUSTOM-MWABWAWC');
    expect(loadedCustom[0]!.cards.some((c) => c.card_id === ('DEMO-TAC-003' as CardId))).toBe(false);
    expect(validateDeck(loadedCustom[0]!, DEMO_CARDS).totalCards).toBe(18);
    expect(validateDeck(loadedCustom[0]!, DEMO_CARDS).valid).toBe(false);

    // 清理后的数据已回写到 localStorage
    const persisted = JSON.parse(storage.getItem('mrfz_custom_decks') ?? '[]') as DeckDefinition[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.cards.every((c) => c.card_id !== ('DEMO-TAC-003' as CardId))).toBe(true);

    // 未满 20 张的自定义卡组不会出现在对战可选列表 getAllAvailableDecks 中
    const battleDecks = getAllAvailableDecks();
    expect(battleDecks.some((d) => d.deck_id === 'CUSTOM-MWABWAWC')).toBe(false);
    expect(battleDecks.length).toBe(PRESET_DECKS.length);
  });

  it('includes valid 20-card custom decks in getAllAvailableDecks', () => {
    const validCustomDeck: DeckDefinition = {
      deck_id: 'CUSTOM-VALID-20',
      deck_name_zh: '合法自定义卡组',
      cards: [...PRESET_DECKS[0]!.cards],
    };
    mockLocalStorage({
      mrfz_custom_decks: JSON.stringify([validCustomDeck]),
    });

    const battleDecks = getAllAvailableDecks();
    expect(battleDecks[0]!.deck_id).toBe('CUSTOM-VALID-20');
    expect(validateDeck(battleDecks[0]!, DEMO_CARDS).valid).toBe(true);
  });
});
