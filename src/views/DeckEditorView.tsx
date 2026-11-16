import React, { useMemo, useState } from 'react';
import {
  CARD_BY_ID,
  CLASS_COLOR,
  CLASS_LABEL,
  DEMO_CARDS,
  PRESET_DECKS,
  deleteCustomDeck,
  getCustomDecks,
  saveCustomDeck,
  validateDeck,
  validateDeckWithOwnership,
  type UiCardDefinition,
} from '../client/demoData';
import { getActiveCollection, getDeckMode, setDeckMode } from '../data/playerCollection';
import type { DeckMode } from '../data/playerCollection';
import type { CardId, DeckDefinition } from '../game/types';
import { getCardPresentation } from '../data/card-presentation';
import { OperatorPortrait } from '../components/cards/OperatorPortrait';
import { CardFrame } from '../components/cards/CardFrame';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { BottomSheet } from '../components/ui/BottomSheet';

interface DeckEditorViewProps {
  readonly onBack: () => void;
  readonly initialDeckId?: string;
}

const PROFESSION_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'vanguard', label: '先锋' },
  { id: 'guard', label: '近卫' },
  { id: 'defender', label: '重装' },
  { id: 'sniper', label: '狙击' },
  { id: 'caster', label: '术师' },
  { id: 'medic', label: '医疗' },
  { id: 'supporter', label: '辅助' },
  { id: 'specialist', label: '特种' },
] as const;

type TraitFilter = 'all' | 'melee' | 'ranged' | 'front_only' | 'back_only' | 'floating';
type SortMode = 'rarity-desc' | 'cost-asc' | 'cost-desc' | 'atk-desc' | 'hp-desc' | 'name';

function getCardClassInfo(card: UiCardDefinition | { card_type: string; class?: string }) {
  const c = (card.card_type === 'operator' && card.class ? card.class : card.card_type) || 'vanguard';
  return {
    key: c,
    label: CLASS_LABEL[c] ?? c,
    color: CLASS_COLOR[c] ?? '#94a3b8',
  };
}

function serializeDeckSignature(deck: DeckDefinition): string {
  const normalizedCards = [...deck.cards]
    .sort((a, b) => a.card_id.localeCompare(b.card_id))
    .map((c) => `${c.card_id}:${c.quantity}`)
    .join(',');
  return `${deck.deck_name_zh.trim()}|${normalizedCards}`;
}

