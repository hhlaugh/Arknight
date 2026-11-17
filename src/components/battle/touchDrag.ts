import type { CardInstanceId, LaneId, PlayerId, Position } from '../../game/types';
import type { PointerPosition } from '../../hooks/useLongPress';
import type { SlotKey } from './combatPresentation';

export const TOUCH_DRAG_ACTIVATE_THRESHOLD_PX = 10;
export const TOUCH_AIM_OFFSET_Y_PX = 28;
export const TOUCH_MAGNET_RADIUS_PX = 24;

export type TouchDragLayoutMode = 'bottom' | 'side-rail';
export type TouchDragIntent = 'pending' | 'drag' | 'scroll';

export interface RectBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TouchDragSlotCandidate {
  readonly key: SlotKey;
  readonly half: PlayerId;
  readonly lane: LaneId;
  readonly position: Position;
  readonly rect: RectBox;
  readonly isValidDeploy: boolean;
  readonly unitId?: CardInstanceId;
  readonly isValidUnitTarget: boolean;
}

export type TouchDropResolution =
  | {
      readonly kind: 'slot';
      readonly slot: TouchDragSlotCandidate;
      readonly snapped: boolean;
      readonly aimCenter: PointerPosition;
    }
  | {
      readonly kind: 'invalid_slot';
      readonly slot: TouchDragSlotCandidate;
      readonly aimCenter: PointerPosition;
    }
  | {
      readonly kind: 'direct_play';
      readonly aimCenter: PointerPosition;
    }
  | {
      readonly kind: 'cancel';
      readonly aimCenter: PointerPosition;
    };

function pointInRect(pt: PointerPosition, rect: RectBox, pad = 0): boolean {
  return (
    pt.x >= rect.left - pad &&
    pt.x <= rect.right + pad &&
    pt.y >= rect.top - pad &&
    pt.y <= rect.bottom + pad
  );
}

function rectCenter(rect: RectBox): PointerPosition {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

/**
 * 区分触屏手势意图：
 * - bottom 布局：向上拉出卡槽（dy <= -threshold 且纵向分量占优）进入拖拽；横向滑动交由手牌滚动容器处理
 * - side-rail 横屏侧栏布局：向左拉向棋盘（dx <= -threshold 且横向分量占优）进入拖拽；纵向滑动交由手牌网格滚动
 */
export function detectTouchDragIntent(params: {
  readonly start: PointerPosition;
  readonly current: PointerPosition;
  readonly layoutMode: TouchDragLayoutMode;
  readonly thresholdPx?: number;
}): TouchDragIntent {
  const { start, current, layoutMode, thresholdPx = TOUCH_DRAG_ACTIVATE_THRESHOLD_PX } = params;
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < thresholdPx) return 'pending';

  if (layoutMode === 'side-rail') {
    if (dx <= -thresholdPx && Math.abs(dx) >= Math.abs(dy) * 0.75) {
      return 'drag';
    }
    return 'scroll';
  }

  if (dy <= -thresholdPx && Math.abs(dy) >= Math.abs(dx) * 0.75) {
    return 'drag';
  }
  return 'scroll';
}

/**
 * 计算触屏准星落点（默认上移 28px，避免手指自身遮挡目标棋盘格）。
 */
export function computeTouchAimPoint(
  pointer: PointerPosition,
  viewportWidth: number,
  viewportHeight: number,
  offsetY = TOUCH_AIM_OFFSET_Y_PX,
): PointerPosition {
  const maxX = Math.max(12, viewportWidth - 12);
  const maxY = Math.max(16, viewportHeight - 16);
  return {
    x: Math.min(maxX, Math.max(12, pointer.x)),
    y: Math.min(maxY, Math.max(16, pointer.y - offsetY)),
  };
}

/**
 * 解析当前拖牌瞄准点的棋盘落点与磁吸结果：
 * 1. 直接命中合法部署格 / 合法技能战术目标单位 -> 立即锁定（snapped = false）
 * 2. 若在磁吸半径（24px）内邻近唯一最近的合法格位 -> 自动磁吸至该格中心（snapped = true）
 * 3. 若落在不合法的格位内 -> 返回 invalid_slot（用于展示引擎真实不可部署/不可选原因）
 * 4. 若为无需指定目标的战术/支援卡且位于棋盘区域内 -> 返回 direct_play
 * 5. 其余区域（如拖回手牌托盘） -> 安全取消（cancel）
 */
export function resolveTouchDropTarget(params: {
  readonly aimPoint: PointerPosition;
  readonly slots: readonly TouchDragSlotCandidate[];
  readonly boardRect?: RectBox | null;
  readonly canDirectPlay: boolean;
  readonly magnetRadiusPx?: number;
}): TouchDropResolution {
  const {
    aimPoint,
    slots,
    boardRect = null,
    canDirectPlay,
    magnetRadiusPx = TOUCH_MAGNET_RADIUS_PX,
  } = params;

  const isActionable = (s: TouchDragSlotCandidate) => s.isValidDeploy || s.isValidUnitTarget;

  // 1. 直接精确命中有效格位或目标单位
  const directValid = slots.find((slot) => isActionable(slot) && pointInRect(aimPoint, slot.rect, 0));
  if (directValid) {
    return {
      kind: 'slot',
      slot: directValid,
      snapped: false,
      aimCenter: rectCenter(directValid.rect),
    };
  }

  // 2. 磁吸邻近有效格位（扩大触控容错并优先选取中心距离最近的格位）
  let nearestValid: TouchDragSlotCandidate | null = null;
  let nearestDist = Infinity;
  for (const slot of slots) {
    if (!isActionable(slot)) continue;
    if (!pointInRect(aimPoint, slot.rect, magnetRadiusPx)) continue;
    const c = rectCenter(slot.rect);
    const d = Math.hypot(aimPoint.x - c.x, aimPoint.y - c.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestValid = slot;
    }
  }
  if (nearestValid) {
    return {
      kind: 'slot',
      slot: nearestValid,
      snapped: true,
      aimCenter: rectCenter(nearestValid.rect),
    };
  }

  // 3. 落在无效格位上，展示明确原因
  const invalidSlot = slots.find((slot) => pointInRect(aimPoint, slot.rect, 0));
  if (invalidSlot) {
    return {
      kind: 'invalid_slot',
      slot: invalidSlot,
      aimCenter: rectCenter(invalidSlot.rect),
    };
  }

  // 4. 直接使用类战术/支援卡拖入战区即可释放
  if (canDirectPlay && boardRect && pointInRect(aimPoint, boardRect, 18)) {
    return {
      kind: 'direct_play',
      aimCenter: aimPoint,
    };
  }

  // 5. 拖回手牌托盘或棋盘外区域 -> 取消
  return {
    kind: 'cancel',
    aimCenter: aimPoint,
  };
}
