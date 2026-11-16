import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_BY_ID, CLASS_LABEL, DEMO_CARDS, type UiCardDefinition } from '../client/gameData';
import { DEFAULT_POOL, GACHA_CONFIG, derivePoolMembers } from '../data/load-gacha-data';
import { performPull } from '../data/recruitment';
import type { PullOutcome } from '../data/recruitment';
import { applyPullOutcome, getActiveAccountName, getActiveCollection, isTestAccount } from '../data/player-collection';
import { getCardPresentation } from '../data/card-presentation';
import { CardFrame } from '../components/cards/CardFrame';
import type { CardFrameProps } from '../components/cards/CardFrame';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface RecruitmentViewProps {
  readonly onBack: () => void;
  readonly onOpenDeckEditor?: () => void;
}

interface SlotPullStatus {
  readonly isNew: boolean;
  readonly afterCount: number;
  readonly convertedOriginite: number;
}

interface PendingReveal {
  readonly outcome: PullOutcome;
  readonly seed: number;
  readonly revealed: number;
  readonly slotStatuses: readonly SlotPullStatus[];
}

/**
 * 干员寻访：
 * 合成玉单货币；先算后演——performPull 纯函数产出结果 → applyPullOutcome 落库 → 演出只回放已落库结果；
 * seed 存入 pullHistory，结果可复现可审计。重复持有（≥2）自动转化为合成玉。
 */
