import React, { useEffect, useMemo, useState } from 'react';
import { CARD_BY_ID, DEMO_CARDS, getAllAvailableDecks, getCustomDecks, PLAYER_LABEL, validateDeck } from '../client/demoData';
import { getDeckMode, setDeckMode } from '../data/playerCollection';
import type { DeckMode } from '../data/playerCollection';
import type { LocalGameSetup } from '../client/localGameController';
import type { DeckDefinition, PlayerId } from '../game/types';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

interface DeckSelectViewProps {
  readonly mode: 'hotseat' | 'vs-bot';
  readonly onStart: (setup: LocalGameSetup) => void;
  readonly onCancel: () => void;
  readonly onOpenDeckEditor?: () => void;
}

function deckComposition(deck: DeckDefinition): string {
  return deck.cards
    .map((entry) => `${CARD_BY_ID.get(entry.card_id)?.card_name_zh ?? entry.card_id}×${entry.quantity}`)
    .join('、');
}

export function DeckSelectView({ mode, onStart, onCancel, onOpenDeckEditor }: DeckSelectViewProps) {
  const [deckMode, setDeckModeState] = useState<DeckMode>(() => getDeckMode());
  const availableDecks = useMemo(() => getAllAvailableDecks(deckMode), [deckMode]);
  const incompleteCustomDecks = useMemo(
    () => getCustomDecks().filter((deck) => !validateDeck(deck, DEMO_CARDS).valid),
    [],
  );

  // 切换构筑模式后，已选卡组可能不再可用（收录模式下被过滤），回退到首个可用卡组。
  useEffect(() => {
    setDeckIds((prev) => {
      const validA = availableDecks.some((deck) => deck.deck_id === prev.player_a);
      const validB = availableDecks.some((deck) => deck.deck_id === prev.player_b);
      return {
        player_a: validA ? prev.player_a : availableDecks[0]?.deck_id ?? '',
        player_b: validB ? prev.player_b : availableDecks[1]?.deck_id ?? availableDecks[0]?.deck_id ?? '',
      };
    });
  }, [availableDecks]);

  const [deckIds, setDeckIds] = useState<Record<PlayerId, string>>({
    player_a: availableDecks[0]?.deck_id ?? '',
    player_b: availableDecks[1]?.deck_id ?? availableDecks[0]?.deck_id ?? '',
  });
  const [seedText, setSeedText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = () => {
    const deckA = availableDecks.find((deck) => deck.deck_id === deckIds.player_a);
    const deckB = availableDecks.find((deck) => deck.deck_id === deckIds.player_b);
    if (!deckA || !deckB) {
      setErrorMessage('请为双方选择有效卡组。');
      return;
    }
    const checkA = validateDeck(deckA, DEMO_CARDS);
    if (!checkA.valid) {
      setErrorMessage(`玩家 A 卡组「${deckA.deck_name_zh}」无效：${checkA.errors[0] ?? '请检查构筑'}`);
      return;
    }
    const checkB = validateDeck(deckB, DEMO_CARDS);
    if (!checkB.valid) {
      setErrorMessage(`玩家 B 卡组「${deckB.deck_name_zh}」无效：${checkB.errors[0] ?? '请检查构筑'}`);
      return;
    }
    setErrorMessage(null);
    const parsed = Number.parseInt(seedText, 10);
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 2 ** 31);
    onStart({ decks: { player_a: deckA, player_b: deckB }, cards: DEMO_CARDS, seed });
  };

  const renderColumn = (playerId: PlayerId) => {
    const isPlayerA = playerId === 'player_a';
    return (
      <Panel
        variant="default"
        title={`${PLAYER_LABEL[playerId]} 作战编制`}
        codeName={isPlayerA ? 'OPERATOR.ALPHA' : 'OPERATOR.BETA'}
        className="flex-1 flex flex-col min-w-[280px]"
      >
        <div className="p-3 space-y-2 max-h-[55vh] overflow-y-auto">
          {availableDecks.map((deck) => {
            const isSelected = deckIds[playerId] === deck.deck_id;
            const isCustom = deck.deck_id.startsWith('CUSTOM-');
            return (
              <div
                key={deck.deck_id}
                onClick={() => setDeckIds((prev) => ({ ...prev, [playerId]: deck.deck_id }))}
                className={`p-3 border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[#29323d] border-[#e5a52b] ring-1 ring-[#e5a52b]/40 shadow-md'
                    : 'bg-[#181d22] border-[#313b43] hover:border-[#4b5a66] hover:bg-[#1d232a]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">{deck.deck_name_zh}</span>
                    <Badge variant={isCustom ? 'rarity' : 'neutral'} value={isCustom ? 5 : undefined}>
                      {isCustom ? '自定义' : '官方预设'}
                    </Badge>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-mono text-[#e5a52b] font-bold">
                      ✓ 已选择
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {deckComposition(deck)}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-5xl border border-[#4a555b] shadow-2xl flex flex-col"
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                作战出击配置 · 编制选择
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                {mode === 'vs-bot' ? '单人人机推演模式' : '本地热座双人推演模式'} · {deckMode === 'collection' ? '收录模式（仅已持有干员）' : '自由构筑（全量干员）'}
              </span>
            </div>
          </div>
          {onOpenDeckEditor && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#161b21] border border-[#3b485e] p-0.5">
                {(['collection', 'free'] as DeckMode[]).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setDeckMode(candidate);
                      setDeckModeState(candidate);
                    }}
                    className={`px-2 py-1 text-[10px] font-mono font-bold transition-colors ${
                      deckMode === candidate ? 'bg-[#e5a52b] text-black' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {candidate === 'collection' ? '收录模式' : '自由构筑'}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" cornerCut onClick={onOpenDeckEditor}>
                🎴 打开卡组构筑器
              </Button>
            </div>
          )}
        </div>

        {/* Incomplete Custom Deck & Error Notice */}
        {(incompleteCustomDecks.length > 0 || errorMessage) && (
          <div className="px-5 pt-3 space-y-2 bg-[#1b2025]">
            {errorMessage && (
              <div className="px-3 py-2 bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between">
                <span>⚠️ {errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white ml-2">✕</button>
              </div>
            )}
            {deckMode === 'collection' && (
              <div className="px-3 py-2 bg-sky-950/50 border border-sky-500/40 text-sky-200 text-xs">
                ℹ️ 收录模式：仅显示由已持有干员组成的卡组（含低星 starter 预设）；未持有的官方预设已隐藏。切换到自由构筑可使用全量卡池。
              </div>
            )}
            {incompleteCustomDecks.length > 0 && (
              <div className="px-3 py-2 bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <span>
                  ℹ️ 有 {incompleteCustomDecks.length} 套自定义卡组当前未满 20 张（已自动清理移除旧测试卡牌），请在卡组构筑器中补全后再用于出击。
                </span>
                {onOpenDeckEditor && (
                  <Button variant="outline" size="sm" onClick={onOpenDeckEditor} className="text-[11px] px-2 py-0.5">
                    前往补全
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dual Deck Selection Columns */}
        <div className="p-5 flex flex-col md:flex-row gap-4 bg-gradient-to-b from-[#1b2025] to-[#14181c]">
          {renderColumn('player_a')}
          {renderColumn('player_b')}
        </div>

        {/* Action Controls & Seed Input */}
        <div className="px-5 py-3.5 bg-[#121518] border-t border-[#313b43] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">随机种子:</span>
            <input
              type="number"
              value={seedText}
              placeholder="留空 = 随机真随机数"
              onChange={(e) => setSeedText(e.target.value)}
              className="bg-[#1b2127] border border-[#3c4750] px-2.5 py-1 text-xs text-amber-300 font-mono focus:border-amber-400 focus:outline-none w-44"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="md" onClick={onCancel}>
              ◀ 返回主菜单
            </Button>
            <Button variant="primary" size="md" cornerCut onClick={start} className="font-bold px-6">
              确认出击 ▶
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
