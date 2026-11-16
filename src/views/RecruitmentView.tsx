import React, { useEffect, useMemo, useState } from 'react';
import { CARD_BY_ID, DEMO_CARDS } from '../client/demoData';
import type { UiCardDefinition } from '../client/demoData';
import { DEFAULT_POOL, GACHA_CONFIG, derivePoolMembers } from '../data/load-gacha-data';
import { performPull } from '../data/recruitment';
import type { PullOutcome } from '../data/recruitment';
import { applyPullOutcome, getActiveAccountName, getActiveCollection, isTestAccount } from '../data/playerCollection';
import { CardFrame } from '../components/cards/CardFrame';
import type { CardFrameProps } from '../components/cards/CardFrame';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

interface RecruitmentViewProps {
  readonly onBack: () => void;
}

interface PendingReveal {
  readonly outcome: PullOutcome;
  readonly seed: number;
  readonly revealed: number;
}

/**
 * 干员寻访（GACHA_PLAN_v0.3 §1/§4）：
 * 合成玉单货币；先算后演——performPull 纯函数产出结果 → applyPullOutcome 落库 → 演出只回放已落库结果；
 * seed 存入 pullHistory，结果可复现可审计。重复持有（≥2）自动转化为合成玉。
 */
export function RecruitmentView({ onBack }: RecruitmentViewProps) {
  const [accountName] = useState(() => getActiveAccountName());
  const [isTest] = useState(() => isTestAccount());
  const [collection, setCollection] = useState(() => getActiveCollection());
  const [pending, setPending] = useState<PendingReveal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const membersByRarity = useMemo(() => derivePoolMembers(DEMO_CARDS, DEFAULT_POOL).byRarity, []);
  const economy = GACHA_CONFIG.economy;

  // 十连逐张揭示（可跳过）：只回放已落库结果
  useEffect(() => {
    if (!pending || pending.revealed >= pending.outcome.results.length) return;
    const timer = window.setTimeout(() => {
      setPending((prev) => (prev ? { ...prev, revealed: Math.min(prev.outcome.results.length, prev.revealed + 1) } : prev));
    }, 130);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const pull = (count: 1 | 10) => {
    const current = getActiveCollection();
    const cost = count === 10 ? DEFAULT_POOL.cost.ten : DEFAULT_POOL.cost.single;
    if (current.currency.originite < cost) {
      setNotice(`合成玉不足：本次需要 ${cost}，当前 ${current.currency.originite}，还差 ${cost - current.currency.originite}。完成对局可获得合成玉。`);
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
    const updated = applyPullOutcome(outcome, DEFAULT_POOL.poolId, seed, count);
    setCollection(updated);
    setPending({ outcome, seed, revealed: 0 });
    setNotice(null);
  };

  const since6Star = collection.pity[DEFAULT_POOL.poolId]?.since6Star ?? 0;
  const pityPercent = Math.min(100, Math.round((since6Star / DEFAULT_POOL.pity.hardPityAt) * 100));
  const balance = collection.currency.originite;
  const singleCost = DEFAULT_POOL.cost.single;
  const tenCost = DEFAULT_POOL.cost.ten;
  const allRevealed = pending !== null && pending.revealed >= pending.outcome.results.length;
  const conversionTotal = pending?.outcome.originiteGained ?? 0;

  const renderResultCard = (cardId: CardFrameCardId, index: number) => {
    const definition = CARD_BY_ID.get(cardId);
    return (
      <div key={`${cardId}-${index}`} className="relative">
        <CardFrame cardId={cardId} definition={definition} variant="deck" className="w-full" />
        {definition && definition.rarity >= 6 && (
          <div className="absolute -top-1 -left-1 z-10 px-1 py-0.5 bg-amber-500 text-black text-[9px] font-black rounded-sm pointer-events-none">
            6★
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-4xl border border-[#4a555b] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                干员寻访 // RECRUITMENT
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                {DEFAULT_POOL.label} · 6★ 2% · 51 抽起每抽 +2% · 99 抽必出
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTest && (
              <span className="text-[9px] font-mono font-black text-rose-300 bg-rose-950/70 border border-rose-500/60 px-1.5 py-0.5">
                TEST
              </span>
            )}
            <Badge variant="neutral">账户 {accountName}</Badge>
            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/60 border border-amber-500/50 px-2 py-1">
              ◆ 合成玉 {balance}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 bg-gradient-to-b from-[#1b2025] to-[#14181c]">
          {notice && (
            <div className="px-3 py-2 bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between">
              <span>⚠️ {notice}</span>
              <button onClick={() => setNotice(null)} className="text-rose-400 hover:text-white ml-2">✕</button>
            </div>
          )}

          {/* Pity Progress & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="text-[10px] font-mono text-slate-400 mb-1">
                6★ 保底进度：{since6Star}/{DEFAULT_POOL.pity.hardPityAt}
                {since6Star >= DEFAULT_POOL.pity.softPityFrom ? ' · 天井提升中' : ''}
                {since6Star > 0 ? ` · 距必出还剩 ${DEFAULT_POOL.pity.hardPityAt - since6Star} 抽` : ''}
              </div>
              <div className="h-2 bg-[#0d1117] border border-[#2b353e] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-700 to-amber-400 transition-all" style={{ width: `${pityPercent}%` }} />
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">
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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-slate-400">
                  寻访结果（seed {pending.seed} 已记录，可复现）
                </span>
                {!allRevealed ? (
                  <Button variant="ghost" size="sm" onClick={() => setPending({ ...pending, revealed: pending.outcome.results.length })}>
                    跳过动画 ▶▶
                  </Button>
                ) : (
                  <span className="text-[11px] font-mono font-bold text-amber-300">
                    {conversionTotal > 0 ? `重复转化 ×${pending.outcome.conversions.length}：+${conversionTotal} 合成玉` : '全部为新收录干员'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2" onClick={() => !allRevealed && setPending({ ...pending, revealed: pending.outcome.results.length })}>
                {pending.outcome.results.map((cardId, index) =>
                  index < pending.revealed ? (
                    renderResultCard(cardId, index)
                  ) : (
                    <div
                      key={`pending-${index}`}
                      className="aspect-[3/4] bg-[#0d1117] border border-[#2b353e] flex items-center justify-center text-slate-600 text-xl font-mono"
                    >
                      ✦
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {!pending && (
            <div className="py-6 text-center space-y-2">
              <div className="text-sm text-slate-300 font-bold">消耗合成玉寻访干员，收录后即可用于卡组构筑</div>
              <div className="text-[10px] font-mono text-slate-500 leading-relaxed">
                新干员收录进库存（同名上限 2 张）· 重复干员自动转化为合成玉 · 完成对局（胜 +{economy.battleRewards.win} / 负 +{economy.battleRewards.lose}）补充合成玉
              </div>
            </div>
          )}
        </div>

        {/* History Footer */}
        <div className="px-4 sm:px-5 py-3 bg-[#121518] border-t border-[#313b43] text-[10px] font-mono text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span className="tracking-wider">最近寻访记录（{collection.pullHistory.length}/{200}）</span>
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
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                  <span>
                    {new Date(record.ts).toLocaleTimeString()} · {record.count === 10 ? '十连' : '单抽'}
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
    </div>
  );
}

type CardFrameCardId = CardFrameProps['cardId'];
