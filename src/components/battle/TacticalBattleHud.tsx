import React from 'react';
import type { GameState, PlayerId } from '../../game/types';
import { Button } from '../ui/Button';
import type { NetworkStatus } from '../../views/BattleView';
import type { AnimationSpeedMode } from './combatPresentation';

interface TacticalBattleHudProps {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly bottomPlayer: PlayerId;
  readonly topPlayer: PlayerId;
  readonly canAct: boolean;
  readonly isActionPhase: boolean;
  readonly hasPending: boolean;
  readonly isHotseat?: boolean;
  readonly networkStatus?: NetworkStatus | null;
  readonly seed?: number;
  readonly showLog: boolean;
  readonly onToggleLog: () => void;
  readonly showDetail: boolean;
  readonly onToggleDetail: () => void;
  readonly onEndActionPhase: () => void;
  readonly animSpeedMode?: AnimationSpeedMode;
  readonly onCycleAnimSpeed?: () => void;
  readonly allyBaseDamageDelta?: number | null;
  readonly enemyBaseDamageDelta?: number | null;
  readonly disableMotion?: boolean;
}

const SPEED_LABEL: Record<AnimationSpeedMode, { short: string; title: string }> = {
  normal: { short: '1x', title: '战斗动效：标准速度（点击切换为 2x 加速）' },
  fast: { short: '2x', title: '战斗动效：2x 加速（点击切换为关闭动效）' },
  off: { short: '关', title: '战斗动效：已关闭（点击恢复标准速度）' },
};

/**
 * 战术核心顶部 HUD (TacticalBattleHud)
 * 依照《UI_REDESIGN.md》Section 4.1 & 4.6 规范：
 * - 左右双翼对峙设计：左侧【我方基地 / 罗德岛青蓝】 vs 右侧【敌方基地 / 整合运动绯红】
 * - 核心基本分（基地 HP）大号突出，在 360px 手机屏上自适应缩小边距与标签，严禁横向溢出
 * - 支持基地受击闪烁与跳字反馈，以及动效倍速/跳过切换控制
 */