export function DeckEditorView({ onBack, initialDeckId }: DeckEditorViewProps) {
  const [customDecks, setCustomDecks] = useState<DeckDefinition[]>(() => getCustomDecks());

  const [currentDeck, setCurrentDeck] = useState<DeckDefinition>(() => {
    const all = [...getCustomDecks(), ...PRESET_DECKS];
    if (initialDeckId) {
      const match = all.find((d) => d.deck_id === initialDeckId);
      if (match) return JSON.parse(JSON.stringify(match));
    }
    if (all[0]) {
      const first = all[0];
      if (first.deck_id.startsWith('CUSTOM-')) {
        return JSON.parse(JSON.stringify(first));
      }
      return {
        deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
        deck_name_zh: `${first.deck_name_zh} (自定义)`,
        cards: JSON.parse(JSON.stringify(first.cards)),
      };
    }
    return {
      deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      deck_name_zh: '我的自定义卡组',
      cards: [],
    };
  });

  // Track last saved signature to detect unsaved edits cleanly
  const [savedSignature, setSavedSignature] = useState<string>(() => {
    const saved = getCustomDecks().find((d) => d.deck_id === currentDeck.deck_id);
    return saved ? serializeDeckSignature(saved) : '';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedCost, setSelectedCost] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedTrait, setSelectedTrait] = useState<TraitFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('rarity-desc');

  const [inspectCard, setInspectCard] = useState<UiCardDefinition | null>(
    () => (DEMO_CARDS[0] as UiCardDefinition | undefined) ?? null,
  );
  const [showDesktopInspector, setShowDesktopInspector] = useState(true);
  const [mobileInspectCard, setMobileInspectCard] = useState<UiCardDefinition | null>(null);

  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'deck'>('catalog');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deckMode, setDeckModeState] = useState<DeckMode>(() => getDeckMode());
  // 持有量快照：进入构筑器/切换模式时刷新（寻访收录发生在其他视图）。
  const [owned, setOwned] = useState<Readonly<Record<string, number>>>(() => getActiveCollection().owned);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const toggleDeckMode = (next: DeckMode) => {
    setDeckMode(next);
    setDeckModeState(next);
    setOwned(getActiveCollection().owned);
    showNotice(next === 'collection' ? '已切换到收录模式：只能使用已持有干员，同名张数受持有量限制' : '已切换到自由构筑：全量 72 干员可用');
  };

  const validation = useMemo(
    () =>
      deckMode === 'collection'
        ? validateDeckWithOwnership(currentDeck, DEMO_CARDS, owned)
        : validateDeck(currentDeck, DEMO_CARDS),
    [currentDeck, deckMode, owned],
  );
  const isDirty = useMemo(() => serializeDeckSignature(currentDeck) !== savedSignature, [currentDeck, savedSignature]);
  const isCustomDeckSaved = useMemo(
    () => customDecks.some((d) => d.deck_id === currentDeck.deck_id),
    [customDecks, currentDeck.deck_id],
  );

  // In-deck counts by card_id and by card_name_zh (2-copy rule)
  const inDeckCardCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of currentDeck.cards) {
      map.set(item.card_id, item.quantity);
    }
    return map;
  }, [currentDeck.cards]);

  const inDeckNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of currentDeck.cards) {
      const def = CARD_BY_ID.get(item.card_id);
      if (def) {
        map.set(def.card_name_zh, (map.get(def.card_name_zh) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [currentDeck.cards]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedClass !== 'all' ||
    selectedCost !== 'all' ||
    selectedRarity !== 'all' ||
    selectedTrait !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedClass('all');
    setSelectedCost('all');
    setSelectedRarity('all');
    setSelectedTrait('all');
  };

  // Filtered and sorted card pool
  const filteredCards = useMemo(() => {
    const result = DEMO_CARDS.filter((card) => {
      const uiCard = card as UiCardDefinition;
      const p = getCardPresentation(card.card_id);

      // 收录模式：未持有的干员不进入目录
      if (deckMode === 'collection' && !(owned[card.card_id] ?? 0)) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = uiCard.card_name_zh.toLowerCase().includes(query);
        const matchesEn = p.codeNameEn.toLowerCase().includes(query);
        const matchesId = uiCard.card_id.toLowerCase().includes(query);
        const matchesRules = (uiCard.rules_text_zh ?? '').toLowerCase().includes(query);
        const matchesSkill = (uiCard.active_skill_text_zh ?? '').toLowerCase().includes(query);
        const matchesTags = (uiCard.synergy_tags ?? '').toLowerCase().includes(query);
        if (!matchesName && !matchesEn && !matchesId && !matchesRules && !matchesSkill && !matchesTags) {
          return false;
        }
      }

      if (selectedClass !== 'all') {
        const cClass = uiCard.card_type === 'operator' ? uiCard.class : uiCard.card_type;
        if (cClass !== selectedClass) return false;
      }

      if (selectedCost !== 'all') {
        const cost = uiCard.cost;
        if (selectedCost === '1' && cost !== 1) return false;
        if (selectedCost === '2' && cost !== 2) return false;
        if (selectedCost === '3' && cost !== 3) return false;
        if (selectedCost === '4' && cost !== 4) return false;
        if (selectedCost === '5+' && cost < 5) return false;
      }

      if (selectedRarity !== 'all') {
        if (String(uiCard.rarity) !== selectedRarity) return false;
      }

      if (selectedTrait !== 'all') {
        if (selectedTrait === 'melee' && uiCard.attack_type !== 'melee') return false;
        if (selectedTrait === 'ranged' && uiCard.attack_type !== 'ranged') return false;
        if (selectedTrait === 'front_only' && uiCard.deploy_rule !== 'front_only') return false;
        if (selectedTrait === 'back_only' && uiCard.deploy_rule !== 'back_only') return false;
        if (selectedTrait === 'floating' && !uiCard.floating) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'cost-asc') return a.cost - b.cost || b.rarity - a.rarity;
      if (sortBy === 'cost-desc') return b.cost - a.cost || b.rarity - a.rarity;
      if (sortBy === 'atk-desc') return (b.atk ?? 0) - (a.atk ?? 0) || (b.hp ?? 0) - (a.hp ?? 0);
      if (sortBy === 'hp-desc') return (b.hp ?? 0) - (a.hp ?? 0) || (b.atk ?? 0) - (a.atk ?? 0);
      if (sortBy === 'rarity-desc') return b.rarity - a.rarity || a.cost - b.cost;
      return a.card_name_zh.localeCompare(b.card_name_zh, 'zh-CN');
    });

    return result;
  }, [deckMode, owned, searchQuery, selectedClass, selectedCost, selectedRarity, selectedTrait, sortBy]);

  // Real-data deck analytics
  const deckAnalytics = useMemo(() => {
    const costBuckets: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    const classCounts = new Map<string, number>();
    let totalCost = 0;
    let totalCount = 0;
    let meleeCount = 0;
    let rangedCount = 0;
    let frontOnlyCount = 0;
    let backOnlyCount = 0;
    let flexPosCount = 0;

    for (const item of currentDeck.cards) {
      const def = CARD_BY_ID.get(item.card_id);
      if (!def) continue;
      const qty = item.quantity;
      totalCount += qty;
      totalCost += def.cost * qty;

      if (def.cost <= 1) costBuckets['1'] += qty;
      else if (def.cost === 2) costBuckets['2'] += qty;
      else if (def.cost === 3) costBuckets['3'] += qty;
      else if (def.cost === 4) costBuckets['4'] += qty;
      else costBuckets['5+'] += qty;

      const cls = def.class ?? def.card_type;
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + qty);

      if (def.attack_type === 'melee') meleeCount += qty;
      else if (def.attack_type === 'ranged') rangedCount += qty;

      if (def.deploy_rule === 'front_only') frontOnlyCount += qty;
      else if (def.deploy_rule === 'back_only') backOnlyCount += qty;
      else flexPosCount += qty;
    }

    const avgCost = totalCount > 0 ? (totalCost / totalCount).toFixed(1) : '0.0';
    const classBreakdown = Array.from(classCounts.entries())
      .map(([key, count]) => ({
        key,
        label: CLASS_LABEL[key] ?? key,
        color: CLASS_COLOR[key] ?? '#94a3b8',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      costBuckets,
      avgCost,
      classBreakdown,
      meleeCount,
      rangedCount,
      frontOnlyCount,
      backOnlyCount,
      flexPosCount,
    };
  }, [currentDeck.cards]);

  // Add card to deck
  const addCard = (cardId: CardId) => {
    const def = CARD_BY_ID.get(cardId);
    if (!def) return;

    if (validation.totalCards >= 20) {
      showNotice('卡组已达 20 张上限，请先移出其他卡牌');
      return;
    }

    const currentCardCount = inDeckCardCounts.get(cardId) ?? 0;
    const ownedCount = owned[cardId] ?? 0;
    const copyCap = deckMode === 'collection' ? Math.min(2, ownedCount) : 2;
    if (deckMode === 'collection' && ownedCount === 0) {
      showNotice(`未持有「${def.card_name_zh}」，收录模式下无法加入；可前往干员寻访收录`);
      return;
    }
    if (currentCardCount >= copyCap) {
      showNotice(
        deckMode === 'collection' && copyCap < 2
          ? `「${def.card_name_zh}」持有 ${ownedCount} 张，已达收录上限`
          : `卡牌「${def.card_name_zh}」最多加入 2 张`,
      );
      return;
    }

    const currentNameCount = inDeckNameCounts.get(def.card_name_zh) ?? 0;
    if (currentNameCount >= 2) {
      showNotice(`同名干员「${def.card_name_zh}」已达 2 张上限`);
      return;
    }

    setCurrentDeck((prev) => {
      const existing = prev.cards.find((c) => c.card_id === cardId);
      if (existing) {
        return {
          ...prev,
          cards: prev.cards.map((c) => (c.card_id === cardId ? { ...c, quantity: c.quantity + 1 } : c)),
        };
      }
      return {
        ...prev,
        cards: [...prev.cards, { card_id: cardId, quantity: 1 }],
      };
    });
  };

  // Remove card from deck
  const removeCard = (cardId: CardId) => {
    setCurrentDeck((prev) => {
      const existing = prev.cards.find((c) => c.card_id === cardId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        return {
          ...prev,
          cards: prev.cards.map((c) => (c.card_id === cardId ? { ...c, quantity: c.quantity - 1 } : c)),
        };
      }
      return {
        ...prev,
        cards: prev.cards.filter((c) => c.card_id !== cardId),
      };
    });
  };

  // Save current deck
  const handleSave = () => {
    if (!currentDeck.deck_name_zh.trim()) {
      showNotice('请输入卡组名称');
      return;
    }
    const deckToSave: DeckDefinition = {
      ...currentDeck,
      deck_name_zh: currentDeck.deck_name_zh.trim(),
    };
    saveCustomDeck(deckToSave);
    setCustomDecks(getCustomDecks());
    setCurrentDeck(deckToSave);
    setSavedSignature(serializeDeckSignature(deckToSave));
    showNotice(validation.valid ? '卡组已保存，可用于出击！' : `已保存（当前 ${validation.totalCards}/20 张）`);
  };

  // Duplicate current deck as a new custom deck
  const handleDuplicate = () => {
    const newId = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
    const copy: DeckDefinition = {
      deck_id: newId,
      deck_name_zh: `${currentDeck.deck_name_zh.trim() || '自定义卡组'} 副本`,
      cards: JSON.parse(JSON.stringify(currentDeck.cards)),
    };
    setCurrentDeck(copy);
    setSavedSignature('');
    showNotice('已创建当前卡组副本，记得保存');
  };

  // Create new blank deck
  const handleCreateNew = () => {
    const newId = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
    setConfirmDelete(false);
    setConfirmClear(false);
    setCurrentDeck({
      deck_id: newId,
      deck_name_zh: `新编制卡组 ${customDecks.length + 1}`,
      cards: [],
    });
    setSavedSignature('');
    showNotice('已创建空白卡组，请从左侧目录加入干员');
  };

  // Load preset deck as customizable copy
  const handleLoadPreset = (deckId: string) => {
    const target = PRESET_DECKS.find((d) => d.deck_id === deckId);
    if (!target) return;
    setConfirmDelete(false);
    setConfirmClear(false);
    setCurrentDeck({
      deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      deck_name_zh: `${target.deck_name_zh} (副本)`,
      cards: JSON.parse(JSON.stringify(target.cards)),
    });
    setSavedSignature('');
    showNotice(`已载入预设「${target.deck_name_zh}」作为新编制`);
  };

  // Switch saved custom deck
  const handleSelectCustomDeck = (deck: DeckDefinition) => {
    setConfirmDelete(false);
    setConfirmClear(false);
    const cloned: DeckDefinition = JSON.parse(JSON.stringify(deck));
    setCurrentDeck(cloned);
    setSavedSignature(serializeDeckSignature(cloned));
  };

  // Delete current custom deck (inline confirmation)
  const handleDeleteCurrent = () => {
    if (PRESET_DECKS.some((d) => d.deck_id === currentDeck.deck_id) || !isCustomDeckSaved) {
      showNotice('未保存的草稿或官方预设不可删除');
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setConfirmDelete(false);
    deleteCustomDeck(currentDeck.deck_id);
    const remaining = getCustomDecks();
    setCustomDecks(remaining);
    if (remaining.length > 0) {
      const next = JSON.parse(JSON.stringify(remaining[0])) as DeckDefinition;
      setCurrentDeck(next);
      setSavedSignature(serializeDeckSignature(next));
    } else if (PRESET_DECKS[0]) {
      handleLoadPreset(PRESET_DECKS[0].deck_id);
    }
    showNotice('卡组已删除');
  };

  // Export JSON
  const handleExport = () => {
    const jsonStr = JSON.stringify(currentDeck, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(jsonStr)
        .then(() => {
          showNotice('卡组 JSON 已复制到剪贴板');
        })
        .catch(() => {
          setImportJsonText(jsonStr);
          setShowImportModal(true);
        });
    } else {
      setImportJsonText(jsonStr);
      setShowImportModal(true);
    }
  };

  // Import JSON
  const handleImportSubmit = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (parsed && Array.isArray(parsed.cards)) {
        const validEntries = (parsed.cards as { card_id?: unknown; quantity?: unknown }[])
          .filter((c) => typeof c?.card_id === 'string' && CARD_BY_ID.has(c.card_id as CardId))
          .map((c) => ({
            card_id: c.card_id as CardId,
            quantity: Math.min(2, Math.max(1, Number(c.quantity) || 1)),
          }));
        const droppedCount = parsed.cards.length - validEntries.length;
        const imported: DeckDefinition = {
          deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
          deck_name_zh: typeof parsed.deck_name_zh === 'string' && parsed.deck_name_zh.trim() ? parsed.deck_name_zh.trim() : '导入卡组',
          cards: validEntries,
        };
        saveCustomDeck(imported);
        setCustomDecks(getCustomDecks());
        setCurrentDeck(imported);
        setSavedSignature(serializeDeckSignature(imported));
        setShowImportModal(false);
        showNotice(droppedCount > 0 ? `卡组已导入（已过滤 ${droppedCount} 条无效条目）` : '卡组导入成功');
      } else {
        showNotice('卡组 JSON 格式错误');
      }
    } catch {
      showNotice('解析 JSON 失败，请检查格式');
    }
  };

  // Sorted cards in deck by cost then name
  const sortedDeckCards = useMemo(() => {
    return [...currentDeck.cards].sort((a, b) => {
      const defA = CARD_BY_ID.get(a.card_id);
      const defB = CARD_BY_ID.get(b.card_id);
      if (!defA || !defB) return 0;
      if (defA.cost !== defB.cost) return defA.cost - defB.cost;
      return defA.card_name_zh.localeCompare(defB.card_name_zh, 'zh-CN');
    });
  }, [currentDeck.cards]);

  const activeInspect = inspectCard;

  return (
    <div className="deck-editor-view flex flex-col h-screen w-full bg-[#11141a] text-[#e8e9e6] font-sans select-none overflow-hidden">
      {/* Top Navigation & Deck Action Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-[#161b23] border-b border-[#2a3544] shadow-md z-10 shrink-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-xs px-2 sm:px-3">
            ◀ 返回
          </Button>
          <div className="h-4 w-px bg-[#2d3748] hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <label htmlFor="deck-name-input" className="text-xs text-slate-400 hidden sm:inline shrink-0">
              卡组名称
            </label>
            <input
              id="deck-name-input"
              type="text"
              className="bg-[#0d1117] text-xs sm:text-sm text-amber-300 font-bold px-2.5 py-1 border border-[#3b485e] focus:border-amber-400 focus:outline-none w-36 sm:w-52"
              value={currentDeck.deck_name_zh}
              onChange={(e) => setCurrentDeck((prev) => ({ ...prev, deck_name_zh: e.target.value }))}
              placeholder="输入卡组名称..."
            />
          </div>

          {/* Validation Badge */}
          <div
            className={`px-2 py-0.5 text-[11px] font-mono font-bold flex items-center gap-1.5 border ${
              validation.valid
                ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-300'
                : 'bg-rose-950/70 border-rose-500/70 text-rose-300'
            }`}
          >
            <span>{validation.valid ? '✓ 可出击' : '未完成'}</span>
            <span>{validation.totalCards}/20</span>
          </div>

          {isDirty && (
            <span className="text-[10px] font-mono text-amber-300 bg-amber-950/50 border border-amber-500/40 px-1.5 py-0.5 hidden md:inline">
              未保存修改
            </span>
          )}
        </div>

        {/* Global Deck Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 bg-[#161b21] border border-[#3b485e] p-0.5">
            {(['collection', 'free'] as DeckMode[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => toggleDeckMode(candidate)}
                className={`px-2 py-1 text-[10px] font-mono font-bold transition-colors ${
                  deckMode === candidate ? 'bg-[#e5a52b] text-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {candidate === 'collection' ? '收录模式' : '自由构筑'}
              </button>
            ))}
          </div>
          <select
            aria-label="载入官方预设模版"
            className="bg-[#202731] text-xs text-slate-200 px-2 py-1.5 border border-[#3b485e] focus:border-amber-400 focus:outline-none cursor-pointer max-w-[165px]"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleLoadPreset(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="" disabled>
              载入预设模版...
            </option>
            {PRESET_DECKS.map((preset) => (
              <option key={preset.deck_id} value={preset.deck_id}>
                {preset.deck_name_zh}
              </option>
            ))}
          </select>

          <Button variant="primary" size="sm" cornerCut onClick={handleSave}>
            保存卡组
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCreateNew} title="创建空白卡组">
            新建
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDuplicate} title="复制当前卡组" className="hidden sm:inline-flex">
            另存副本
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport} title="复制卡组 JSON" className="hidden sm:inline-flex">
            导出
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setImportJsonText('');
              setShowImportModal(true);
            }}
            title="导入卡组 JSON"
          >
            导入
          </Button>
          {isCustomDeckSaved && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteCurrent}
              title="删除此自定义卡组"
            >
              {confirmDelete ? '确认删除？' : '删除'}
            </Button>
          )}
        </div>
      </header>

      {/* Floating Status Notification */}
      {statusNotice && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#18202b] border border-amber-400 text-amber-200 px-4 py-2 text-xs font-medium shadow-2xl"
        >
          {statusNotice}
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center bg-[#151a23] border-b border-[#242d3d] px-3 py-1.5 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 text-xs font-bold transition border cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-[#10131a] border-[#252f3f] text-slate-400'
          }`}
        >
          干员目录 ({filteredCards.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('deck')}
          className={`flex-1 py-2 text-xs font-bold transition border flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'deck'
              ? 'bg-sky-500/20 border-sky-400 text-sky-300'
              : 'bg-[#10131a] border-[#252f3f] text-slate-400'
          }`}
        >
          <span>当前编制 ({validation.totalCards}/20)</span>
          <span className={`w-2 h-2 rounded-full ${validation.valid ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        </button>
      </div>

      {/* Main Content Area: Split Library & Current Deck */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Card Pool & Filters */}
        <section className={`flex-[3] flex-col border-r border-[#242d3d] bg-[#10141a] overflow-hidden ${mobileTab !== 'catalog' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Filter Bar */}
          <div className="p-2.5 sm:p-3 bg-[#151a23] border-b border-[#242d3d] flex flex-col gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <input
                  type="text"
                  placeholder="搜索中英文代号、技能、标签 (如 银灰 / Texas / 冻结)..."
                  className="w-full bg-[#0c1016] border border-[#2d3748] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                    onClick={() => setSearchQuery('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={selectedTrait}
                onChange={(e) => setSelectedTrait(e.target.value as TraitFilter)}
                aria-label="站位与攻击类型筛选"
                className="bg-[#0c1016] border border-[#2d3748] text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="all">全部定位</option>
                <option value="melee">近战干员</option>
                <option value="ranged">远程干员</option>
                <option value="front_only">仅前排部署</option>
                <option value="back_only">仅后排部署</option>
                <option value="floating">浮空特性</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                aria-label="排序方式"
                className="bg-[#0c1016] border border-[#2d3748] text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="rarity-desc">星级降序</option>
                <option value="cost-asc">费用升序</option>
                <option value="cost-desc">费用降序</option>
                <option value="atk-desc">攻击降序</option>
                <option value="hp-desc">生命降序</option>
                <option value="name">名称排序</option>
              </select>

              <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                匹配 <strong className="text-amber-300">{filteredCards.length}</strong> / {DEMO_CARDS.length}
              </span>
            </div>

            {/* Profession Filter Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs">
              <span className="text-slate-400 text-[11px] shrink-0 mr-0.5">职业:</span>
              {PROFESSION_FILTERS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedClass(opt.id)}
                  className={`px-2 py-0.5 text-[11px] font-medium cursor-pointer transition border shrink-0 ${
                    selectedClass === opt.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold'
                      : 'bg-[#1c2330] text-slate-300 border-[#2b3648] hover:text-white hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Cost & Rarity Filter Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 text-[11px] mr-0.5">费用:</span>
                  {['all', '1', '2', '3', '4', '5+'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCost(c)}
                      className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer transition border ${
                        selectedCost === c
                          ? 'bg-sky-500/25 text-sky-200 border-sky-400 font-bold'
                          : 'bg-[#1c2330] text-slate-300 border-[#2b3648] hover:text-white'
                      }`}
                    >
                      {c === 'all' ? '全部' : `${c}费`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-400 text-[11px] mr-0.5">星级:</span>
                  {['all', '6', '5', '4', '3'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRarity(r)}
                      className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer transition border ${
                        selectedRarity === r
                          ? 'bg-amber-500/25 text-amber-200 border-amber-400 font-bold'
                          : 'bg-[#1c2330] text-slate-300 border-[#2b3648] hover:text-white'
                      }`}
                    >
                      {r === 'all' ? '全部' : `${r}★`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] text-sky-300 hover:text-sky-200 underline cursor-pointer"
                  >
                    重置筛选
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDesktopInspector((prev) => !prev)}
                  className="hidden lg:inline text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showDesktopInspector ? '▾ 收起底部档案' : '▸ 展开底部档案'}
                </button>
              </div>
            </div>
          </div>

          {/* Card Grid */}
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 content-start">
            {filteredCards.length === 0 ? (
              <div className="col-span-full py-16 text-center space-y-3">
                <div className="text-xs font-mono text-slate-400">没有符合当前条件的干员</div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    清除筛选条件
                  </Button>
                )}
              </div>
            ) : (
              filteredCards.map((card) => {
                const uiCard = card as UiCardDefinition;
                const inDeckCount = inDeckCardCounts.get(card.card_id) ?? 0;
                const nameCount = inDeckNameCounts.get(uiCard.card_name_zh) ?? 0;
                const ownedCount = owned[card.card_id] ?? 0;
                const copyCap = deckMode === 'collection' ? Math.max(1, Math.min(2, ownedCount)) : 2;
                const isMaxed = inDeckCount >= copyCap || nameCount >= 2 || validation.totalCards >= 20;

                return (
                  <div
                    key={card.card_id}
                    onMouseEnter={() => setInspectCard(uiCard)}
                    className="h-full flex flex-col relative"
                  >
                    {deckMode === 'collection' && (
                      <div className="absolute top-1 right-1 z-10 px-1.5 py-0.5 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[9px] font-mono font-bold pointer-events-none">
                        持有×{ownedCount}{ownedCount >= 2 ? ' ·满仓' : ''}
                      </div>
                    )}
                    <CardFrame
                      cardId={card.card_id}
                      definition={uiCard}
                      variant="deck"
                      inDeckCount={inDeckCount}
                      maxInDeckCount={copyCap}
                      selected={inDeckCount > 0}
                      disabled={isMaxed && inDeckCount === 0}
                      onClick={() => addCard(card.card_id)}
                      onActionClick={() => addCard(card.card_id)}
                      onInspectClick={() => {
                        setInspectCard(uiCard);
                        setMobileInspectCard(uiCard);
                      }}
                      actionLabel={inDeckCount >= copyCap ? (deckMode === 'collection' && copyCap < 2 ? '持有上限' : '已满') : nameCount >= 2 ? '同名满' : validation.totalCards >= 20 ? '满编' : '+ 加入'}
                      className="flex-1"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Bottom Card Detail Inspector Bar */}
          {activeInspect && showDesktopInspector && (
            <div className="hidden lg:flex bg-[#141923] border-t border-[#283244] p-3 items-start gap-4 shrink-0">
              <OperatorPortrait
                key={activeInspect.card_id}
                cardId={activeInspect.card_id}
                variant="avatar"
                className="w-16 h-16 shrink-0 shadow-md border border-[#2b374a]"
              />
              <div className="flex flex-col gap-1 w-52 shrink-0">
                <div className="flex items-center gap-2">
                  <Badge variant="rarity" value={activeInspect.rarity} />
                  <span className="text-slate-100 font-bold text-sm truncate">
                    {activeInspect.card_name_zh}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Badge variant="class" value={getCardClassInfo(activeInspect).key}>
                    {getCardClassInfo(activeInspect).label}
                  </Badge>
                  <span className="text-amber-300 font-mono font-bold">{activeInspect.cost} DP</span>
                  {activeInspect.card_type === 'operator' && (
                    <span className="text-slate-400 text-[11px] font-mono">
                      {activeInspect.attack_type === 'melee' ? '近战' : '远程'} · {activeInspect.deploy_rule === 'front_only' ? '仅前排' : activeInspect.deploy_rule === 'back_only' ? '仅后排' : '全阵位'}
                    </span>
                  )}
                </div>
                {activeInspect.card_type === 'operator' && (
                  <div className="flex gap-3 text-xs font-mono pt-0.5">
                    <span className="text-rose-400 font-bold">ATK {activeInspect.atk ?? 0}</span>
                    <span className="text-emerald-400 font-bold">HP {activeInspect.hp ?? 0}</span>
                    <span className="text-sky-400 font-bold">SP {activeInspect.starting_sp ?? 0}/{activeInspect.max_sp ?? 5}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 text-xs text-slate-300 leading-relaxed min-w-0">
                <div className="text-slate-200">
                  <strong className="text-amber-300 mr-1.5">特性/效果:</strong>
                  <span>{activeInspect.rules_text_zh || '无特殊常驻被动效果'}</span>
                </div>
                {activeInspect.active_skill_text_zh && (
                  <div className="mt-1 text-sky-300">
                    <strong>主动技能 ({activeInspect.active_skill_sp_cost ?? 0} SP):</strong> {activeInspect.active_skill_text_zh}
                  </div>
                )}
                {activeInspect.synergy_tags && (
                  <div className="mt-1 text-[10px] font-mono text-slate-400">
                    标签: {activeInspect.synergy_tags}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right: Current Deck Structure, Analytics & Saved Decks */}
        <section className={`flex-[2] max-w-full lg:max-w-[430px] flex-col bg-[#141822] overflow-hidden ${mobileTab !== 'deck' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Deck Analytics & Status Header */}
          <div className="p-3 bg-[#171d27] border-b border-[#283244] flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-[#e5a52b]" />
                <span className="font-bold text-sm text-slate-100">
                  当前构筑 ({validation.totalCards} / 20)
                </span>
              </div>
              <button
                type="button"
                className={`text-xs cursor-pointer transition px-2 py-0.5 border ${
                  confirmClear
                    ? 'text-rose-100 bg-rose-700 border-rose-400 font-bold'
                    : 'text-rose-300 border-rose-800/60 hover:bg-rose-950/60'
                }`}
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    window.setTimeout(() => setConfirmClear(false), 3500);
                    return;
                  }
                  setConfirmClear(false);
                  setCurrentDeck((prev) => ({ ...prev, cards: [] }));
                  showNotice('已清空当前卡组');
                }}
              >
                {confirmClear ? '确认清空？' : '清空卡组'}
              </button>
            </div>

            {/* Validation Box */}
            <div
              className={`p-2 text-xs leading-relaxed border ${
                validation.valid
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/60 text-rose-300'
              }`}
            >
              {validation.valid ? (
                <div>✓ 卡组合法（20 张，无同名超限），可直接投入对战。</div>
              ) : (
                <div className="space-y-0.5">
                  {validation.errors.map((err, i) => (
                    <div key={i}>⚠ {err}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary KPIs + Cost Curve + Class Distribution */}
            <div className="bg-[#0e1219] p-2.5 border border-[#242d3d] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 border-b border-[#1d2533] pb-1.5">
                <span>平均费用 <strong className="text-amber-300">{deckAnalytics.avgCost} DP</strong></span>
                <span className="text-slate-600">·</span>
                <span>近战 <strong className="text-slate-100">{deckAnalytics.meleeCount}</strong> / 远程 <strong className="text-slate-100">{deckAnalytics.rangedCount}</strong></span>
                <span className="text-slate-600">·</span>
                <span>种数 <strong className="text-sky-300">{validation.uniqueCards}</strong></span>
              </div>

              {/* Interactive Cost Curve */}
              <div>
                <div className="text-[10px] text-slate-400 font-mono mb-1 flex justify-between">
                  <span>费用分布 (点击柱条快速按费筛选)</span>
                  <span>前{deckAnalytics.frontOnlyCount} · 后{deckAnalytics.backOnlyCount} · 全{deckAnalytics.flexPosCount}</span>
                </div>
                <div className="flex items-end gap-1.5 h-12 px-1 pt-1">
                  {Object.entries(deckAnalytics.costBuckets).map(([bucket, count]) => {
                    const heightPercent = Math.min(100, (count / 8) * 100);
                    const isCostFiltered = selectedCost === bucket;
                    return (
                      <button
                        key={bucket}
                        type="button"
                        onClick={() => setSelectedCost((prev) => (prev === bucket ? 'all' : bucket))}
                        title={`点击筛选 ${bucket} 费干员`}
                        className={`flex-1 flex flex-col items-center h-full justify-end cursor-pointer transition rounded-xs ${
                          isCostFiltered ? 'bg-amber-500/15 ring-1 ring-amber-400/60' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="text-[9px] font-mono text-amber-300 font-bold leading-none mb-0.5">
                          {count > 0 ? count : ''}
                        </span>
                        <div
                          className={`w-full transition-all min-h-[2px] ${isCostFiltered ? 'bg-amber-400' : 'bg-sky-500/80'}`}
                          style={{ height: `${Math.max(5, heightPercent)}%` }}
                        />
                        <span className="text-[9px] font-mono text-slate-400 mt-0.5">{bucket}费</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Class Distribution Strip */}
              {deckAnalytics.classBreakdown.length > 0 && (
                <div className="pt-1 border-t border-[#1d2533] flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] font-mono">
                  {deckAnalytics.classBreakdown.map((cls) => (
                    <span key={cls.key} className="inline-flex items-center gap-1 text-slate-300">
                      <span className="w-1.5 h-2.5 inline-block" style={{ backgroundColor: cls.color }} />
                      <span>{cls.label}</span>
                      <strong className="text-white">{cls.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cards in Deck List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sortedDeckCards.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                卡组暂无干员，请在左侧目录点击「+ 加入」添加卡牌。
              </div>
            ) : (
              sortedDeckCards.map((item) => {
                const def = CARD_BY_ID.get(item.card_id);
                if (!def) return null;
                const cardInfo = getCardClassInfo(def);

                return (
                  <div
                    key={item.card_id}
                    className="flex items-center justify-between gap-2 p-1.5 bg-[#181e2b] border border-[#242f42] hover:border-[#3c4d69] text-xs transition"
                    onMouseEnter={() => setInspectCard(def)}
                    onClick={() => setInspectCard(def)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden min-w-0">
                      <OperatorPortrait
                        cardId={item.card_id}
                        variant="mini"
                        className="w-6 h-6 shrink-0"
                      />
                      <span className="w-5 text-center font-mono font-bold text-amber-300 text-xs shrink-0">
                        {def.cost}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1 py-0.5 text-slate-100 bg-[#0d1118] border-l-2 shrink-0"
                        style={{ borderLeftColor: cardInfo.color }}
                      >
                        {cardInfo.label}
                      </span>
                      <span className="font-semibold text-slate-100 truncate">
                        {def.card_name_zh}
                      </span>
                      {def.card_type === 'operator' && (
                        <span className="text-[10px] font-mono text-slate-400 shrink-0 hidden sm:inline">
                          攻{def.atk ?? 0}/血{def.hp ?? 0}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="w-7 h-7 bg-[#232d3f] hover:bg-[#313f57] text-slate-200 font-bold flex items-center justify-center cursor-pointer border border-[#3b4b66]"
                        onClick={() => removeCard(item.card_id)}
                        title="减少一张"
                        aria-label={`减少一张 ${def.card_name_zh}`}
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-bold font-mono text-sky-300">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className={`w-7 h-7 font-bold flex items-center justify-center border ${
                          item.quantity >= 2 || validation.totalCards >= 20
                            ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                            : 'bg-[#232d3f] hover:bg-[#313f57] text-slate-200 border-[#3b4b66] cursor-pointer'
                        }`}
                        onClick={() => addCard(item.card_id)}
                        disabled={item.quantity >= 2 || validation.totalCards >= 20}
                        title="增加一张"
                        aria-label={`增加一张 ${def.card_name_zh}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Saved Custom Decks Drawer */}
          <div className="p-2.5 bg-[#10141d] border-t border-[#283244] shrink-0">
            <div className="text-[11px] text-slate-400 font-semibold mb-1.5 flex justify-between">
              <span>已保存自定义卡组 ({customDecks.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {customDecks.length === 0 ? (
                <span className="text-[11px] text-slate-500">暂无已保存自定义卡组，点击上方「保存卡组」后将显示于此</span>
              ) : (
                customDecks.map((deck) => {
                  const deckTotal = deck.cards.reduce((s, c) => s + c.quantity, 0);
                  const isDeckValid = validateDeck(deck, DEMO_CARDS).valid;
                  const isActive = currentDeck.deck_id === deck.deck_id;
                  return (
                    <button
                      key={deck.deck_id}
                      type="button"
                      className={`px-2 py-1 text-xs text-left max-w-[175px] cursor-pointer border transition flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                          : 'bg-[#1b2230] border-[#293548] text-slate-300 hover:bg-[#252f42]'
                      }`}
                      onClick={() => handleSelectCustomDeck(deck)}
                    >
                      <span className="truncate">{deck.deck_name_zh}</span>
                      <span className={`text-[10px] font-mono shrink-0 ${isDeckValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {deckTotal}/20
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Mobile Dossier BottomSheet (Tap "详情" on any catalog card) */}
      <BottomSheet
        isOpen={Boolean(mobileInspectCard)}
        onClose={() => setMobileInspectCard(null)}
        title={mobileInspectCard?.card_name_zh ?? '干员详情'}
        codeName={mobileInspectCard?.card_id}
        maxHeight="max-h-[88vh]"
      >
        {mobileInspectCard && (
          <div className="p-4 space-y-3 text-xs">
            <div className="flex justify-center">
              <CardFrame
                cardId={mobileInspectCard.card_id}
                definition={mobileInspectCard}
                variant="preview"
                interactive={false}
                className="max-w-[220px] min-h-[260px]"
              />
            </div>

            <div className="bg-[#11151c] p-2.5 border border-[#273240] space-y-1.5">
              <div className="text-slate-200">
                <strong className="text-amber-300 block mb-0.5">被动特性 / 效果</strong>
                {mobileInspectCard.rules_text_zh || '无特殊常驻被动效果'}
              </div>
              {mobileInspectCard.active_skill_text_zh && (
                <div className="text-sky-300 pt-1 border-t border-[#232c38]">
                  <strong className="block mb-0.5">主动技能 ({mobileInspectCard.active_skill_sp_cost ?? 0} SP)</strong>
                  {mobileInspectCard.active_skill_text_zh}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => removeCard(mobileInspectCard.card_id)}
                disabled={(inDeckCardCounts.get(mobileInspectCard.card_id) ?? 0) === 0}
                className="flex-1"
              >
                - 移出一张 ({inDeckCardCounts.get(mobileInspectCard.card_id) ?? 0}/2)
              </Button>
              <Button
                variant="primary"
                size="md"
                cornerCut
                onClick={() => addCard(mobileInspectCard.card_id)}
                disabled={
                  (inDeckCardCounts.get(mobileInspectCard.card_id) ?? 0) >= 2 ||
                  (inDeckNameCounts.get(mobileInspectCard.card_name_zh) ?? 0) >= 2 ||
                  validation.totalCards >= 20
                }
                className="flex-1"
              >
                + 加入卡组
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* JSON Import/Export Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="卡组配置导入 / 导出"
        codeName="DECK.JSON"
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImportModal(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" cornerCut onClick={handleImportSubmit}>
              确认导入卡组
            </Button>
          </>
        }
      >
        <div className="space-y-2.5">
          <p className="text-xs text-slate-300 m-0">
            请粘贴或复制卡组 JSON 配置代码（标准编制为 20 张干员与对应数量）：
          </p>
          <textarea
            className="w-full h-48 bg-[#0d1117] border border-[#2b374a] p-2.5 text-xs font-mono text-sky-300 focus:outline-none focus:border-amber-400"
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            placeholder='{"deck_name_zh": "突击卡组", "cards": [{"card_id": "OP-VAN-006", "quantity": 2}, ...]}'
          />
        </div>
      </Modal>
    </div>
  );
}
