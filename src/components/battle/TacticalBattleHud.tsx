import React from 'react';
import type { GameState, PlayerId } from '../../game/types';
import { Button } from '../ui/Button';
import type { NetworkStatus } from '../../views/BattleView';
import { DEFAULT_ANIMATION_SPEED_MODE, type AnimationSpeedMode } from './combatPresentation';

interface TacticalBattleHudProps {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly bottomPlayer: PlayerId;
  readonly topPlayer: PlayerId;
  readonly hasPending: boolean;
  readonly isHotseat?: boolean;
  readonly networkStatus?: NetworkStatus | null;
  readonly seed?: number;
  readonly showLog: boolean;
  readonly onToggleLog: () => void;
  readonly showDetail: boolean;
  readonly onToggleDetail: () => void;
  readonly onSurrender?: () => void;
  readonly onExit?: () => void;
  readonly animSpeedMode?: AnimationSpeedMode;
  readonly onCycleAnimSpeed?: () => void;
  readonly enemyBaseDamageDelta?: number | null;
  readonly disableMotion?: boolean;
}

const SPEED_LABEL: Record<AnimationSpeedMode, { short: string; title: string }> = {
  slow: { short: '0.5x', title: '战斗动效：慢速（初始 0.5x · 点击切换为 1x 标准）' },
  normal: { short: '1x', title: '战斗动效：标准速度（点击切换为 2x 加速）' },
  fast: { short: '2x', title: '战斗动效：2x 加速（点击切换为关闭动效）' },
  off: { short: '关', title: '战斗动效：已关闭（点击恢复 0.5x 初始速度）' },
};

/**
 * 顶部战局与敌方阵地 HUD (TacticalBattleHud)
 * 采用响应式 CSS Grid 三分区布局：
 * - 桌面端：`grid-cols-[1fr_auto_1fr]` 让敌方基地状态精确居中对齐上方棋盘，左右分列回合信息与系统控制
 * - 移动端：`grid-cols-[1fr_auto]` 首行紧凑展示回合与系统控制，次行全宽展示敌方基地 HP/DP/手牌余量，绝不挤出或遮挡战场
 */
