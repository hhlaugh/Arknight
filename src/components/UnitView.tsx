import React from 'react';
import type { CardInstance, GameState } from '../game/types';
import { STATUS_LABEL } from '../client/demoData';
import { getCardPresentation } from '../data/card-presentation';
import { useLongPress } from '../hooks/useLongPress';
import type { FloatingPopupKind, UnitAnimationState } from './battle/combatPresentation';
import { cardDefinitionOf } from './CardView';
import { OperatorPortrait } from './cards/OperatorPortrait';
import { HealthBar } from './ui/HealthBar';
import { RARITY_THEMES } from './ui/tokens';

export type UnitHighlight = 'none' | 'target' | 'selected' | 'attack_target';

interface UnitViewProps {
  readonly state: GameState;
  readonly instance: CardInstance;
  readonly highlight: UnitHighlight;
  readonly animState?: UnitAnimationState;
  readonly onClick?: () => void;
  readonly onLongPress?: () => void;
  readonly onHoverStart?: () => void;
  readonly onHoverEnd?: () => void;
}

const POPUP_COLORS: Record<FloatingPopupKind, string> = {
  damage: 'bg-rose-950/95 text-rose-200 border-rose-400 shadow-[0_2px_8px_rgba(244,63,94,0.45)]',
  shield: 'bg-sky-950/95 text-sky-200 border-sky-400 shadow-[0_2px_8px_rgba(56,189,248,0.4)]',
  heal: 'bg-emerald-950/95 text-emerald-200 border-emerald-400 shadow-[0_2px_8px_rgba(52,211,153,0.4)]',
  sp: 'bg-cyan-950/95 text-cyan-200 border-cyan-400 shadow-[0_2px_8px_rgba(34,211,238,0.35)]',
  skill: 'bg-amber-950/95 text-amber-200 border-amber-400 shadow-[0_2px_8px_rgba(245,158,11,0.4)]',
  deploy: 'bg-amber-950/90 text-amber-300 border-amber-500/80',
  status: 'bg-purple-950/95 text-purple-200 border-purple-400',
};

/**
 * 战场棋盘单位组件 (BoardUnit)
 * 严格遵照《UI_REDESIGN.md》Section 4.5, 5.1-C, 8.1/8.2 & Phase 6 轻量动效规范：
 * - 紧凑 82px 高度，保证电脑端整个 4 行三路棋盘 100% 完整显示且零滚动条
 * - 区分 selected（金色选中）/ target（青色可选目标）/ attack_target（红橙锁定交锋目标）
 * - 支持部署落位、攻击微冲、受击闪震、技能光环与不遮挡点击的浮动数值反馈
 */
