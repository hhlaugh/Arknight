import React, { useState } from 'react';
import type { ActionResult } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/gameData';
import { CardView } from '../components/cards/CardView';
import type { CardInstanceId, GameState, PlayerId } from '../game/types';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { playTacticalSfx } from '../audio/bgmPlayer';
import { playCombatSfx } from '../audio/combatSfx';
import tacticalCommandBackdrop from '../assets/images/tactical_command_backdrop_1795044168530.jpg';

interface MulliganViewProps {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly deckName: string;
  readonly waitingForOpponent?: boolean;
  readonly onConfirm: (selected: readonly CardInstanceId[]) => ActionResult | Promise<ActionResult>;
  readonly onLeave?: () => void;
  readonly leaveLabel?: string;
}

export function MulliganView({
  state,
  playerId,
  deckName,
  waitingForOpponent = false,
  onConfirm,
  onLeave,
  leaveLabel = '离开对局',
}: MulliganViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<CardInstanceId>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hand = state.players[playerId].hand;

  const toggle = (id: CardInstanceId) => {
    if (submitting) return;
    playCombatSfx('select');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < hand.length) next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      const swapCount = selected.size;
      const result = await onConfirm([...selected]);
      if (!result.ok) {
        playTacticalSfx('alert');
        setSubmitting(false);
        setError(result.reason ?? '换牌失败');
      } else {
        playCombatSfx(swapCount > 0 ? 'draw' : 'select');
        if (swapCount === 0) {
          playTacticalSfx('confirm');
        }
      }
    } catch (err) {
      playTacticalSfx('alert');
      setSubmitting(false);
      setError(err instanceof Error ? err.message : '换牌异常');
    }
  };

  if (waitingForOpponent || (submitting && !error)) {
    return (
      <div className="relative min-h-screen w-full bg-[#12161b] text-[#e8e9e6] flex flex-col items-center justify-center p-4 select-none overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          <img
            src={tacticalCommandBackdrop}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-[0.18]"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, rgba(16,20,26,0.48) 0%, rgba(12,15,20,0.92) 82%)',
            }}
          />
        </div>
        <Panel variant="raised" cornerCut="lg" scanlines className="relative z-10 max-w-md p-6 text-center space-y-3 border-[#52606d] bg-[#161b22]/92">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <h2 className="text-base font-bold text-white uppercase tracking-wider">
            起手调度已锁定 · {PLAYER_LABEL[playerId]}
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            编制：{deckName} · 正在等待对手完成调度同步…
          </p>
          {onLeave && (
            <div className="pt-2">
              <Button variant="ghost" size="sm" onClick={onLeave}>
                {leaveLabel}
              </Button>
            </div>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#12161b] text-[#e8e9e6] flex flex-col items-center justify-center p-2.5 sm:p-6 select-none overflow-y-auto">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <img
          src={tacticalCommandBackdrop}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-[0.18]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(16,20,26,0.45) 0%, rgba(12,15,20,0.9) 82%)',
          }}
        />
      </div>
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="relative z-10 w-full max-w-5xl border border-[#52606d] bg-[#161b22]/92 backdrop-blur-sm shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col my-auto"
      >
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="w-1.5 sm:w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                战术调度阶段 · 起手换牌
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                {PLAYER_LABEL[playerId]} · 当前编制: {deckName}
              </span>
            </div>
          </div>
          <span className="text-[11px] sm:text-xs font-mono text-amber-300 bg-amber-950/60 px-2 sm:px-2.5 py-0.5 sm:py-1 border border-amber-500/40">
            已选择换出: {selected.size} / {hand.length} 张
          </span>
        </div>

        {/* Instructions banner */}
        <div className="px-3 sm:px-5 py-2 bg-[#1a2026] border-b border-[#2e3740] text-[11px] sm:text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <span>点击勾选想要换掉的卡牌（可全不选）。换出卡牌将洗回牌库并等量抽取新手牌。</span>
          <span className="text-slate-400 text-[10px] font-mono hidden sm:inline">STEP: 01_DEPLOY_PREP</span>
        </div>

        {/* Hand Cards Selection Grid */}
        <div className="p-3 sm:p-6 bg-gradient-to-b from-[#1b2025] to-[#14181c] flex items-center justify-center">
          <div className="flex flex-wrap gap-2.5 sm:gap-4 justify-center items-center max-w-4xl">
            {hand.map((id) => (
              <CardView
                key={id}
                state={state}
                instanceId={id}
                selectable
                checked={selected.has(id)}
                interactive
                onClick={() => toggle(id)}
              />
            ))}
          </div>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="mx-3 sm:mx-6 mb-3 p-2.5 bg-rose-950/80 border border-rose-500 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 bg-[#121518] border-t border-[#313b43] flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[11px] text-slate-400 font-mono">
            {selected.size === 0 ? '保持当前起手手牌不作替换' : `替换选中的 ${selected.size} 张卡牌`}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {onLeave && (
              <Button variant="ghost" size="md" onClick={onLeave}>
                ✕ {leaveLabel}
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              cornerCut
              onClick={confirm}
              loading={submitting}
              className="font-bold px-5 sm:px-8 shadow-lg"
            >
              确认调度（换 {selected.size} 张） ▶
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
