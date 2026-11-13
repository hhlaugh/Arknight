import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

export const LONG_PRESS_DELAY_MS = 450;
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10;

export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

export function exceedsMoveThreshold(
  start: PointerPosition,
  current: PointerPosition,
  thresholdPx: number = LONG_PRESS_MOVE_THRESHOLD_PX,
): boolean {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return Math.hypot(dx, dy) > thresholdPx;
}

export interface LongPressControllerOptions {
  readonly delayMs?: number;
  readonly moveThresholdPx?: number;
  readonly onLongPress: () => void;
  readonly onTap?: () => void;
}

/**
 * 纯逻辑长按控制器，便于单元测试与跨组件复用。
 * - pointerdown 启动定时器（默认 450ms）
 * - 移动距离超过阈值（默认 10px）立即取消，避免与横向手牌滑动或拖放冲突
 * - 长按触发后自动吞掉随后松手产生的 click/tap，防止误部署
 */
export function createLongPressController(options: LongPressControllerOptions) {
  const delayMs = options.delayMs ?? LONG_PRESS_DELAY_MS;
  const moveThresholdPx = options.moveThresholdPx ?? LONG_PRESS_MOVE_THRESHOLD_PX;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let startPos: PointerPosition | null = null;
  let longPressFired = false;
  let cancelledByMove = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (pos: PointerPosition) => {
    clearTimer();
    startPos = pos;
    longPressFired = false;
    cancelledByMove = false;
    timer = setTimeout(() => {
      timer = null;
      longPressFired = true;
      options.onLongPress();
    }, delayMs);
  };

  const move = (pos: PointerPosition) => {
    if (!startPos) return;
    if (exceedsMoveThreshold(startPos, pos, moveThresholdPx)) {
      cancelledByMove = true;
      clearTimer();
    }
  };

  const end = () => {
    clearTimer();
    startPos = null;
  };

  const cancel = () => {
    clearTimer();
    startPos = null;
    cancelledByMove = true;
  };

  const consumeClick = (): boolean => {
    if (longPressFired || cancelledByMove) {
      longPressFired = false;
      cancelledByMove = false;
      return false;
    }
    options.onTap?.();
    return true;
  };

  const wasLongPressTriggered = () => longPressFired;

  return {
    start,
    move,
    end,
    cancel,
    consumeClick,
    wasLongPressTriggered,
  };
}

export interface UseLongPressOptions {
  readonly onLongPress?: () => void;
  readonly onClick?: () => void;
  readonly delayMs?: number;
  readonly moveThresholdPx?: number;
  readonly disabled?: boolean;
}

export interface LongPressHandlers {
  readonly onPointerDown: (e: React.PointerEvent) => void;
  readonly onPointerMove: (e: React.PointerEvent) => void;
  readonly onPointerUp: (e: React.PointerEvent) => void;
  readonly onPointerCancel: (e: React.PointerEvent) => void;
  readonly onClick: (e: React.MouseEvent) => void;
  readonly onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onClick,
  delayMs = LONG_PRESS_DELAY_MS,
  moveThresholdPx = LONG_PRESS_MOVE_THRESHOLD_PX,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<PointerPosition | null>(null);
  const longPressFiredRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      clearTimer();
      startPosRef.current = null;
    };
    window.addEventListener('blur', handleBlur);
    return () => {
      clearTimer();
      window.removeEventListener('blur', handleBlur);
    };
  }, [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !onLongPress) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      clearTimer();
      longPressFiredRef.current = false;
      suppressNextClickRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressFiredRef.current = true;
        suppressNextClickRef.current = true;
        onLongPress();
      }, delayMs);
    },
    [disabled, onLongPress, clearTimer, delayMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current) return;
      if (exceedsMoveThreshold(startPosRef.current, { x: e.clientX, y: e.clientY }, moveThresholdPx)) {
        clearTimer();
        startPosRef.current = null;
      }
    },
    [clearTimer, moveThresholdPx],
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
    longPressFiredRef.current = false;
    suppressNextClickRef.current = false;
  }, [clearTimer]);

  const onClickHandler = useCallback(
    (e: React.MouseEvent) => {
      if (suppressNextClickRef.current || longPressFiredRef.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClickRef.current = false;
        longPressFiredRef.current = false;
        return;
      }
      if (!disabled) {
        onClick?.();
      }
    },
    [disabled, onClick],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (onLongPress && !disabled) {
        e.preventDefault();
      }
    },
    [onLongPress, disabled],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick: onClickHandler,
    onContextMenu,
  };
}
