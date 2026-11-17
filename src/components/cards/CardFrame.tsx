import React from 'react';
import type { CardDefinition, CardId } from '../../game/types';
import { getCardPresentation, type CardPresentation } from '../../data/card-presentation';
import { OperatorPortrait } from './OperatorPortrait';
import { RARITY_THEMES, CORNER_CUTS } from '../ui/tokens';
import { CLASS_COLOR, CLASS_LABEL, type UiCardDefinition } from '../../client/gameData';

export type CardFrameVariant = 'hand' | 'deck' | 'preview' | 'compact';

export interface CardFrameProps {
  readonly cardId: CardId;
  readonly definition?: CardDefinition | UiCardDefinition;
  readonly presentation?: CardPresentation;
  readonly variant?: CardFrameVariant;
  readonly selected?: boolean;
  readonly holding?: boolean;
  readonly disabled?: boolean;
  readonly dimmed?: boolean;
  readonly unplayable?: boolean;
  readonly redeployCd?: number;
  readonly checked?: boolean;
  readonly interactive?: boolean;
  readonly inDeckCount?: number;
  readonly maxInDeckCount?: number;
  readonly ownedCount?: number;
  readonly showOwnership?: boolean;
  readonly onClick?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  readonly onActionClick?: () => void;
  readonly onInspectClick?: () => void;
  readonly actionLabel?: string;
  readonly draggable?: boolean;
  readonly onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  readonly onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  readonly onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  readonly onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  readonly onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  readonly onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  readonly onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  readonly onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  readonly className?: string;
}

/**
 * 战术卡框 SVG 几何边框与稀有度差异化工业刻度层
 * 不同稀有度 (3★/4★/5★/6★) 不仅通过配色，也通过切角装饰线与几何刻度加以区分
 */