export function RecruitmentView({ onBack, onOpenDeckEditor }: RecruitmentViewProps) {
  const [accountName] = useState(() => getActiveAccountName());
  const [isTest] = useState(() => isTestAccount());
  const [collection, setCollection] = useState(() => getActiveCollection());
  const [pending, setPending] = useState<PendingReveal | null>(null);
  const [inspectCard, setInspectCard] = useState<UiCardDefinition | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const revealGridRef = useRef<HTMLDivElement | null>(null);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const rarityOf = (cardId: CardFrameCardId) => CARD_BY_ID.get(cardId)?.rarity ?? 0;
  const membersByRarity = useMemo(() => derivePoolMembers(DEMO_CARDS, DEFAULT_POOL).byRarity, []);
  const economy = GACHA_CONFIG.economy;
  const ownedSpeciesCount = useMemo(
    () => DEMO_CARDS.filter((c) => (collection.owned[c.card_id] ?? 0) > 0).length,
    [collection.owned],
  );

  // 十连逐张揭示（可跳过）：只回放已落库结果；揭示节奏按稀有度分级制造期待感
  useEffect(() => {
    if (!pending || pending.revealed >= pending.outcome.results.length) return;
    const nextRarity = rarityOf(pending.outcome.results[pending.revealed]);
    const delay = prefersReducedMotion ? 90 : nextRarity >= 6 ? 850 : nextRarity === 5 ? 550 : 180;
    const timer = window.setTimeout(() => {
      setPending((prev) =>
        prev ? { ...prev, revealed: Math.min(prev.outcome.results.length, prev.revealed + 1) } : prev,
      );
      if (!prefersReducedMotion && nextRarity >= 6) {
        revealGridRef.current?.animate?.(
          [
            { transform: 'translate(0, 0)' },
            { transform: 'translate(-3px, 2px)' },
            { transform: 'translate(3px, -2px)' },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 420, easing: 'ease-out' },
        );
      }
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, prefersReducedMotion]);

  const pull = (count: 1 | 10) => {
    const current = getActiveCollection();
    const cost = count === 10 ? DEFAULT_POOL.cost.ten : DEFAULT_POOL.cost.single;
    if (current.currency.originite < cost) {
      setNotice(
        `合成玉不足：本次需要 ${cost}，当前 ${current.currency.originite}，还差 ${cost - current.currency.originite}。完成对局可获得合成玉。`,
      );
      return;
    }

    const seed = Math.floor(Math.random() * 2 ** 31);
    const outcome = performPull({
      owned: current.owned,
      since6Star: current.pity[DEFAULT_POOL.poolId]?.since6Star ?? 0,
      membersByRarity,
      economy,
      count,
      seed,
    });

    // 记录逐抽收录/重复转化快照，确保演出底部标注与真实落库一致
    const simOwned: Record<string, number> = { ...current.owned };
    const slotStatuses: SlotPullStatus[] = outcome.results.map((cardId) => {
      const before = simOwned[cardId] ?? 0;
      if (before >= 2) {
        const rarKey = String(CARD_BY_ID.get(cardId)?.rarity ?? 3) as keyof typeof economy.conversion;
        return {
          isNew: false,
          afterCount: 2,
          convertedOriginite: economy.conversion[rarKey] ?? 0,
        };
      }
      const after = before + 1;
      simOwned[cardId] = after;
      return {
        isNew: before === 0,
        afterCount: after,
        convertedOriginite: 0,
      };
    });

    const updated = applyPullOutcome(outcome, DEFAULT_POOL.poolId, seed, count);
    setCollection(updated);
    setPending({ outcome, seed, revealed: 0, slotStatuses });
    setNotice(null);
  };

  const since6Star = collection.pity[DEFAULT_POOL.poolId]?.since6Star ?? 0;
  const pityPercent = Math.min(100, Math.round((since6Star / DEFAULT_POOL.pity.hardPityAt) * 100));
  const balance = collection.currency.originite;
  const singleCost = DEFAULT_POOL.cost.single;
  const tenCost = DEFAULT_POOL.cost.ten;
  const allRevealed = pending !== null && pending.revealed >= pending.outcome.results.length;
  const conversionTotal = pending?.outcome.originiteGained ?? 0;
  const maxResultRarity = pending ? Math.max(...pending.outcome.results.map((id) => rarityOf(id))) : 0;
  const isSinglePull = pending?.outcome.results.length === 1;

  const renderResultCard = (cardId: CardFrameCardId, index: number, slot?: SlotPullStatus) => {
    const definition = CARD_BY_ID.get(cardId) as UiCardDefinition | undefined;
    const rarity = definition?.rarity ?? 0;
    const revealCls = prefersReducedMotion ? '' : `gacha-reveal-${Math.min(Math.max(rarity, 4), 6)}`;

    return (
      <div key={`${cardId}-${index}`} className={`relative flex flex-col gap-1 ${revealCls}`}>
        <div className="relative">
          <CardFrame
            cardId={cardId}
            definition={definition}
            variant="deck"
            interactive
            onClick={() => {
              if (definition) setInspectCard(definition);
            }}
            className={`w-full ${
              rarity >= 6
                ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(245,185,66,0.55)]'
                : rarity === 5
                  ? 'ring-1 ring-fuchsia-400/80 shadow-[0_0_10px_rgba(232,121,249,0.4)]'
                  : ''
            }`}
          />
          {!prefersReducedMotion && rarity === 5 && (
            <div className="absolute inset-0 z-10 pointer-events-none gacha-burst-5 bg-[radial-gradient(circle_at_50%_45%,rgba(232,121,249,0.5),rgba(245,185,66,0.3)_45%,transparent_70%)]" />
          )}
          {!prefersReducedMotion && rarity >= 6 && (
            <>
              <div className="absolute inset-0 z-10 pointer-events-none gacha-burst-6 bg-[radial-gradient(circle_at_50%_40%,rgba(255,236,160,0.85),rgba(245,185,66,0.45)_45%,transparent_72%)]" />
              <div className="absolute inset-x-2 inset-y-0 z-10 pointer-events-none gacha-beam-6 bg-gradient-to-b from-amber-200/85 via-amber-400/30 to-transparent" />
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent gacha-sweep" />
              </div>
            </>
          )}
        </div>
        {slot && (
          <div className="text-center text-[10px] font-mono leading-none tabular-nums">
            {slot.convertedOriginite > 0 ? (
              <span className="text-emerald-300">重复转化 +{slot.convertedOriginite} 玉</span>
            ) : slot.isNew ? (
              <span className="text-amber-300 font-bold">新收录 · 1/2</span>
            ) : (
              <span className="text-sky-300">持有 +1 · {slot.afterCount}/2</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-3 sm:p-6 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-4xl border border-[#4a555b] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-xs px-2 sm:px-3">
              ◀ 返回
            </Button>
            <span className="w-1.5 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                干员寻访 // RECRUITMENT
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider tabular-nums">
                {DEFAULT_POOL.label} · 6★ 2% · 51 抽起递增 · 99 抽必出
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono tabular-nums">
            {isTest && (
              <span className="text-[9px] font-black text-rose-300 bg-rose-950/70 border border-rose-500/60 px-1.5 py-0.5">
                TEST
              </span>
            )}
            <span className="text-slate-400">
              账户 <strong className="text-slate-200">{accountName}</strong> · 已收录 {ownedSpeciesCount}/{DEMO_CARDS.length}
            </span>
            <span className="text-amber-300 font-bold">◆ 合成玉 {balance}</span>
            {onOpenDeckEditor && (
              <Button variant="outline" size="sm" onClick={onOpenDeckEditor} className="text-xs">
                编制卡组
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 bg-gradient-to-b from-[#1b2025] to-[#14181c]">
          {notice && (
            <div className="px-3 py-2 bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between">
              <span>⚠️ {notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-rose-400 hover:text-white ml-2 cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {/* Pity Progress & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="text-[11px] font-mono text-slate-300 mb-1 tabular-nums">
                6★ 保底进度：{since6Star}/{DEFAULT_POOL.pity.hardPityAt}
                {since6Star >= DEFAULT_POOL.pity.softPityFrom ? ' · 概率提升中' : ''}
                {since6Star > 0 ? ` · 距必出还剩 ${DEFAULT_POOL.pity.hardPityAt - since6Star} 抽` : ''}
              </div>
              <div className="relative h-2 bg-[#0d1117] border border-[#2b353e] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-700 to-amber-400 transition-all" style={{ width: `${pityPercent}%` }} />
                {!prefersReducedMotion && (
                  <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/60 to-transparent gacha-progress-shine pointer-events-none" />
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-1 tabular-nums">
                重复转化返还：4★ +{economy.conversion['4']} · 5★ +{economy.conversion['5']} · 6★ +{economy.conversion['6']}（持有满 2 张后自动触发）
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => pull(1)}
                disabled={balance < singleCost}
                title={balance < singleCost ? `还差 ${singleCost - balance} 合成玉` : undefined}
              >
                单抽 ◆{singleCost}
              </Button>
              <Button
                variant="primary"
                size="md"
                cornerCut
                onClick={() => pull(10)}
                disabled={balance < tenCost}
                className="font-bold px-5"
                title={balance < tenCost ? `还差 ${tenCost - balance} 合成玉` : undefined}
              >
                十连 ◆{tenCost}
              </Button>
            </div>
          </div>

          {/* Results */}
          {pending && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  寻访结果（seed {pending.seed} · 点击任意干员可查看完整档案）
                </span>
                {!allRevealed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPending({ ...pending, revealed: pending.outcome.results.length })}
                  >
                    跳过动画 ▶▶
                  </Button>
                ) : (
                  <span className="text-[11px] font-mono font-bold text-amber-300 tabular-nums">
                    {conversionTotal > 0 ? `重复转化 ×${pending.outcome.conversions.length}：+${conversionTotal} 合成玉` : '全部干员已加入库存'}
                  </span>
                )}
              </div>
              <div
                ref={revealGridRef}
                className={
                  isSinglePull
                    ? 'max-w-[210px] mx-auto'
                    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3'
                }
                onClick={() => !allRevealed && setPending({ ...pending, revealed: pending.outcome.results.length })}
              >
                {pending.outcome.results.map((cardId, index) =>
                  index < pending.revealed ? (
                    renderResultCard(cardId, index, pending.slotStatuses[index])
                  ) : (
                    <div
                      key={`pending-${index}`}
                      className="min-h-[178px] bg-[#0d1117] border border-[#2b353e] flex items-center justify-center text-slate-600 text-xl font-mono cursor-pointer"
                    >
                      ✦
                    </div>
                  ),
                )}
              </div>
              {allRevealed && maxResultRarity >= 5 && (
                <div
                  className={`animate-fade-in px-3 py-1.5 border text-center font-black tracking-widest text-sm ${
                    maxResultRarity >= 6
                      ? 'bg-gradient-to-r from-amber-950/80 via-amber-500/25 to-amber-950/80 border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(245,185,66,0.4)]'
                      : 'bg-gradient-to-r from-fuchsia-950/70 via-fuchsia-500/20 to-fuchsia-950/70 border-fuchsia-400/80 text-fuchsia-200'
                  }`}
                >
                  {maxResultRarity >= 6 ? '★★★★★★ 六星干员，加入作战！' : '★★★★★ 五星干员，加入作战！'}
                </div>
              )}
            </div>
          )}

          {!pending && (
            <div className="py-8 text-center space-y-2 border border-dashed border-[#2b353e] bg-[#12161c]/70">
              <div className="text-sm text-slate-200 font-bold">消耗合成玉寻访干员，收录后即可用于卡组构筑</div>
              <div className="text-[11px] font-mono text-slate-400 leading-relaxed max-w-xl mx-auto px-3">
                新干员收录进库存（同名上限 2 张）· 重复干员自动转化为合成玉 · 完成对局（胜 +{economy.battleRewards.win} / 负 +{economy.battleRewards.lose}）补充合成玉
              </div>
            </div>
          )}
        </div>

        {/* History Footer */}
        <div className="px-4 sm:px-5 py-3 bg-[#121518] border-t border-[#313b43] text-[10px] font-mono text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span className="tracking-wider tabular-nums">最近寻访记录（{collection.pullHistory.length}/200）</span>
            <Button variant="ghost" size="sm" onClick={onBack}>
              ◀ 返回主菜单
            </Button>
          </div>
          {collection.pullHistory.length === 0 ? (
            <div className="text-slate-600">暂无寻访记录</div>
          ) : (
            collection.pullHistory.slice(0, 5).map((record) => {
              const sixStars = record.results.filter((cardId) => CARD_BY_ID.get(cardId)?.rarity === 6);
              return (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-slate-500 tabular-nums">
                  <span>
                    {new Date(record.ts).toLocaleTimeString('zh-CN', { hour12: false })} · {record.count === 10 ? '十连' : '单抽'}
                    {sixStars.length > 0 ? (
                      <span className="text-amber-300 font-bold"> · 6★ {sixStars.map((cardId) => CARD_BY_ID.get(cardId)?.card_name_zh ?? cardId).join('/')}</span>
                    ) : (
                      ' · 无 6★'
                    )}
                  </span>
                  <span>
                    -{record.cost} 玉{record.conversions.length > 0 ? ` · 转化 ×${record.conversions.length} +${record.conversions.reduce((sum, c) => sum + c.originite, 0)} 玉` : ''}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      {/* Revealed Card Quick Dossier Modal */}
      <Modal
        isOpen={Boolean(inspectCard)}
        onClose={() => setInspectCard(null)}
        title={inspectCard?.card_name_zh ?? '干员档案'}
        codeName={inspectCard?.card_id}
        size="sm"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setInspectCard(null)}>
            关闭
          </Button>
        }
      >
        {inspectCard && (() => {
          const p = getCardPresentation(inspectCard.card_id);
          const ownedCount = collection.owned[inspectCard.card_id] ?? 0;
          return (
            <div className="space-y-3 text-xs">
              <div className="flex justify-center">
                <CardFrame
                  cardId={inspectCard.card_id}
                  definition={inspectCard}
                  presentation={p}
                  variant="preview"
                  interactive={false}
                  ownedCount={ownedCount}
                  showOwnership
                  className="max-w-[220px] min-h-[260px]"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <Badge variant="class" value={p.profession}>{CLASS_LABEL[p.profession] ?? p.profession}</Badge>
                <span className="text-emerald-300 font-bold">当前库存：{ownedCount} / 2</span>
              </div>
              {inspectCard.rules_text_zh && (
                <div className="bg-[#11151c] p-2.5 border border-[#273240] text-slate-200 leading-relaxed">
                  {inspectCard.rules_text_zh}
                </div>
              )}
              {inspectCard.active_skill_text_zh && (
                <div className="bg-[#11151c] p-2.5 border border-[#273240] text-sky-300 leading-relaxed">
                  <strong>主动技能 ({inspectCard.active_skill_sp_cost ?? 0} SP)：</strong>
                  {inspectCard.active_skill_text_zh}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

type CardFrameCardId = CardFrameProps['cardId'];