export function TacticalBattleHud({
  state,
  actor,
  bottomPlayer,
  topPlayer,
  hasPending,
  isHotseat = false,
  networkStatus,
  seed,
  showLog,
  onToggleLog,
  showDetail,
  onToggleDetail,
  onSurrender,
  onExit,
  animSpeedMode = DEFAULT_ANIMATION_SPEED_MODE,
  onCycleAnimSpeed,
  enemyBaseDamageDelta = null,
  disableMotion = false,
}: TacticalBattleHudProps) {
  const playerEnemy = state.players[topPlayer];
  const isAllyTurn = actor === bottomPlayer;
  const isEnemyTurn = actor === topPlayer;

  const phaseBadge = hasPending ? (
    <span className="px-1.5 sm:px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold text-[10px] sm:text-xs tracking-wider whitespace-nowrap">
      待选支援
    </span>
  ) : state.phase === 'action' ? (
    isHotseat ? (
      <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 font-bold text-[10px] sm:text-xs tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-emerald-400" />
        <span>{actor === 'player_a' ? '玩家 A 行动' : '玩家 B 行动'}</span>
      </span>
    ) : isAllyTurn ? (
      <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 font-bold text-[10px] sm:text-xs tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-emerald-400" />
        <span>我方回合</span>
      </span>
    ) : (
      <span className="px-1.5 sm:px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/60 font-bold text-[10px] sm:text-xs tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-rose-400" />
        <span>敌方回合</span>
      </span>
    )
  ) : (
    <span className="px-1.5 sm:px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 font-bold text-[10px] sm:text-xs tracking-wider whitespace-nowrap">
      结算中
    </span>
  );

  const enemyHit = enemyBaseDamageDelta !== null && enemyBaseDamageDelta > 0;
  const enemyHpPct = Math.max(0, Math.min(100, (playerEnemy.base_points / 10) * 100));

  return (
    <header className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-2 sm:px-3.5 py-1 sm:py-1.5 bg-[#0d1016] border-b border-[#232d3d] text-[#e8e9e6] shadow-md z-30 shrink-0 select-none">
      {/* 1. 左区：PRTS 官方菱形徽记 + 回合轮次与阶段状态 */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 justify-self-start">
        <img
          src="./assets/arknights/logos/prts_diamond.png"
          alt="PRTS"
          referrerPolicy="no-referrer"
          className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 object-contain opacity-90"
        />
        <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
          <span className="w-1 h-3.5 sm:h-4 bg-[#e5a52b]" />
          <span className="font-black text-xs sm:text-sm tracking-widest text-white">
            T{String(state.turn_number).padStart(2, '0')}
          </span>
        </div>

        <div className="shrink-0">{phaseBadge}</div>

        {networkStatus?.isOnline ? (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 whitespace-nowrap">
            <span className={`w-2 h-2 rounded-full ${networkStatus.opponentConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>房号 {networkStatus.roomCode}</span>
          </div>
        ) : (
          seed !== undefined && (
            <span className="text-[10px] font-mono text-slate-500 hidden 2xl:inline tabular-nums whitespace-nowrap">
              SEED:{seed}
            </span>
          )
        )}
      </div>

      {/* 2. 中区（移动端占第二行全宽，桌面端居正中）：敌方基地状态面板 */}
      <div
        data-testid="enemy-hud-panel"
        className={`col-span-2 md:col-span-1 order-3 md:order-2 justify-self-stretch md:justify-self-center relative flex items-center justify-between md:justify-center gap-2 sm:gap-3 px-2 sm:px-3.5 py-0.5 sm:py-1 bg-gradient-to-r from-[#1a1015] via-[#211319] to-[#1a1015] border transition-all duration-200 ${
          enemyHit
            ? `border-amber-400 ring-2 ring-amber-400/70 ${disableMotion ? '' : 'anim-base-hit'}`
            : isEnemyTurn
              ? 'border-rose-500 ring-1 ring-rose-500/45 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
              : 'border-rose-800/60'
        }`}
        style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
      >
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.2 bg-rose-600 text-white font-black text-[10px] sm:text-xs tracking-wider shrink-0 uppercase whitespace-nowrap">
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

          {/* 敌方基地生命值 + 紧凑进度条 */}
          <div className="relative flex items-center gap-1.5 font-mono tabular-nums">
            <div className="flex items-baseline gap-0.5 sm:gap-1">
              <span className="text-[10px] text-rose-400 font-bold">HP</span>
              <strong className={`text-sm sm:text-xl font-black leading-none ${enemyHit ? 'text-amber-300' : 'text-rose-400'}`}>
                {playerEnemy.base_points}
              </strong>
              <span className="text-[10px] text-slate-500">/10</span>
            </div>
            <div className="hidden sm:block w-14 h-1.5 bg-rose-950/80 border border-rose-900/70 overflow-hidden" aria-hidden="true">
              <div
                className="h-full bg-rose-500 transition-[width] duration-300"
                style={{ width: `${enemyHpPct}%` }}
              />
            </div>
            {enemyHit && !disableMotion && (
              <span
                aria-hidden="true"
                className="absolute -bottom-4 right-0 px-1 py-0.2 bg-amber-950/95 border border-amber-400 text-amber-200 font-mono font-black text-[10px] pointer-events-none z-50 anim-float-number"
              >
                -{enemyBaseDamageDelta}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 font-mono tabular-nums">
          <span className="h-3 w-px bg-rose-900/60 hidden sm:inline-block" aria-hidden="true" />
          {/* 敌方可用 DP */}
          <div className="flex items-baseline gap-0.5 sm:gap-1 text-xs sm:text-sm">
            <span className="text-[10px] text-rose-300/80 font-bold">DP</span>
            <strong className="font-black text-rose-300 leading-none">{playerEnemy.cost}</strong>
            <span className="text-[10px] text-rose-500/70">/10</span>
          </div>

          <span className="h-3 w-px bg-rose-900/60" aria-hidden="true" />

          {/* 敌方手牌与牌库余量 */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400 whitespace-nowrap">
            <span>
              <span className="hidden sm:inline">手牌 </span>
              <span className="sm:hidden">手</span>
              <strong className="text-slate-200">{playerEnemy.hand.length}</strong>
            </span>
            <span>·</span>
            <span>
              <span className="hidden sm:inline">牌库 </span>
              <span className="sm:hidden">库</span>
              <strong className="text-slate-200">{playerEnemy.deck.length}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. 右区：倍速、日志、档案与投降/退出操作 */}
      <div className="order-2 md:order-3 justify-self-end flex items-center gap-1 shrink-0">
        {onCycleAnimSpeed && (
          <Button
            variant={animSpeedMode === 'off' ? 'ghost' : 'secondary'}
            size="sm"
            onClick={onCycleAnimSpeed}
            title={SPEED_LABEL[animSpeedMode].title}
            aria-label={`切换战斗动效速度，当前：${SPEED_LABEL[animSpeedMode].short}`}
            className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 font-mono whitespace-nowrap ${
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
          className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 whitespace-nowrap"
        >
          📜<span className="hidden lg:inline ml-1">日志</span>
        </Button>

        <Button
          variant={showDetail ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleDetail}
          title={showDetail ? '关闭干员档案' : '查看干员档案'}
          className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 whitespace-nowrap"
        >
          🔍<span className="hidden lg:inline ml-1">档案</span>
        </Button>

        {(onSurrender || onExit) && (
          <>
            <span className="hidden sm:inline-block h-4 w-px bg-[#2b3746] mx-0.5" aria-hidden="true" />
            {onSurrender && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSurrender}
                title="宣告撤退（投降并直接进入胜负结算）"
                aria-label="投降"
                className="inline-flex text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 text-amber-200 bg-amber-950/45 border border-amber-500/50 hover:bg-amber-900/60 hover:border-amber-400 whitespace-nowrap"
              >
                🏳<span className="ml-0.5 sm:ml-1">投降</span>
              </Button>
            )}
            {onExit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onExit}
                title="退出当前对局并返回主菜单"
                aria-label="退出对局"
                className="inline-flex text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 shrink-0 text-rose-200 bg-rose-950/45 border border-rose-500/50 hover:bg-rose-900/60 hover:border-rose-400 whitespace-nowrap"
              >
                ✕<span className="ml-0.5 sm:ml-1">退出</span>
              </Button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
