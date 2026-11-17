import React, { useEffect } from 'react';
import type { LocalGameSetup, LocalGameSnapshot } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/gameData';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { playTacticalSfx } from '../audio/bgmPlayer';
import { playCombatSfx } from '../audio/combatSfx';

interface SettlementViewProps {
  readonly snapshot: LocalGameSnapshot;
  readonly setup: LocalGameSetup;
  readonly modeLabel?: string;
  readonly outcome?: 'victory' | 'defeat' | 'draw';
  readonly reward?: { readonly originite: number; readonly accountName: string } | null;
  readonly onRestart: () => void;
  readonly onExit: () => void;
}

export function SettlementView({ snapshot, setup, modeLabel, outcome, reward, onRestart, onExit }: SettlementViewProps) {
  const state = snapshot.state;
  const isWinnerA = state.winner === 'player_a';
  const isWinnerB = state.winner === 'player_b';
  const isDraw = state.winner === 'draw';
  const winnerText = isDraw
    ? '战术平局'
    : state.winner && state.winner !== 'draw'
    ? `${PLAYER_LABEL[state.winner]} 作战胜利`
    : '未分胜负';

  useEffect(() => {
    const isVictory =
      outcome === 'victory' ||
      (outcome === undefined && (state.winner === 'player_a' || state.winner === 'player_b'));
    playCombatSfx(isVictory ? 'victory' : 'defeat_match', 90);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-xl border border-[#4a555b] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <h2 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
              作战推演报告 // MISSION SETTLEMENT
            </h2>
          </div>
          {modeLabel && <span className="text-[10px] font-mono text-slate-400">{modeLabel}</span>}
        </div>

        {/* Victory/Defeat Banner */}
        <div className="p-6 sm:p-8 text-center bg-gradient-to-b from-[#1f262d] to-[#161a1e] border-b border-[#2e3740]">
          <div className="inline-block mb-2">
            <Badge variant={isWinnerA ? 'ally' : isWinnerB ? 'enemy' : 'neutral'} className="text-xs px-3 py-1 font-bold">
              {isDraw ? 'DRAW' : 'VICTORY'}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-widest uppercase m-0">
            {winnerText}
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-2">
            推演总回合: {state.turn_number} · 记录战斗事件: {snapshot.logHistory.length} 条
          </p>
        </div>

        {/* Originite Reward */}
        {reward && (
          <div className="px-4 sm:px-5 py-2.5 bg-[#10141a] border-b border-[#2e3740] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="text-amber-300 font-bold">◆ 合成玉 +{reward.originite}</span>
            <span className="text-slate-400 text-[10px]">已发放至账户 {reward.accountName} · 可在干员寻访中使用</span>
          </div>
        )}

        {/* Tactical Metrics Grid */}
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#13171b] text-xs font-mono">
          <div className="p-3 bg-[#191e24] border border-[#2b353e] space-y-1">
            <div className="text-sky-400 font-bold flex items-center justify-between">
              <span>玩家 A</span>
              <span>{state.players.player_a.base_points} HP</span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              编制: {setup.decks.player_a.deck_name_zh}
            </div>
            <div className="text-[10px] text-slate-500">
              行动回合: {state.players.player_a.turns_taken}
            </div>
          </div>

          <div className="p-3 bg-[#191e24] border border-[#2b353e] space-y-1">
            <div className="text-rose-400 font-bold flex items-center justify-between">
              <span>玩家 B</span>
              <span>{state.players.player_b.base_points} HP</span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              编制: {setup.decks.player_b.deck_name_zh}
            </div>
            <div className="text-[10px] text-slate-500">
              行动回合: {state.players.player_b.turns_taken}
            </div>
          </div>
        </div>

        {/* Seed Info */}
        <div className="px-4 sm:px-5 py-2 bg-[#101316] border-t border-[#242b32] text-[10px] font-mono text-slate-500 flex flex-wrap justify-between gap-2">
          <span>SEED // {setup.seed}</span>
          <span>REPLAY INVARIANTS: PASS</span>
        </div>

        {/* Actions */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#14171a] border-t border-[#313b43] flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              playTacticalSfx('click');
              onExit();
            }}
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
            className="font-bold px-6"
          >
            再来一局（新种子） ▶
          </Button>
        </div>
      </Panel>
    </div>
  );
}
