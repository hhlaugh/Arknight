import React, { useEffect, useMemo, useState } from 'react';
import type { LocalGameSetup, LocalGameSnapshot } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/gameData';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { OrundumIcon } from '../components/ui/OrundumIcon';
import { OperatorPortrait } from '../components/cards/OperatorPortrait';
import { LogView } from '../components/battle/LogView';
import { computeSettlementSummary } from '../components/battle/settlementStats';
import { playTacticalSfx } from '../audio/bgmPlayer';
import { playCombatSfx } from '../audio/combatSfx';
import settlementOperationKeyart from '../assets/images/settlement_operation_keyart_1795044171854.jpg';
import tacticalCommandBackdrop from '../assets/images/tactical_command_backdrop_1795044168530.jpg';

interface SettlementViewProps {
  readonly snapshot: LocalGameSnapshot;
  readonly setup: LocalGameSetup;
  readonly modeLabel?: string;
  readonly outcome?: 'victory' | 'defeat' | 'draw';
  readonly reward?: { readonly originite: number; readonly accountName: string } | null;
  readonly onRestart: () => void;
  readonly onExit: () => void;
}

type SettlementTab = 'overview' | 'log';

interface ComparisonRowProps {
  readonly label: string;
  readonly leftValue: number;
  readonly rightValue: number;
  readonly unit?: string;
}

function ComparisonRow({ label, leftValue, rightValue, unit = '' }: ComparisonRowProps) {
  const total = Math.max(1, leftValue + rightValue);
  const leftPct = Math.round((leftValue / total) * 100);
  const rightPct = 100 - leftPct;

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-mono tabular-nums">
        <span className="text-left font-bold text-sky-300">
          {leftValue}
          {unit}
        </span>
        <span className="text-[11px] font-sans text-slate-400">{label}</span>
        <span className="text-right font-bold text-rose-300">
          {rightValue}
          {unit}
        </span>
      </div>
      <div className="h-1.5 w-full bg-[#0d1117] border border-[#25303d] flex overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-gradient-to-r from-sky-600 to-cyan-400 transition-[width] duration-300"
          style={{ width: `${leftValue === 0 && rightValue === 0 ? 50 : leftPct}%`, opacity: leftValue === 0 && rightValue === 0 ? 0.2 : 1 }}
        />
        <div
          className="h-full bg-gradient-to-l from-rose-600 to-rose-400 transition-[width] duration-300"
          style={{ width: `${leftValue === 0 && rightValue === 0 ? 50 : rightPct}%`, opacity: leftValue === 0 && rightValue === 0 ? 0.2 : 1 }}
        />
      </div>
    </div>
  );
}

