import React from 'react';
import type { CardInstanceId, GameState, PlayerId } from '../../game/types';
import { CardView, cardDefinitionOf } from '../cards/CardView';
import { Button } from '../ui/Button';
import type { HoveredCardPreview } from './CardPreviewPopover';

interface PlayerHandDockProps {
  readonly state: GameState;
  readonly bottomPlayer: PlayerId;
  readonly actor: PlayerId;
  readonly canAct: boolean;
  readonly isActionPhase: boolean;
  readonly hasPending: boolean;
  readonly isHotseat: boolean;
  readonly isMobile: boolean;
  readonly isLandscape?: boolean;
  readonly layoutMode?: 'bottom' | 'side-rail';
  readonly selection: CardInstanceId | null;
  readonly draggingCardId: CardInstanceId | null;
  readonly allyBaseDamageDelta?: number | null;
  readonly disableMotion?: boolean;
  readonly selectionPrompt?: React.ReactNode;
  readonly onHandCardClick: (id: CardInstanceId) => void;
  readonly onLongPressCard: (id: CardInstanceId) => void;
  readonly onHoverCard: (preview: HoveredCardPreview | null) => void;
  readonly onDragStartCard: (id: CardInstanceId, e: React.DragEvent) => void;
  readonly onDragEndCard: () => void;
  readonly onEndActionPhase: () => void;
}

const DP_CAP = 10;

/**
 * 己方指挥面板与手牌托盘 (PlayerHandDock)
 * 自适应双布局模式：
 * - `bottom`（竖屏手机 / 平板 / 桌面默认）：底部横向托盘，窄屏下精准压缩刻度条与卡片尺寸，确保「结束行动 ▶」与棋盘同屏无裁切
 * - `side-rail`（手机横屏 / 超矮视口）：右侧战术侧栏，顶部集中展示 HP/DP 与「结束行动 ▶」，下方以双列网格平铺手牌，释放全部纵向高度给四行棋盘
 */
