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
  readonly selection: CardInstanceId | null;
  readonly draggingCardId: CardInstanceId | null;
  readonly allyBaseDamageDelta?: number | null;
  readonly disableMotion?: boolean;
  readonly onHandCardClick: (id: CardInstanceId) => void;
  readonly onLongPressCard: (id: CardInstanceId) => void;
  readonly onHoverCard: (preview: HoveredCardPreview | null) => void;
  readonly onDragStartCard: (id: CardInstanceId, e: React.DragEvent) => void;
  readonly onDragEndCard: () => void;
  readonly onEndActionPhase: () => void;
}

const DP_CAP = 10;

/**
 * 底部统一己方指挥面板与手牌托盘 (PlayerHandDock)
 * 将【我方基地 HP】、【10 格战术 DP 费用槽】、【手牌与牌库余量】与唯一【结束行动】按钮
 * 收敛至玩家视野正下方，直接锚定己方防线与手牌操作动线，彻底消除顶栏与底栏重复显示。
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
  selection,
  draggingCardId,
  allyBaseDamageDelta = null,
  disableMotion = false,
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

  return (
    <section
      data-testid="player-hand-dock"
      onClick={(e) => e.stopPropagation()}
      className="bg-[#0e131b] border-t border-[#263244] shrink-0 flex flex-col pb-safe z-20"
    >
      {/* 1. 己方指挥核心条：基地 HP + DP 费用刻度槽 + 手牌余量 + 主按钮「结束行动」 */}
      <div
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-2.5 sm:px-3.5 py-1.5 bg-[#111824] border-b transition-colors ${
          allyHit
            ? `border-rose-400 bg-rose-950/30 ${disableMotion ? '' : 'anim-base-hit'}`
            : isAllyTurn
              ? 'border-sky-500/45'
              : 'border-[#212b3a]'
        }`}
      >
        {/* 左侧：我方基地生命值 & DP 能量刻度条 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* 阵营与基地 HP */}
          <div className="relative flex items-center gap-1.5 sm:gap-2">
            <span className="px-1.5 py-0.5 bg-sky-500 text-slate-950 font-black text-[10px] sm:text-xs tracking-wider uppercase shrink-0">
              {isHotseat ? (
                <>
                  <span className="hidden sm:inline">
                    {bottomPlayer === 'player_a' ? '玩家 A (行动方)' : '玩家 B (行动方)'}
                  </span>
                  <span className="sm:hidden">{bottomPlayer === 'player_a' ? '玩家 A' : '玩家 B'}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">我方基地</span>
                  <span className="sm:hidden">我方</span>
                </>
              )}
            </span>

            <div className="relative flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums">
              <span className="text-[10px] text-sky-400 font-bold">HP</span>
              <strong
                className={`text-lg sm:text-2xl font-black leading-none ${
                  allyHit ? 'text-rose-300' : 'text-sky-300'
                }`}
              >
                {playerAlly.base_points}
              </strong>
              <span className="text-[10px] text-slate-500">/10</span>
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

          <span className="h-4 w-px bg-[#293548]" aria-hidden="true" />

          {/* 战术费用 DP 与 10 格实时能量刻度条 */}
          <div className="flex items-center gap-2 font-mono tabular-nums" aria-label={`当前可用费用 ${playerAlly.cost} / 10 DP`}>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-amber-400 font-bold">DP</span>
              <strong className="text-base sm:text-lg font-black text-amber-300 leading-none">
                {playerAlly.cost}
              </strong>
              <span className="text-[10px] text-amber-500/75">/10</span>
            </div>

            <div className="hidden sm:flex items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: DP_CAP }, (_, idx) => {
                const active = idx < litPips;
                return (
                  <span
                    key={idx}
                    className={`w-1.5 md:w-2 h-3 transition-colors ${
                      active
                        ? 'bg-[#e5a52b] shadow-[0_0_4px_rgba(229,165,43,0.45)]'
                        : 'bg-[#1f2836] border border-[#2d394b]'
                    }`}
                  />
                );
              })}
              {playerAlly.cost > DP_CAP && (
                <span className="text-[10px] font-bold text-amber-300 ml-0.5">
                  +{playerAlly.cost - DP_CAP}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：手牌/牌库计数 + 唯一主操作按钮「结束行动」 */}
        <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">
          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
            <span>
              手牌 <strong className="text-slate-100">{playerAlly.hand.length}</strong>
            </span>
            <span>·</span>
            <span>
              牌库 <strong className="text-slate-100">{playerAlly.deck.length}</strong>
            </span>
            {isMobile && <span className="text-[10px] font-sans text-slate-400">· 长按看详情</span>}
          </div>

          <Button
            variant={canEndTurn ? 'primary' : 'ghost'}
            size="sm"
            cornerCut
            disabled={!canEndTurn}
            onClick={onEndActionPhase}
            className={`text-xs px-3 sm:px-4 font-bold whitespace-nowrap transition-all shrink-0 ${
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
        className="flex items-center gap-2 overflow-x-auto pt-2 pb-1.5 px-2 sm:px-3 min-h-[156px] max-h-[168px] content-start snap-x"
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