export function SettlementView({
  snapshot,
  setup,
  modeLabel,
  outcome,
  reward,
  onRestart,
  onExit,
}: SettlementViewProps) {
  const state = snapshot.state;
  const [activeTab, setActiveTab] = useState<SettlementTab>('overview');

  const resolvedOutcome: 'victory' | 'defeat' | 'draw' =
    outcome ??
    (state.winner === 'draw'
      ? 'draw'
      : state.winner === 'player_a' || state.winner === 'player_b'
        ? 'victory'
        : 'draw');

  const summary = useMemo(() => computeSettlementSummary(snapshot), [snapshot]);
  const sideA = summary.sides.player_a;
  const sideB = summary.sides.player_b;
  const mvp = summary.mvp;

  const isVictory = resolvedOutcome === 'victory';
  const isDefeat = resolvedOutcome === 'defeat';
  const isDraw = resolvedOutcome === 'draw';

  const outcomeEn = isDraw ? 'TACTICAL DRAW' : isDefeat ? 'TACTICAL RETREAT' : 'MISSION ACCOMPLISHED';
  const headlineText = isDraw
    ? '战术平局 · 双方均势收官'
    : state.winner && state.winner !== 'draw'
      ? `${PLAYER_LABEL[state.winner]} 作战胜利`
      : isDefeat
        ? '防线突破 · 作战撤退'
        : '作战胜利';

  const accentBorderClass = isVictory
    ? 'border-t-amber-400/90'
    : isDefeat
      ? 'border-t-rose-500/90'
      : 'border-t-cyan-400/90';

  const outcomeTextClass = isVictory
    ? 'text-amber-300'
    : isDefeat
      ? 'text-rose-300'
      : 'text-cyan-300';

  useEffect(() => {
    playCombatSfx(isVictory ? 'victory' : 'defeat_match', 90);
  }, [isVictory]);

  const hpPctA = Math.max(0, Math.min(100, (sideA.baseHp / 20) * 100));
  const hpPctB = Math.max(0, Math.min(100, (sideB.baseHp / 20) * 100));

  return (
    <div className="relative min-h-screen w-full bg-[#11151b] text-[#e8e9e6] flex flex-col items-center justify-center p-3 sm:p-6 select-none overflow-hidden">
      {/* 环境指挥舰桥暗场底图 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <img
          src={tacticalCommandBackdrop}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-[0.18] scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(16,20,27,0.45) 0%, rgba(11,15,20,0.88) 76%, rgba(8,11,15,0.97) 100%)',
          }}
        />
      </div>

      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        grid
        className={`relative z-10 w-full max-w-3xl border border-[#4a5662] border-t-2 ${accentBorderClass} shadow-[0_24px_64px_rgba(0,0,0,0.82)] flex flex-col overflow-hidden`}
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-[#14181e]/95 border-b border-[#2e3844]">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="./assets/arknights/logos/prts_diamond.png"
              alt="PRTS"
              referrerPolicy="no-referrer"
              className="w-5 h-5 object-contain opacity-90 shrink-0"
            />
            <h2 className="text-sm sm:text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight truncate">
              作战推演报告 · MISSION SETTLEMENT
            </h2>
          </div>
          {modeLabel && (
            <span className="text-[11px] font-mono text-slate-400 truncate">
              {modeLabel}
            </span>
          )}
        </div>

        {/* Hero Result Banner with Atmospheric Key Art & Base Scoreboard */}
        <div className="relative px-4 sm:px-7 py-6 sm:py-8 bg-[#12171e] border-b border-[#2a333e] overflow-hidden">
          <img
            src={settlementOperationKeyart}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-45"
          />
          <img
            src="./assets/arknights/logos/rhodes_island_dark.png"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="pointer-events-none select-none absolute right-4 top-1/2 -translate-y-1/2 w-40 h-40 object-contain opacity-[0.16]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: isVictory
                ? 'radial-gradient(circle at 30% 45%, rgba(229,165,43,0.16) 0%, rgba(14,18,24,0.78) 55%, rgba(11,15,20,0.95) 100%)'
                : isDefeat
                  ? 'radial-gradient(circle at 30% 45%, rgba(244,63,94,0.18) 0%, rgba(14,18,24,0.82) 55%, rgba(11,15,20,0.96) 100%)'
                  : 'radial-gradient(circle at 30% 45%, rgba(56,189,248,0.14) 0%, rgba(14,18,24,0.8) 55%, rgba(11,15,20,0.96) 100%)',
            }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className={`text-[11px] font-mono font-bold tracking-[0.22em] uppercase ${outcomeTextClass}`}>
                {outcomeEn}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide m-0 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                {headlineText}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono tabular-nums pt-0.5">
                <span>推演回合 {state.turn_number}</span>
                <span aria-hidden="true">·</span>
                <span>战斗事件 {summary.totalEvents} 条</span>
                <span aria-hidden="true">·</span>
                <span>总伤害 {sideA.damageDealt + sideB.damageDealt}</span>
              </div>
            </div>

            {/* Base HP Duel Scoreline */}
            <div className="holo-frame shrink-0 px-3.5 py-2.5 bg-[#0e131a]/90 border border-[#323e4d] flex items-center gap-4 font-mono tabular-nums">
              <div className="text-center">
                <div className="text-[10px] text-sky-400 font-bold">玩家 A 基地</div>
                <div className="text-xl font-black text-white leading-tight">
                  {sideA.baseHp}
                  <span className="text-[11px] font-normal text-slate-500">/20</span>
                </div>
              </div>
              <span className="text-xs font-black text-slate-500">VS</span>
              <div className="text-center">
                <div className="text-[10px] text-rose-400 font-bold">玩家 B 基地</div>
                <div className="text-xl font-black text-white leading-tight">
                  {sideB.baseHp}
                  <span className="text-[11px] font-normal text-slate-500">/20</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Orundum Reward Banner */}
        {reward && (
          <div className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-[#1a1610] via-[#171b22] to-[#11151b] border-b border-[#343228] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="inline-flex items-center gap-2 text-amber-300 font-bold">
              <OrundumIcon size="md" />
              <span className="text-sm tabular-nums">{`战果补给 · 合成玉 +${reward.originite}`}</span>
            </span>
            <span className="text-slate-300 text-[11px]">
              已记入账户 {reward.accountName} · 可前往干员寻访使用
            </span>
          </div>
        )}

        {/* Segmented Tab Control */}
        <div className="px-4 sm:px-6 pt-3.5 pb-2 bg-[#141920] flex flex-wrap items-center justify-between gap-2 border-b border-[#252f3a]">
          <div role="tablist" aria-label="战后报告视图" className="inline-flex items-center gap-1 p-1 bg-[#0e1218] border border-[#2a3441]">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'overview'}
              onClick={() => {
                playTacticalSfx('click');
                setActiveTab('overview');
              }}
              className={`px-3 py-1.5 text-xs font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-[#e5a52b] text-[#11151b]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              战果总览
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'log'}
              onClick={() => {
                playTacticalSfx('click');
                setActiveTab('log');
              }}
              className={`px-3 py-1.5 text-xs font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                activeTab === 'log'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              战斗记录 ({summary.totalEvents})
            </button>
          </div>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            种子 {setup.seed}
          </span>
        </div>

        {/* Main Tab Content */}
        {activeTab === 'overview' ? (
          <div className="p-4 sm:p-6 bg-[#141920] space-y-5">
            {/* MVP Operator Spotlight */}
            {mvp ? (
              <div
                data-testid="settlement-mvp-card"
                className="holo-frame relative p-3.5 sm:p-4 bg-[#10151c] border border-[#303d4d] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 overflow-hidden"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-amber-400/75 via-cyan-300/60 to-transparent"
                />
                <div className="flex items-center gap-3 min-w-0">
                  <OperatorPortrait
                    cardId={mvp.cardId}
                    variant="avatar"
                    className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 border border-amber-400/60 bg-[#0b0e13]"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-amber-300 font-bold tracking-wider uppercase">
                      <span>全场关键干员 · MVP</span>
                      <span aria-hidden="true">·</span>
                      <span className={mvp.ownerId === 'player_a' ? 'text-sky-300' : 'text-rose-300'}>
                        {PLAYER_LABEL[mvp.ownerId]}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base sm:text-lg font-black text-white truncate">
                        {mvp.cardNameZh}
                      </span>
                      <span className="text-xs font-mono text-amber-400 shrink-0">
                        {'★'.repeat(mvp.rarity)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center font-mono tabular-nums pt-2 sm:pt-0 border-t sm:border-t-0 border-[#232d38] shrink-0">
                  <div>
                    <div className="text-[10px] text-slate-400">总输出</div>
                    <div className="text-sm font-black text-rose-300">{mvp.damageDealt}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">击倒</div>
                    <div className="text-sm font-black text-amber-300">{mvp.kills}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">治疗</div>
                    <div className="text-sm font-black text-emerald-300">{mvp.healingDone}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">技能</div>
                    <div className="text-sm font-black text-cyan-300">{mvp.skillsActivated}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 bg-[#10151c] border border-[#28323e] text-xs font-mono text-slate-400 text-center">
                本次推演尚未发生干员交锋事件（提前结束或撤退结算）。
              </div>
            )}

            {/* Faction Decks & Base Integrity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs font-mono tabular-nums">
              <div className="p-3.5 bg-[#10151c] border border-[#2a3848] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sky-300 font-black">玩家 A 编队</span>
                  <span className="text-slate-200 font-bold">{`${sideA.baseHp} / 20 HP`}</span>
                </div>
                <div className="h-1.5 w-full bg-[#090d12] border border-[#233040] overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-sky-400 transition-[width] duration-300" style={{ width: `${hpPctA}%` }} />
                </div>
                <div className="text-[11px] text-slate-300 truncate font-sans">
                  {setup.decks.player_a.deck_name_zh}
                </div>
                <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5">
                  <span>回合 {sideA.turnsTaken}</span>
                  <span aria-hidden="true">·</span>
                  <span>手牌 {sideA.handCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>牌库 {sideA.deckCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>护盾抵伤 {sideA.shieldAbsorbed}</span>
                </div>
              </div>

              <div className="p-3.5 bg-[#10151c] border border-[#3f2c35] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-rose-300 font-black">玩家 B 编队</span>
                  <span className="text-slate-200 font-bold">{`${sideB.baseHp} / 20 HP`}</span>
                </div>
                <div className="h-1.5 w-full bg-[#090d12] border border-[#3a2530] overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-rose-400 transition-[width] duration-300" style={{ width: `${hpPctB}%` }} />
                </div>
                <div className="text-[11px] text-slate-300 truncate font-sans">
                  {setup.decks.player_b.deck_name_zh}
                </div>
                <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5">
                  <span>回合 {sideB.turnsTaken}</span>
                  <span aria-hidden="true">·</span>
                  <span>手牌 {sideB.handCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>牌库 {sideB.deckCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>护盾抵伤 {sideB.shieldAbsorbed}</span>
                </div>
              </div>
            </div>

            {/* Proportional Tactical Metrics Comparison */}
            <div className="p-4 bg-[#10151c] border border-[#28323e] space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1 border-b border-[#202934]">
                <span className="text-sky-300 font-bold">玩家 A</span>
                <span className="tracking-wider text-slate-300 font-bold">战术统计对比</span>
                <span className="text-rose-300 font-bold">玩家 B</span>
              </div>
              <ComparisonRow label="总输出伤害" leftValue={sideA.damageDealt} rightValue={sideB.damageDealt} />
              <ComparisonRow label="基地直击伤害" leftValue={sideA.baseDamageDealt} rightValue={sideB.baseDamageDealt} />
              <ComparisonRow label="击倒干员数" leftValue={sideA.kills} rightValue={sideB.kills} />
              <ComparisonRow label="部署干员次数" leftValue={sideA.deployments} rightValue={sideB.deployments} />
              <ComparisonRow label="技能与治疗量" leftValue={sideA.skillsActivated + sideA.healingDone} rightValue={sideB.skillsActivated + sideB.healingDone} />
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 bg-[#141920] h-[340px] sm:h-[380px]">
            <LogView history={snapshot.logHistory} state={state} />
          </div>
        )}

        {/* Actions Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#12161c] border-t border-[#2d3642] flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              playTacticalSfx('click');
              onExit();
            }}
            className="min-h-[44px] whitespace-nowrap"
          >
            ◀ 返回主菜单
          </Button>
          <Button
            variant="primary"
            size="md"
            cornerCut
            onClick={() => {
              playTacticalSfx('confirm');
              onRestart();
            }}
            className="min-h-[44px] font-bold px-6 whitespace-nowrap"
          >
            再来一局（新种子） ▶
          </Button>
        </div>
      </Panel>
    </div>
  );
}