export function UnitView({
  state,
  instance,
  highlight,
  animState,
  onClick,
  onLongPress,
  onHoverStart,
  onHoverEnd,
}: UnitViewProps) {
  const definition = cardDefinitionOf(state, instance.card_instance_id);
  const combat = instance.operator_combat;
  const longPressHandlers = useLongPress({
    onLongPress,
    onClick,
    disabled: !onClick && !onLongPress,
  });

  if (!definition || !combat) return null;

  const presentation = getCardPresentation(instance.card_id);
  const rarity = presentation.rarity;
  const rarityTheme = RARITY_THEMES[rarity as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];

  const atk = Math.max(
    0,
    (definition.atk ?? 0) + combat.current_atk_modifiers.reduce((sum, modifier) => sum + modifier, 0),
  );

  const maxHp = definition.hp ?? 1;
  const isSelected = highlight === 'selected';
  const isTarget = highlight === 'target';
  const isAttackTarget = highlight === 'attack_target';
  const hasStatuses = combat.statuses.length > 0 || combat.equipment_ids.length > 0;

  const motionOff = Boolean(animState?.disableMotion);
  const rarityDeployCls =
    !motionOff && rarity >= 6 ? ' anim-deploy-rarity-6' : !motionOff && rarity === 5 ? ' anim-deploy-rarity-5' : '';
  const motionClass = motionOff
    ? ''
    : animState?.hit
      ? 'anim-hit-shake'
      : animState?.attackDirection === 'up'
        ? 'anim-melee-lunge-up anim-attack-glow'
        : animState?.attackDirection === 'down'
          ? 'anim-melee-lunge-down anim-attack-glow'
          : animState?.deployed
            ? `anim-deploy-land${rarityDeployCls}`
            : '';

  const floatingPopups = animState?.floatingPopups ?? [];

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${definition.card_name_zh}，生命 ${combat.current_hp}/${maxHp}，攻击 ${atk}，技力 ${combat.current_sp}/${definition.max_sp ?? 5}`}
      data-rarity={String(rarity)}
      data-highlight={highlight}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerMove={longPressHandlers.onPointerMove}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onContextMenu={longPressHandlers.onContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        longPressHandlers.onClick(e);
      }}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className={`group relative rounded-sm bg-[#181d24] select-none transition-all duration-150 cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        isSelected
          ? 'border-[#e5a52b] ring-2 ring-[#e5a52b]/50 shadow-[0_0_14px_rgba(229,165,43,0.4)] z-20 scale-[1.01]'
          : isTarget
            ? 'border-cyan-400 ring-2 ring-cyan-400/60 shadow-[0_0_12px_rgba(56,189,248,0.45)] animate-pulse z-20'
            : isAttackTarget
              ? 'border-rose-500 ring-2 ring-rose-500/55 shadow-[0_0_12px_rgba(244,63,94,0.45)] z-20'
              : animState?.hit
                ? 'border-rose-400 ring-1 ring-rose-400/70 z-20'
                : animState?.skillFlash
                  ? 'border-cyan-400 ring-1 ring-cyan-400/70 z-20'
                  : 'border-[#36424e] hover:border-[#526475] hover:bg-[#1e252e]'
      } ${motionClass} w-full h-[82px]`}
    >
      {/* 内部裁切内容容器（保证立绘/血条不溢出，同时允许上方浮动跳字完整浮现） */}
      <div className="relative flex flex-col justify-between w-full h-full p-1.5 pl-2 overflow-hidden">
        {/* 左侧稀有度竖向导轨 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none"
          style={{ backgroundColor: rarityTheme.color }}
        />

        {/* 受击瞬时白闪+红晕遮罩 */}
        {!motionOff && animState?.hit && (
          <div className="absolute inset-0 pointer-events-none z-20 anim-hit-flash bg-gradient-to-b from-white/75 via-rose-500/55 to-rose-600/65" />
        )}

        {/* 技能发动瞬时光环遮罩 */}
        {!motionOff && animState?.skillFlash && (
          <div className="absolute inset-0 border-2 border-cyan-300/80 bg-cyan-400/15 pointer-events-none z-20 anim-skill-burst" />
        )}

        {/* 顶部：干员头像、名称与状态标 */}
        <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <OperatorPortrait
              key={instance.card_id}
              cardId={instance.card_id}
              presentation={presentation}
              variant="avatar"
              className="w-5.5 h-5.5 shrink-0 rounded-xs border border-slate-700/80 shadow-xs"
            />
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="font-bold text-xs text-white truncate">
                {definition.card_name_zh}
              </span>
              {definition.floating && (
                <span className="text-[8px] px-0.5 bg-amber-950/80 text-amber-300 border border-amber-500/40 shrink-0">
                  浮空
                </span>
              )}
            </div>
          </div>

          {/* 右上：状态/装备指示或射程类型 */}
          {hasStatuses ? (
            <div className="flex items-center gap-0.5 shrink-0">
              {combat.statuses.slice(0, 2).map((status) => (
                <span
                  key={status.kind}
                  title={`${STATUS_LABEL[status.kind] ?? status.kind}${status.remaining_owner_turns > 0 ? ` (${status.remaining_owner_turns}回合)` : ''}`}
                  className="text-[8px] px-1 py-0.2 bg-rose-950 text-rose-300 border border-rose-500/60 font-mono"
                >
                  {STATUS_LABEL[status.kind] ?? status.kind}
                </span>
              ))}
              {combat.statuses.length > 2 && (
                <span className="text-[8px] px-0.5 bg-slate-800 text-slate-300 border border-slate-600 font-mono">
                  +{combat.statuses.length - 2}
                </span>
              )}
              {combat.equipment_ids.length > 0 && (
                <span className="text-[8px] px-1 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-500/60 font-mono">
                  装
                </span>
              )}
            </div>
          ) : (
            <span className="text-[9px] font-mono text-slate-400 shrink-0">
              {definition.attack_type === 'melee' ? '近战' : '远程'}
            </span>
          )}
        </div>

        {/* 中部：等宽生命条与护盾 */}
        <div className="w-full my-0.5">
          <HealthBar
            currentHp={combat.current_hp}
            maxHp={maxHp}
            shield={combat.shield}
            size="sm"
            showNumbers
            disableMotion={motionOff}
          />
        </div>

        {/* 底部：ATK 与 SP 数值条 */}
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums px-1.5 py-0.5 bg-[#12161b] border border-[#2b353f] leading-none">
          <span className="text-rose-400 font-bold flex items-center gap-0.5">
            <span className="text-[9px]">⚔</span>
            <span>{atk}</span>
          </span>
          <span className="text-sky-400 font-bold flex items-center gap-0.5">
            <span className="text-[9px]">⚡</span>
            <span>{combat.current_sp}/{definition.max_sp ?? 5}</span>
          </span>
        </div>

        {/* 可用技能/战术指定目标指示 */}
        {isTarget && (
          <div className="absolute top-0 right-0 px-1 py-0.2 bg-cyan-500 text-slate-950 font-mono font-black text-[8px] pointer-events-none">
            ◎ 目标
          </div>
        )}

        {/* 攻击索敌锁定角标 */}
        {isAttackTarget && !isTarget && (
          <div className="absolute top-0 right-0 px-1 py-0.2 bg-rose-600 text-white font-mono font-black text-[8px] pointer-events-none">
            ⚔ 锁定
          </div>
        )}
      </div>

      {/* 浮动战斗反馈跳字（不截断、不阻挡鼠标与触屏点击） */}
      {!motionOff && floatingPopups.length > 0 && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-1 flex flex-col items-center gap-0.5 pointer-events-none z-40"
        >
          {floatingPopups.slice(0, 3).map((popup, idx) => {
            const numeric = Number.parseFloat(popup.label.replace(/[^\d.-]/g, ''));
            const magnitude = Number.isFinite(numeric) ? Math.abs(numeric) : 0;
            const sizeCls =
              magnitude >= 3
                ? 'text-[15px] px-2 py-0.5 shadow-[0_0_10px_rgba(244,63,94,0.65)]'
                : magnitude >= 2
                  ? 'text-[13px] px-1.5 py-0.2'
                  : 'text-[11px] px-1.5 py-0.2';
            return (
            <span
              key={popup.id}
              style={{ marginTop: `${idx * -2}px` }}
              className={`px-1.5 py-0.2 border font-mono font-black leading-tight whitespace-nowrap anim-float-number ${sizeCls} ${POPUP_COLORS[popup.kind]}`}
            >
              {popup.label}
            </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