export function PlayerHandDock({
  state,
  bottomPlayer,
  actor,
  canAct,
  isActionPhase,
  hasPending,
  isHotseat,
  isMobile,
  layoutMode = 'bottom',
  selection,
  draggingCardId,
  allyBaseDamageDelta = null,
  disableMotion = false,
  selectionPrompt,
  onHandCardClick,
  onLongPressCard,
  onHoverCard,
  onDragStartCard,
  onDragEndCard,
  onEndActionPhase,
}: PlayerHandDockProps) {
  const playerAlly = state.players[bottomPlayer];
  const isAllyTurn = actor === bottomPlayer;
  const canEndTurn = canAct && isActionPhase && !hasPending && isAllyTurn;
  const allyHit = allyBaseDamageDelta !== null && allyBaseDamageDelta > 0;
  const litPips = Math.min(DP_CAP, Math.max(0, playerAlly.cost));
  const canInteractHand = isActionPhase && !hasPending && isAllyTurn && canAct;
  const allyHpPct = Math.max(0, Math.min(100, (playerAlly.base_points / 10) * 100));

  if (layoutMode === 'side-rail') {
    return (
      <section
        data-testid="player-hand-dock"
        onClick={(e) => e.stopPropagation()}
        className="w-[228px] sm:w-[254px] h-full min-h-0 bg-[#0e131b] border-l border-[#263244] shrink-0 flex flex-col z-20 shadow-[-8px_0_24px_rgba(0,0,0,0.45)]"
      >
        {/* 侧栏顶部：我方 HP + DP + 结束行动 */}
        <div
          className={`p-2 bg-[#111824] border-b space-y-1.5 shrink-0 transition-colors ${
            allyHit
              ? `border-rose-400 bg-rose-950/30 ${disableMotion ? '' : 'anim-base-hit'}`
              : isAllyTurn
                ? 'border-sky-500/45'
                : 'border-[#212b3a]'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="relative flex items-center gap-1.5 font-mono tabular-nums">
              <span className="px-1 py-0.2 bg-sky-500 text-slate-950 font-black text-[10px] tracking-wider uppercase shrink-0">
                {isHotseat ? (bottomPlayer === 'player_a' ? 'A方' : 'B方') : '我方'}
              </span>
              <span className="text-[10px] text-sky-400 font-bold">HP</span>
              <strong className={`text-sm font-black leading-none ${allyHit ? 'text-rose-300' : 'text-sky-300'}`}>
                {playerAlly.base_points}
              </strong>
              <span className="text-[9px] text-slate-500">/10</span>
              {allyHit && !disableMotion && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-4 left-2 px-1 py-0.2 bg-rose-950/95 border border-rose-400 text-rose-200 font-mono font-black text-[10px] pointer-events-none z-50 anim-float-number"
                >
                  -{allyBaseDamageDelta}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-slate-400">
              <span>
                手<strong className="text-slate-100">{playerAlly.hand.length}</strong>
              </span>
              <span>·</span>
              <span>
                库<strong className="text-slate-100">{playerAlly.deck.length}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 font-mono tabular-nums" aria-label={`当前可用费用 ${playerAlly.cost} / 10 DP`}>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[10px] text-amber-400 font-bold">DP</span>
              <strong className="text-sm font-black text-amber-300 leading-none">{playerAlly.cost}</strong>
              <span className="text-[9px] text-amber-500/75">/10</span>
            </div>
            <div className="flex items-center gap-[2px] flex-1 justify-end" aria-hidden="true">
              {Array.from({ length: DP_CAP }, (_, idx) => {
                const active = idx < litPips;
                return (
                  <span
                    key={idx}
                    className={`w-1.5 h-2.5 transition-colors ${
                      active
                        ? 'bg-[#e5a52b] shadow-[0_0_4px_rgba(229,165,43,0.45)]'
                        : 'bg-[#1f2836] border border-[#2d394b]'
                    }`}
                  />
                );
              })}
              {playerAlly.cost > DP_CAP && (
                <span className="text-[9px] font-bold text-amber-300 ml-0.5">
                  +{playerAlly.cost - DP_CAP}
                </span>
              )}
            </div>
          </div>

          <Button
            variant={canEndTurn ? 'primary' : 'ghost'}
            size="sm"
            cornerCut
            disabled={!canEndTurn}
            onClick={onEndActionPhase}
            className={`w-full text-xs min-h-[34px] font-bold whitespace-nowrap transition-all ${
              canEndTurn
                ? 'ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(229,165,43,0.35)]'
                : 'opacity-45 border border-slate-700/70'
            }`}
          >
            结束行动 ▶
          </Button>
        </div>

        {/* 选中提示条 */}
        {selectionPrompt && (
          <div className="px-2 py-1.5 bg-[#16202e] border-b border-[#29384d] flex flex-col gap-1 text-[11px] text-amber-300 shrink-0">
            {selectionPrompt}
          </div>
        )}

        {/* 手牌双列纵向滚动网格 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5">
          {playerAlly.hand.length === 0 ? (
            <div className="w-full text-center py-6 text-xs text-slate-500 font-mono">
              （暂无手牌）
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 content-start">
              {playerAlly.hand.map((id) => {
                const def = cardDefinitionOf(state, id);
                const canDragCard = !isMobile && canInteractHand && def?.card_type === 'operator';
                return (
                  <CardView
                    key={id}
                    state={state}
                    instanceId={id}
                    variant="compact"
                    selected={selection === id}
                    interactive={canInteractHand}
                    draggable={canDragCard}
                    onClick={() => onHandCardClick(id)}
                    onLongPress={() => {
                      onHoverCard(null);
                      onLongPressCard(id);
                    }}
                    onHoverStart={(rect) => {
                      if (!isMobile && !draggingCardId) {
                        onHoverCard({ instanceId: id, rect });
                      }
                    }}
                    onHoverEnd={() => onHoverCard(null)}
                    onDragStart={(e) => onDragStartCard(id, e)}
                    onDragEnd={onDragEndCard}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="player-hand-dock"
      onClick={(e) => e.stopPropagation()}
      className="bg-[#0e131b] border-t border-[#263244] shrink-0 flex flex-col pb-safe z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]"
    >
      {/* 0. 整合式选中提示 / 目标预演条（内嵌于底座顶部，不遮挡战场） */}
      {selectionPrompt && (
        <div className="px-2 sm:px-3.5 py-1 bg-[#16202e] border-b border-[#29384d] flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-xs text-amber-300">
          {selectionPrompt}
        </div>
      )}

      {/* 1. 己方指挥核心条：自适应单行紧凑分区（360px 窄屏绝不挤压换行） */}
      <div
        className={`flex items-center justify-between gap-1.5 sm:gap-2.5 px-2 sm:px-4 py-1 sm:py-1.5 bg-[#111824] border-b transition-colors ${
          allyHit
            ? `border-rose-400 bg-rose-950/30 ${disableMotion ? '' : 'anim-base-hit'}`
            : isAllyTurn
              ? 'border-sky-500/45'
              : 'border-[#212b3a]'
        }`}
      >
        {/* 左侧：我方基地 HP 区块 + DP 10格能量条 */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          {/* 阵营与基地 HP */}
          <div className="relative flex items-center gap-1 sm:gap-2 shrink-0">
            <span className="px-1 sm:px-1.5 py-0.5 bg-sky-500 text-slate-950 font-black text-[10px] sm:text-xs tracking-wider uppercase shrink-0 whitespace-nowrap">
              {isHotseat ? (
                <>
                  <span className="hidden sm:inline">
                    {bottomPlayer === 'player_a' ? '玩家 A (行动方)' : '玩家 B (行动方)'}
                  </span>
                  <span className="sm:hidden">{bottomPlayer === 'player_a' ? 'A方' : 'B方'}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">我方基地</span>
                  <span className="sm:hidden">我方</span>
                </>
              )}
            </span>

            <div className="relative flex items-center gap-1 sm:gap-1.5 font-mono tabular-nums">
              <div className="flex items-baseline gap-0.5 sm:gap-1">
                <span className="text-[9px] sm:text-[10px] text-sky-400 font-bold">HP</span>
                <strong
                  className={`text-sm sm:text-2xl font-black leading-none ${
                    allyHit ? 'text-rose-300' : 'text-sky-300'
                  }`}
                >
                  {playerAlly.base_points}
                </strong>
                <span className="text-[9px] sm:text-[10px] text-slate-500">/10</span>
              </div>
              <div className="hidden md:block w-16 h-1.5 bg-sky-950/70 border border-sky-900/70 overflow-hidden" aria-hidden="true">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-300"
                  style={{ width: `${allyHpPct}%` }}
                />
              </div>
              {allyHit && !disableMotion && (
                <span
                  aria-hidden="true"
                  className="absolute -top-4 left-2 px-1 py-0.2 bg-rose-950/95 border border-rose-400 text-rose-200 font-mono font-black text-[10px] pointer-events-none z-50 anim-float-number"
                >
                  -{allyBaseDamageDelta}
                </span>
              )}
            </div>
          </div>

          <span className="h-3.5 sm:h-4 w-px bg-[#293548] shrink-0" aria-hidden="true" />

          {/* 战术费用 DP 与 10 格实时能量刻度条（全端显式可见且不挤爆 360px 宽度） */}
          <div className="flex items-center gap-1 sm:gap-2 font-mono tabular-nums shrink-0" aria-label={`当前可用费用 ${playerAlly.cost} / 10 DP`}>
            <div className="flex items-baseline gap-0.5 sm:gap-1">
              <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold">DP</span>
              <strong className="text-sm sm:text-lg font-black text-amber-300 leading-none">
                {playerAlly.cost}
              </strong>
              <span className="text-[9px] sm:text-[10px] text-amber-500/75">/10</span>
            </div>

            <div className="flex items-center gap-[1.5px] sm:gap-0.5" aria-hidden="true">
              {Array.from({ length: DP_CAP }, (_, idx) => {
                const active = idx < litPips;
                return (
                  <span
                    key={idx}
                    className={`w-[3px] sm:w-1.5 md:w-2 h-2.5 sm:h-3 transition-colors ${
                      active
                        ? 'bg-[#e5a52b] shadow-[0_0_4px_rgba(229,165,43,0.45)]'
                        : 'bg-[#1f2836] border border-[#2d394b]'
                    }`}
                  />
                );
              })}
              {playerAlly.cost > DP_CAP && (
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-300 ml-0.5">
                  +{playerAlly.cost - DP_CAP}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：手牌/牌库计数 + 唯一主操作按钮「结束行动」 */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
            <span>
              <span className="hidden sm:inline">手牌 </span>
              <span className="sm:hidden">手</span>
              <strong className="text-slate-100">{playerAlly.hand.length}</strong>
            </span>
            <span>·</span>
            <span>
              <span className="hidden sm:inline">牌库 </span>
              <span className="sm:hidden">库</span>
              <strong className="text-slate-100">{playerAlly.deck.length}</strong>
            </span>
          </div>

          <Button
            variant={canEndTurn ? 'primary' : 'ghost'}
            size="sm"
            cornerCut
            disabled={!canEndTurn}
            onClick={onEndActionPhase}
            className={`text-[11px] sm:text-xs px-2 sm:px-4 min-h-[32px] sm:min-h-[38px] font-bold whitespace-nowrap transition-all shrink-0 ${
              canEndTurn
                ? 'ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(229,165,43,0.35)]'
                : 'opacity-45 border border-slate-700/70'
            }`}
          >
            结束行动 ▶
          </Button>
        </div>
      </div>

      {/* 2. 手牌横向滚动托盘 */}
      <div
        onScroll={() => onHoverCard(null)}
        className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto overscroll-x-contain pt-1 sm:pt-2 pb-1 sm:pb-1.5 px-2 sm:px-3 content-start snap-x min-h-[116px] sm:min-h-[148px] lg:min-h-[164px]"
      >
        {playerAlly.hand.length === 0 ? (
          <div className="w-full text-center py-6 text-xs text-slate-500 font-mono">
            （暂无手牌）
          </div>
        ) : (
          playerAlly.hand.map((id) => {
            const def = cardDefinitionOf(state, id);
            const canDragCard = !isMobile && canInteractHand && def?.card_type === 'operator';
            return (
              <div key={id} className="snap-start shrink-0">
                <CardView
                  state={state}
                  instanceId={id}
                  selected={selection === id}
                  interactive={canInteractHand}
                  draggable={canDragCard}
                  onClick={() => onHandCardClick(id)}
                  onLongPress={() => {
                    onHoverCard(null);
                    onLongPressCard(id);
                  }}
                  onHoverStart={(rect) => {
                    if (!isMobile && !draggingCardId) {
                      onHoverCard({ instanceId: id, rect });
                    }
                  }}
                  onHoverEnd={() => {
                    onHoverCard(null);
                  }}
                  onDragStart={(e) => onDragStartCard(id, e)}
                  onDragEnd={onDragEndCard}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