function FrameSvgBorder({
  rarity,
  rarityColor,
  variant,
}: {
  readonly rarity: number;
  readonly rarityColor: string;
  readonly variant: CardFrameVariant;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 160 220"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* 外部主轮廓 */}
      <polygon
        points="0 0, 148 0, 160 12, 160 220, 12 220, 0 208"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.5"
      />

      {/* 右上与左下主切角高亮 */}
      <polyline
        points="134 1, 148 1, 159 12, 159 26"
        fill="none"
        stroke={rarityColor}
        strokeWidth={rarity >= 5 ? '2.8' : '2.2'}
      />
      <polyline
        points="1 194, 1 208, 12 219, 26 219"
        fill="none"
        stroke={rarityColor}
        strokeWidth={rarity >= 5 ? '2.4' : '1.8'}
      />

      {/* 顶部技术刻度线 */}
      <line
        x1="34"
        y1="3.5"
        x2="92"
        y2="3.5"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
        strokeDasharray="4 2"
      />

      {/* 4★+ 左侧稀有度能量导轨 */}
      {rarity >= 4 && (
        <line
          x1="2"
          y1="36"
          x2="2"
          y2={rarity >= 6 ? '160' : '116'}
          stroke={rarityColor}
          strokeOpacity={rarity >= 6 ? '0.85' : '0.6'}
          strokeWidth="2.5"
        />
      )}

      {/* 5★+ 双层内角标与侧边标尺 */}
      {rarity >= 5 && (
        <>
          <polyline
            points="126 5, 145 5, 155 15, 155 34"
            fill="none"
            stroke={rarityColor}
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <line x1="156.5" y1="42" x2="156.5" y2="46" stroke={rarityColor} strokeWidth="1.2" />
          <line x1="156.5" y1="50" x2="156.5" y2="54" stroke={rarityColor} strokeWidth="1.2" />
          <line x1="156.5" y1="58" x2="156.5" y2="62" stroke={rarityColor} strokeWidth="1.2" />
        </>
      )}

      {/* 6★ 高级资深干员专属双线精雕底轨与角标三角形 */}
      {rarity >= 6 && (
        <>
          <polygon points="154 214, 154 202, 142 214" fill={rarityColor} fillOpacity="0.7" />
          <polyline
            points="5 186, 5 205, 15 215, 34 215"
            fill="none"
            stroke={rarityColor}
            strokeOpacity="0.55"
            strokeWidth="1"
          />
        </>
      )}

      {/* 非 compact 模式右侧微标尺 */}
      {variant !== 'compact' && rarity < 5 && (
        <>
          <line x1="157" y1="44" x2="157" y2="48" stroke="rgba(255,255,255,0.32)" strokeWidth="1" />
          <line x1="157" y1="52" x2="157" y2="56" stroke="rgba(255,255,255,0.32)" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/**
 * PRTS Tactical Terminal 卡框系统 (CardFrame)
 * 严格按照《UI_REDESIGN.md》Section 5.2 规范实现 8 层视觉结构：
 * 1. CardBackgroundLayer: CSS 背景纹理与稀有度微光
 * 2. ArtworkLayer: OperatorPortrait 立绘展示与可读暗场梯度
 * 3. FrameShapeLayer: SVG 几何切角边框与刻度
 * 4. RarityAccentLayer: 稀有度角标、色带与星级标记
 * 5. NameAndCostLayer: DP 费用切角徽章、中英文代号
 * 6. TypeAndStatsLayer: 职业、攻击/生命/SP、攻击方式与站位
 * 7. SkillSummaryLayer: 规则与技能摘要
 * 8. InteractionLayer: default / selected / disabled / unplayable / checked / CD
 */
export function CardFrame({
  cardId,
  definition,
  presentation,
  variant = 'deck',
  selected = false,
  holding = false,
  disabled = false,
  dimmed = false,
  unplayable = false,
  redeployCd = 0,
  checked = false,
  interactive = true,
  inDeckCount,
  maxInDeckCount = 2,
  ownedCount,
  showOwnership = false,
  onClick,
  onActionClick,
  onInspectClick,
  actionLabel,
  draggable = false,
  onDragStart,
  onDragEnd,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  className = '',
}: CardFrameProps) {
  const p = presentation ?? getCardPresentation(cardId);
  const rarity = p.rarity;
  const rarityTheme = RARITY_THEMES[rarity as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];
  const classColor = CLASS_COLOR[p.profession] ?? '#94a3b8';
  const classLabelZh = CLASS_LABEL[p.profession] ?? p.profession;

  const cost = definition?.cost ?? 0;
  const isOperator = (definition?.card_type ?? (p.profession !== 'tactic' && p.profession !== 'support')) === 'operator';
  const nameZh = definition?.card_name_zh ?? p.codeNameZh;

  const uiDef = definition as UiCardDefinition | undefined;
  const rulesSummary = uiDef?.rules_text_zh || uiDef?.active_skill_text_zh || '';

  const visualState = selected
    ? 'selected'
    : disabled || dimmed || redeployCd > 0
      ? 'disabled'
      : unplayable
        ? 'unplayable'
        : inDeckCount && inDeckCount > 0
          ? 'in-deck'
          : 'default';

  const isClickable = Boolean(interactive && !disabled && onClick);

  const sizeClasses = {
    compact: 'w-full min-w-[82px] h-[106px] p-1',
    hand: 'w-[82px] h-[108px] sm:w-[104px] sm:h-[138px] lg:w-[116px] lg:h-[154px] p-1 sm:p-1.5 shrink-0',
    deck: 'w-full min-h-[178px] p-2.5',
    preview: 'w-full max-w-[248px] min-h-[320px] p-3.5',
  }[variant];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-pressed={isClickable && selected ? true : undefined}
      aria-label={`${nameZh}，${classLabelZh}，${rarity}星，费用${cost}`}
      data-rarity={String(rarity)}
      data-state={visualState}
      data-interactive={isClickable ? 'true' : 'false'}
      draggable={draggable && !disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onClick={disabled ? undefined : (e) => onClick?.(e)}
      onKeyDown={handleKeyDown}
      className={`card-frame touch-gesture-surface group relative flex flex-col justify-between text-slate-100 select-none overflow-hidden transition-all duration-150 border ${
        isClickable ? 'cursor-pointer hover:-translate-y-1' : ''
      } ${holding ? 'ring-2 ring-amber-400/80 border-amber-400' : ''} ${sizeClasses} ${className}`}
      style={{
        clipPath: CORNER_CUTS.md,
      }}
    >
      {/* 长按查看详情蓄力进度条 */}
      {holding && (
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-[3px] bg-amber-400 z-30 pointer-events-none anim-hold-charge"
        />
      )}
      {/* 1. CardBackgroundLayer：碳纤维斜纹与稀有度顶光 */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 88% 8%, var(--card-tint) 0%, transparent 58%),
            linear-gradient(135deg, rgba(255,255,255,0.025) 25%, transparent 25%),
            linear-gradient(225deg, rgba(255,255,255,0.025) 25%, transparent 25%)
          `,
          backgroundSize: '100% 100%, 8px 8px, 8px 8px',
        }}
      />

      {/* 2. ArtworkLayer：干员立绘与高对比渐变遮罩 */}
      <div className="absolute inset-0 z-1 pointer-events-none">
        <div className="w-full h-full opacity-55 group-hover:opacity-75 transition-opacity duration-200">
          <OperatorPortrait
            cardId={cardId}
            presentation={p}
            variant="portrait"
            className="w-full h-full"
          />
        </div>
        {/* 顶部与底部渐暗护栏，保障文字 WCAG 对比度同时尽量不遮挡角色面部 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(14,18,24,0.68) 0%, rgba(14,18,24,0.08) 34%, rgba(14,18,24,0.62) 66%, rgba(13,17,23,0.96) 100%)',
          }}
        />
      </div>

      {/* 3. FrameShapeLayer：CSS + SVG 几何框体 */}
      <FrameSvgBorder rarity={rarity} rarityColor={rarityTheme.color} variant={variant} />

      {/* 4 & 5 Top: NameAndCostLayer + RarityAccentLayer (费用+持有量 + 职业+星级) */}
      <div className="relative z-10 flex items-start justify-between gap-1 w-full">
        {/* DP 费用切角标记与可选持有量标签 */}
        <div className="flex flex-col items-start gap-1">
          <div
            className={`flex items-baseline gap-0.5 px-1.5 py-0.5 font-mono font-black shadow-md ${
              unplayable ? 'bg-slate-800 text-rose-300 border border-rose-500/60' : 'bg-[#e5a52b] text-slate-950'
            }`}
            style={{ clipPath: 'polygon(0 0, 100% 0, 86% 100%, 0 100%)' }}
          >
            <span className="text-[8px] font-sans tracking-tight">DP</span>
            <span className="text-xs sm:text-sm leading-none">{cost}</span>
          </div>
          {showOwnership && ownedCount !== undefined && (
            <span
              className={`px-1 py-0.2 text-[9px] font-mono font-bold leading-tight border ${
                ownedCount >= 2
                  ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                  : ownedCount > 0
                    ? 'bg-sky-950/90 border-sky-500/60 text-sky-300'
                    : 'bg-[#0b0f14]/85 border-slate-700/80 text-slate-400'
              }`}
            >
              {ownedCount >= 2 ? `持有×${ownedCount} 满` : ownedCount > 0 ? `持有×${ownedCount}` : '未收录'}
            </span>
          )}
        </div>

        {/* 职业标志与星级 */}
        <div className="flex flex-col items-end gap-0.5">
          <span
            className="text-[9px] font-bold px-1.5 py-0.2 tracking-wider border-r-2 bg-[#0b0f14]/85 text-slate-100"
            style={{ borderRightColor: classColor }}
          >
            {classLabelZh}
          </span>
          <div
            className="flex items-center gap-0.5 px-1 bg-[#0b0f14]/75 text-[9px] font-mono font-bold leading-tight"
            style={{ color: rarityTheme.color }}
          >
            <span>{'★'.repeat(rarity)}</span>
          </div>
        </div>
      </div>

      {/* 5 Bottom & 6 & 7: 名称、属性与技能区 */}
      <div className="relative z-10 mt-auto flex flex-col gap-1 w-full">
        {/* 干员中英文代号 */}
        <div className="px-0.5">
          <div className="flex items-center justify-between gap-1">
            <h4 className={`font-black ${variant === 'hand' || variant === 'compact' ? 'text-[11px] sm:text-sm' : 'text-[13px] sm:text-sm'} text-white tracking-wide truncate drop-shadow-md m-0 leading-tight`}>
              {nameZh}
            </h4>
            {variant === 'preview' && isOperator && uiDef?.attack_type && (
              <span className="text-[10px] font-mono text-slate-300 shrink-0">
                {uiDef.attack_type === 'melee' ? '近战' : '远程'}
              </span>
            )}
          </div>
          {variant !== 'compact' && (
            <div className={`${variant === 'hand' ? 'hidden sm:flex' : 'flex'} items-center justify-between text-[9px] font-mono text-slate-400 tracking-wider uppercase truncate leading-tight`}>
              <span className="truncate">{p.codeNameEn}</span>
              {variant === 'preview' && isOperator && uiDef?.deploy_rule && (
                <span className="text-amber-300/90 shrink-0">
                  {uiDef.deploy_rule === 'front_only' ? '仅前排' : uiDef.deploy_rule === 'back_only' ? '仅后排' : '全阵位'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* TypeAndStatsLayer：数值面板 */}
        <div className={`flex flex-col gap-0.5 sm:gap-1 w-full pt-0.5 sm:pt-1 border-t border-slate-700/75 bg-[#10151b]/90 px-0.5 sm:px-1 ${variant === 'hand' || variant === 'compact' ? 'pb-0.5' : 'pb-1'}`}>
          {isOperator && definition && (
            <div className={`flex items-center justify-between ${variant === 'hand' || variant === 'compact' ? 'text-[9px] sm:text-[11px]' : 'text-[10px] sm:text-[11px]'} font-mono tabular-nums leading-none`}>
              <span className="text-rose-300 font-bold">
                <span className={variant === 'hand' ? 'hidden sm:inline' : variant === 'compact' ? 'hidden' : ''}>ATK </span>
                <span className={variant === 'hand' ? 'sm:hidden' : variant === 'compact' ? '' : 'hidden'}>⚔</span>
                {definition.atk ?? 0}
              </span>
              <span className="text-emerald-300 font-bold">
                <span className={variant === 'hand' ? 'hidden sm:inline' : variant === 'compact' ? 'hidden' : ''}>HP </span>
                <span className={variant === 'hand' ? 'sm:hidden' : variant === 'compact' ? '' : 'hidden'}>♥</span>
                {definition.hp ?? 0}
              </span>
              <span className="text-sky-300 font-bold">
                <span className={variant === 'hand' ? 'hidden sm:inline' : variant === 'compact' ? 'hidden' : ''}>SP </span>
                <span className={variant === 'hand' ? 'sm:hidden' : variant === 'compact' ? '' : 'hidden'}>⚡</span>
                {definition.starting_sp ?? 0}/{definition.max_sp ?? 5}
              </span>
            </div>
          )}

          {/* SkillSummaryLayer：规则/技能摘要 */}
          {variant !== 'compact' && rulesSummary && (
            <p
              className={`text-[10px] text-slate-300 leading-snug m-0 ${
                variant === 'hand' ? 'hidden sm:line-clamp-1' : variant === 'preview' ? 'line-clamp-3' : 'line-clamp-2'
              }`}
            >
              {rulesSummary}
            </p>
          )}

          {/* 卡组编辑 / 图鉴操作区 */}
          {variant === 'deck' && (inDeckCount !== undefined || onActionClick || onInspectClick) && (
            <div className="flex items-center justify-between gap-1 pt-1 mt-0.5 border-t border-slate-800/90">
              <div className="flex items-center gap-1">
                {inDeckCount !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border leading-none ${
                      inDeckCount >= maxInDeckCount
                        ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                        : inDeckCount > 0
                          ? 'bg-sky-950/90 border-sky-500 text-sky-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {inDeckCount}/{maxInDeckCount}
                  </span>
                )}
                {onInspectClick && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectClick();
                    }}
                    className="px-1.5 py-0.5 text-[10px] font-medium bg-[#1d2530] hover:bg-[#2a3545] text-slate-200 border border-slate-600/80 cursor-pointer transition"
                    title="查看干员档案详情"
                  >
                    详情
                  </button>
                )}
              </div>
              {onActionClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionClick();
                  }}
                  disabled={inDeckCount !== undefined && inDeckCount >= maxInDeckCount}
                  className="px-2 py-0.5 text-[11px] font-bold bg-[#e5a52b] hover:bg-amber-400 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer disabled:cursor-not-allowed transition"
                >
                  {actionLabel ?? (inDeckCount !== undefined && inDeckCount >= maxInDeckCount ? '已满' : '+ 加入')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 8. InteractionLayer：手牌费用不足非色盲提示角标 */}
      {unplayable && redeployCd === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-25 px-1.5 py-0.5 bg-[#0f1318]/90 border border-rose-500/70 text-[10px] font-bold text-rose-300 pointer-events-none shadow">
          费用不足
        </div>
      )}

      {/* 再部署 CD 遮罩覆层 */}
      {redeployCd > 0 && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 text-center p-2">
          <span className="text-[11px] text-amber-400 font-bold tracking-wide">再部署冷却</span>
          <span className="text-2xl font-black font-mono text-white mt-0.5">{redeployCd}</span>
        </div>
      )}

      {/* 选中勾选标记 (Mulligan 等多选场景) */}
      {checked && (
        <div className="absolute top-1.5 right-1.5 z-30 w-5 h-5 bg-[#e5a52b] text-slate-950 flex items-center justify-center font-black text-xs shadow-md border border-slate-950">
          ✓
        </div>
      )}
    </div>
  );
}