export function TacticalBattleHud({
  state,
  actor,
  bottomPlayer,
  topPlayer,
  canAct,
  isActionPhase,
  hasPending,
  isHotseat = false,
  networkStatus,
  seed,
  showLog,
  onToggleLog,
  showDetail,
  onToggleDetail,
  onEndActionPhase,
  animSpeedMode = 'normal',
  onCycleAnimSpeed,
  allyBaseDamageDelta = null,
  enemyBaseDamageDelta = null,
  disableMotion = false,
}: TacticalBattleHudProps) {
  const playerAlly = state.players[bottomPlayer];
  const playerEnemy = state.players[topPlayer];

  const isAllyTurn = actor === bottomPlayer;
  const isEnemyTurn = actor === topPlayer;

  const phaseBadge = hasPending ? (
    <span className="px-1.5 sm:px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold text-[10px] sm:text-xs tracking-wider">
      待选支援
    </span>
  ) : state.phase === 'action' ? (
    isHotseat ? (
      <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 font-bold text-[10px] sm:text-xs tracking-wider flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-emerald-400" />
        <span>{actor === 'player_a' ? '玩家 A 行动' : '玩家 B 行动'}</span>
      </span>
    ) : isAllyTurn ? (
      <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 font-bold text-[10px] sm:text-xs tracking-wider flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-emerald-400" />
        <span>我方回合</span>
      </span>
    ) : (
      <span className="px-1.5 sm:px-2 py-0.5 bg-rose-500/25 text-rose-300 border border-rose-500/60 font-bold text-[10px] sm:text-xs tracking-wider flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-rose-400" />
        <span>敌方回合</span>
      </span>
    )
  ) : (
    <span className="px-1.5 sm:px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 font-bold text-[10px] sm:text-xs tracking-wider">
      结算中
    </span>
  );

  const allyHit = allyBaseDamageDelta !== null && allyBaseDamageDelta > 0;
  const enemyHit = enemyBaseDamageDelta !== null && enemyBaseDamageDelta > 0;

  return (
    <header className="flex items-center justify-between px-2 sm:px-3 py-1 bg-[#0d1016] border-b border-[#232d3d] text-[#e8e9e6] shadow-md z-30 shrink-0 select-none min-h-[46px] sm:min-h-[52px]">
      {/* 1. 左翼：我方基地状态 (ALLY BASE - 罗德岛青蓝) */}
      <div
        className={`relative flex items-center gap-1.5 sm:gap-2.5 px-1.5 sm:px-3 py-0.5 sm:py-1 bg-gradient-to-r from-sky-950/80 via-[#101926] to-[#0d1016] border transition-all duration-200 ${
          allyHit
            ? `border-rose-400 ring-2 ring-rose-500/70 ${disableMotion ? '' : 'anim-base-hit'}`
            : isAllyTurn
              ? 'border-sky-400 ring-1 sm:ring-2 ring-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
              : 'border-sky-700/50'
        }`}
        style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)' }}
      >
        <span className="px-1 sm:px-1.5 py-0.2 sm:py-0.5 bg-sky-500 text-slate-950 font-black text-[10px] sm:text-xs tracking-wider shrink-0 uppercase shadow-xs">
          {isHotseat ? (
            <>
              <span className="hidden sm:inline">{bottomPlayer === 'player_a' ? '玩家 A (行动方)' : '玩家 B (行动方)'}</span>
              <span className="sm:hidden">{bottomPlayer === 'player_a' ? '玩家 A' : '玩家 B'}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">我方基地</span>
              <span className="sm:hidden">我方</span>
            </>
          )}
        </span>

        {/* 基地核心生命值 (Base Points) */}
        <div className="relative flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums">
          <span className="text-[9px] sm:text-[10px] text-sky-400 font-bold">HP</span>
          <strong className={`text-lg sm:text-2xl font-black leading-none drop-shadow-sm ${allyHit ? 'text-rose-300' : 'text-sky-300'}`}>
            {playerAlly.base_points}
          </strong>
          <span className="text-[9px] sm:text-[10px] text-slate-500 hidden sm:inline">/10</span>
          {allyHit && !disableMotion && (
            <span
              aria-hidden="true"
              className="absolute -bottom-4 left-0 px-1 py-0.2 bg-rose-950/95 border border-rose-400 text-rose-200 font-mono font-black text-[10px] pointer-events-none z-50 anim-float-number"
            >
              -{allyBaseDamageDelta}
            </span>
          )}
        </div>

        {/* 可用费用 DP */}
        <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums bg-[#1c221a] border border-amber-500/50 px-1 sm:px-2 py-0.2 sm:py-0.5 shadow-xs">
          <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold">DP</span>
          <strong className="text-xs sm:text-sm font-black text-amber-300 leading-none">
            {playerAlly.cost}
          </strong>
          <span className="text-[9px] text-amber-500/80 hidden sm:inline">/10</span>
        </div>

        {/* 手牌/牌库信息 */}
        <div className="text-[10px] font-mono text-slate-400 hidden xl:flex flex-col leading-tight">
          <span>手牌: <strong className="text-slate-200">{playerAlly.hand.length}</strong></span>
          <span>牌库: <strong className="text-slate-200">{playerAlly.deck.length}</strong></span>
        </div>
      </div>

      {/* 2. 中央中枢：回合轮次、阶段标徽与指令 */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* 回合数 */}
        <div className="flex items-center gap-1 font-mono shrink-0">
          <span className="w-1 h-3 sm:w-1.5 sm:h-4 bg-[#e5a52b]" />
          <span className="font-black text-xs sm:text-sm tracking-widest text-white">
            T{String(state.turn_number).padStart(2, '0')}
          </span>
        </div>

        {/* 阶段徽章 */}
        <div className="shrink-0">{phaseBadge}</div>

        {/* 结束行动阶段按钮 (桌面端显式展示，移动端也可以快捷点击) */}
        <Button
          variant={canAct && isActionPhase && isAllyTurn ? 'primary' : 'ghost'}
          size="sm"
          disabled={!canAct || !isActionPhase || hasPending || !isAllyTurn}
          onClick={onEndActionPhase}
          className={`text-[11px] sm:text-xs px-2 sm:px-3 font-bold transition-all shrink-0 ${
            canAct && isActionPhase && isAllyTurn
              ? 'ring-1 sm:ring-2 ring-amber-400/50 shadow-[0_0_12px_rgba(229,165,43,0.4)]'
              : 'opacity-40'
          }`}
        >
          <span className="hidden sm:inline">结束行动</span>
          <span className="sm:hidden">回合结束</span>
        </Button>

        {/* 网络状态 / 随机种子 */}
        {networkStatus?.isOnline ? (
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${networkStatus.opponentConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-slate-400">房号 {networkStatus.roomCode}</span>
          </div>
        ) : (
          seed !== undefined && (
            <span className="text-[10px] font-mono text-slate-500 hidden 2xl:inline">
              SEED:{seed}
            </span>
          )
        )}

        {/* 日志、档案与动效倍速/跳过切换 */}
        <div className="flex items-center gap-1">
          {onCycleAnimSpeed && (
            <Button
              variant={animSpeedMode === 'off' ? 'ghost' : 'secondary'}
              size="sm"
              onClick={onCycleAnimSpeed}
              title={SPEED_LABEL[animSpeedMode].title}
              aria-label={`切换战斗动效速度，当前：${SPEED_LABEL[animSpeedMode].short}`}
              className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 font-mono ${
                animSpeedMode === 'off' ? 'text-slate-400 border border-slate-700' : 'text-amber-300'
              }`}
            >
              ⚡<span className="ml-0.5">{SPEED_LABEL[animSpeedMode].short}</span>
            </Button>
          )}

          <Button
            variant={showLog ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleLog}
            title={showLog ? '关闭战斗日志' : '打开战斗日志'}
            className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0"
          >
            📜<span className="hidden md:inline ml-1">日志</span>
          </Button>

          <Button
            variant={showDetail ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleDetail}
            title={showDetail ? '关闭干员档案' : '查看干员档案'}
            className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0"
          >
            🔍<span className="hidden md:inline ml-1">档案</span>
          </Button>
        </div>
      </div>

      {/* 3. 右翼：敌方基地状态 (ENEMY BASE - 整合运动绯红) */}
      <div
        className={`relative flex items-center gap-1.5 sm:gap-2.5 px-1.5 sm:px-3 py-0.5 sm:py-1 bg-gradient-to-l from-rose-950/80 via-[#221217] to-[#0d1016] border transition-all duration-200 ${
          enemyHit
            ? `border-amber-400 ring-2 ring-amber-400/70 ${disableMotion ? '' : 'anim-base-hit'}`
            : isEnemyTurn
              ? 'border-rose-500 ring-1 sm:ring-2 ring-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
              : 'border-rose-700/50'
        }`}
        style={{ clipPath: 'polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px)' }}
      >
        {/* 手牌/牌库信息 */}
        <div className="text-[10px] font-mono text-slate-400 hidden xl:flex flex-col text-right leading-tight">
          <span>手牌: <strong className="text-slate-200">{playerEnemy.hand.length}</strong></span>
          <span>牌库: <strong className="text-slate-200">{playerEnemy.deck.length}</strong></span>
        </div>

        {/* 可用费用 DP */}
        <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums bg-[#241418] border border-rose-500/40 px-1 sm:px-2 py-0.2 sm:py-0.5 shadow-xs">
          <span className="text-[9px] sm:text-[10px] text-rose-300 font-bold">DP</span>
          <strong className="text-xs sm:text-sm font-black text-rose-300 leading-none">
            {playerEnemy.cost}
          </strong>
          <span className="text-[9px] text-rose-500/80 hidden sm:inline">/10</span>
        </div>

        {/* 基地核心生命值 (Base Points) */}
        <div className="relative flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums">
          <span className="text-[9px] sm:text-[10px] text-rose-400 font-bold">HP</span>
          <strong className={`text-lg sm:text-2xl font-black leading-none drop-shadow-sm ${enemyHit ? 'text-amber-300' : 'text-rose-400'}`}>
            {playerEnemy.base_points}
          </strong>
          <span className="text-[9px] sm:text-[10px] text-slate-500 hidden sm:inline">/10</span>
          {enemyHit && !disableMotion && (
            <span
              aria-hidden="true"
              className="absolute -bottom-4 right-0 px-1 py-0.2 bg-amber-950/95 border border-amber-400 text-amber-200 font-mono font-black text-[10px] pointer-events-none z-50 anim-float-number"
            >
              -{enemyBaseDamageDelta}
            </span>
          )}
        </div>

        <span className="px-1 sm:px-1.5 py-0.2 sm:py-0.5 bg-rose-600 text-white font-black text-[10px] sm:text-xs tracking-wider shrink-0 uppercase shadow-xs">
          {isHotseat ? (
            <>
              <span className="hidden sm:inline">{topPlayer === 'player_a' ? '玩家 A (等待中)' : '玩家 B (等待中)'}</span>
              <span className="sm:hidden">{topPlayer === 'player_a' ? '玩家 A' : '玩家 B'}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">敌方基地</span>
              <span className="sm:hidden">敌方</span>
            </>
          )}
        </span>
      </div>
    </header>
  );
}
