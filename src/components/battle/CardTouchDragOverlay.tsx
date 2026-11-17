import React from 'react';
import type { CardDefinition } from '../../game/types';
import { getCardPresentation } from '../../data/card-presentation';
import { RARITY_THEMES } from '../ui/tokens';
import type { PointerPosition } from '../../hooks/useLongPress';
import type { TouchDropResolution } from './touchDrag';

export interface TouchDragOverlayProps {
  readonly definition: CardDefinition;
  readonly pointer: PointerPosition;
  readonly aimPoint: PointerPosition;
  readonly resolution: TouchDropResolution;
  readonly statusText: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/**
 * 移动端触控拖拽战术悬浮层：
 * - 将浮起卡面显式上偏至手指上方，避免拇指遮挡卡名与费用
 * - 绘制虚线引导矢径与磁吸准星，清晰区分「可落位(琥珀黄) / 可指定目标(青) / 非法格位(红) / 取消区(灰)」
 */
export function CardTouchDragOverlay({
  definition,
  pointer,
  aimPoint,
  resolution,
  statusText,
  viewportWidth,
  viewportHeight,
}: TouchDragOverlayProps) {
  const presentation = getCardPresentation(definition.card_id);
  const rarityTheme = RARITY_THEMES[presentation.rarity as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];

  const cardW = 84;
  const cardH = 96;
  const cardLeft = Math.max(8, Math.min(viewportWidth - cardW - 8, pointer.x - cardW / 2));
  const cardTop = Math.max(8, Math.min(viewportHeight - cardH - 12, pointer.y - cardH - 36));
  const cardAnchorX = cardLeft + cardW / 2;
  const cardAnchorY = cardTop + cardH;

  const isDeployLock = resolution.kind === 'slot' && resolution.slot.isValidDeploy;
  const isTargetLock =
    (resolution.kind === 'slot' && resolution.slot.isValidUnitTarget) ||
    resolution.kind === 'direct_play';
  const isInvalid = resolution.kind === 'invalid_slot';

  const targetX = resolution.kind === 'cancel' ? aimPoint.x : resolution.aimCenter.x;
  const targetY = resolution.kind === 'cancel' ? aimPoint.y : resolution.aimCenter.y;

  const toneColor = isDeployLock
    ? '#e5a52b'
    : isTargetLock
      ? '#22d3ee'
      : isInvalid
        ? '#f43f5e'
        : '#94a3b8';

  const statusToneCls = isDeployLock
    ? 'bg-amber-950/95 border-[#e5a52b] text-amber-200 shadow-[0_0_16px_rgba(229,165,43,0.45)]'
    : isTargetLock
      ? 'bg-cyan-950/95 border-cyan-400 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
      : isInvalid
        ? 'bg-rose-950/95 border-rose-500 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.4)]'
        : 'bg-[#121822]/95 border-slate-600 text-slate-300';

  const showTether = resolution.kind !== 'cancel';

  return (
    <div
      aria-hidden="true"
      data-testid="touch-drag-overlay"
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
    >
      {/* 引导虚线与磁吸准星 */}
      {showTether && (
        <svg className="absolute inset-0 w-full h-full">
          <line
            x1={cardAnchorX}
            y1={cardAnchorY - 6}
            x2={targetX}
            y2={targetY}
            stroke={toneColor}
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeOpacity="0.9"
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={resolution.kind === 'slot' && resolution.snapped ? 18 : 14}
            fill="none"
            stroke={toneColor}
            strokeWidth="2"
            strokeOpacity="0.9"
          />
          <circle cx={targetX} cy={targetY} r={4} fill={toneColor} />
        </svg>
      )}

      {/* 顶部/手指上方实时落点状态提示条 */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 px-3 py-1 border font-mono font-bold text-[11px] whitespace-nowrap max-w-[92vw] truncate transition-colors ${statusToneCls}`}
        style={{
          top: Math.max(8, Math.min(viewportHeight - 44, cardTop - 30)),
          clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
        }}
      >
        {statusText}
      </div>

      {/* 手指上方浮起的轻量化战术卡影 */}
      <div
        className="fixed flex flex-col justify-between p-1.5 bg-[#151c26]/95 border-2 shadow-[0_14px_28px_rgba(0,0,0,0.65)] transition-transform duration-75"
        style={{
          left: cardLeft,
          top: cardTop,
          width: cardW,
          height: cardH,
          borderColor: toneColor,
          boxShadow: `0 12px 26px rgba(0,0,0,0.65), 0 0 18px ${toneColor}55`,
          clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
        }}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="px-1.5 py-0.5 bg-[#e5a52b] text-slate-950 font-mono font-black text-[11px] leading-none">
            {definition.cost}
          </span>
          <span
            className="text-[9px] font-mono font-bold leading-none"
            style={{ color: rarityTheme.color }}
          >
            {'★'.repeat(presentation.rarity)}
          </span>
        </div>

        <div className="mt-auto space-y-1">
          <div className="text-[11px] font-black text-white truncate leading-tight">
            {definition.card_name_zh}
          </div>
          {definition.card_type === 'operator' ? (
            <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-300 bg-[#0d1219] px-1 py-0.5 border border-slate-700/80">
              <span className="text-rose-300">⚔{definition.atk ?? 0}</span>
              <span className="text-emerald-300">♥{definition.hp ?? 0}</span>
            </div>
          ) : (
            <div className="text-[9px] font-mono text-cyan-300 bg-[#0d1219] px-1 py-0.5 border border-cyan-800/70 truncate">
              {definition.card_type === 'support' ? '支援装置' : '战术指令'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
