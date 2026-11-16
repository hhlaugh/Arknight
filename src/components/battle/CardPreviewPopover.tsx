import React, { useEffect, useState } from 'react';
import type { GameState, CardInstanceId } from '../../game/types';
import { cardDefinitionOf } from '../cards/CardView';
import { getCardPresentation } from '../../data/card-presentation';
import { CardFrame } from '../cards/CardFrame';

export interface HoveredCardPreview {
  readonly instanceId: CardInstanceId;
  readonly rect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
  };
}

interface CardPreviewPopoverProps {
  readonly state: GameState;
  readonly hovered: HoveredCardPreview | null;
  readonly invalidReason?: string | null;
}

const POPOVER_WIDTH = 236;
const POPOVER_ESTIMATED_HEIGHT = 360;
const EDGE_PADDING = 12;

export function clampPopoverPosition(
  anchorRect: HoveredCardPreview['rect'],
  viewportWidth: number,
  viewportHeight: number,
): { readonly left: number; readonly top: number } {
  const centerX = anchorRect.left + anchorRect.width / 2;
  const rawLeft = centerX - POPOVER_WIDTH / 2;
  const maxLeft = Math.max(EDGE_PADDING, viewportWidth - POPOVER_WIDTH - EDGE_PADDING);
  const left = Math.min(Math.max(EDGE_PADDING, rawLeft), maxLeft);

  const preferredTop = anchorRect.top - POPOVER_ESTIMATED_HEIGHT - 10;
  const maxTop = Math.max(EDGE_PADDING, viewportHeight - POPOVER_ESTIMATED_HEIGHT - EDGE_PADDING);
  const top = preferredTop >= EDGE_PADDING ? preferredTop : Math.min(EDGE_PADDING, maxTop);

  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * 桌面端卡牌悬停浮层预览（独立 fixed 图层，绝不撑开手牌栏，并确保严格限制在视口安全边界内）。
 */
export function CardPreviewPopover({ state, hovered, invalidReason }: CardPreviewPopoverProps) {
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => {
    if (typeof window === 'undefined') return { width: 1280, height: 800 };
    return { width: window.innerWidth, height: window.innerHeight };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!hovered) return null;

  const instance = state.card_instances[hovered.instanceId];
  const definition = cardDefinitionOf(state, hovered.instanceId);
  if (!instance || !definition) return null;

  const presentation = getCardPresentation(instance.card_id);
  const pos = clampPopoverPosition(hovered.rect, viewport.width, viewport.height);

  return (
    <div
      role="tooltip"
      aria-label={`${definition.card_name_zh} 卡牌预览`}
      className="fixed z-40 pointer-events-none animate-fade-in"
      style={{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${POPOVER_WIDTH}px` }}
    >
      <div className="bg-[#12161d]/95 border border-[#4a555e] shadow-[0_16px_40px_rgba(0,0,0,0.85)] p-2 flex flex-col gap-1.5">
        <div className="flex justify-center">
          <CardFrame
            cardId={instance.card_id}
            definition={definition}
            presentation={presentation}
            variant="preview"
            interactive={false}
            redeployCd={instance.operator_lifecycle?.redeploy_cd_remaining ?? 0}
            className="w-full max-w-[218px] min-h-[250px]"
          />
        </div>

        {(definition.rules_text_zh || definition.active_skill_text_zh) && (
          <div className="px-1.5 py-1 bg-[#0c1016] border border-[#263140] text-[10px] text-slate-300 space-y-1 leading-snug">
            {definition.rules_text_zh && <p className="m-0">{definition.rules_text_zh}</p>}
            {definition.active_skill_text_zh && (
              <p className="m-0 text-sky-300">
                ⚡ 主动 ({definition.active_skill_sp_cost ?? 0} SP): {definition.active_skill_text_zh}
              </p>
            )}
          </div>
        )}

        {invalidReason ? (
          <div className="px-2 py-1 bg-rose-950/90 border border-rose-500/60 text-rose-200 text-[10px] font-bold">
            ⚠️ {invalidReason}
          </div>
        ) : (
          <div className="flex items-center justify-between px-1 text-[9px] font-mono text-slate-400">
            <span>点击选中</span>
            <span>{definition.card_type === 'operator' ? '可拖放部署' : '点击后选目标'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
