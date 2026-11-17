import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export const LONG_PRESS_DELAY_MS = 450;
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10;
export const DOUBLE_TAP_WINDOW_MS = 300;
export const HOLD_FEEDBACK_DELAY_MS = 110;

export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

export function triggerHaptic(durationMs = 12): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // 忽略部分浏览器/系统不支持震动抛出的异常
  }
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
  readonly doubleTapWindowMs?: number;
  readonly now?: () => number;
  readonly onLongPress: () => void;
  readonly onTap?: () => void;
  readonly onDoubleTap?: () => void;
}

/**
 * 纯逻辑长按与双击手势控制器，便于单元测试与跨组件复用。
 * - pointerdown 启动定时器（默认 450ms）
 * - 移动距离超过阈值（默认 10px）立即取消，避免与横向手牌滑动或拖拽冲突
 * - 长按触发后自动吞掉随后松手产生的 click/tap，防止误部署
 * - 首次轻点立即触发 onTap（零延迟），若在 doubleTapWindowMs（默认 300ms）内再次轻点则触发 onDoubleTap
 */
export function createLongPressController(options: LongPressControllerOptions) {
  const delayMs = options.delayMs ?? LONG_PRESS_DELAY_MS;
  const moveThresholdPx = options.moveThresholdPx ?? LONG_PRESS_MOVE_THRESHOLD_PX;
  const doubleTapWindowMs = options.doubleTapWindowMs ?? DOUBLE_TAP_WINDOW_MS;
  const getNow = options.now ?? (() => Date.now());

  let timer: ReturnType<typeof setTimeout> | null = null;
  let startPos: PointerPosition | null = null;
  let longPressFired = false;
  let cancelledByMove = false;
  let lastTapAt = 0;

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
      lastTapAt = 0;
      options.onLongPress();
    }, delayMs);
  };

  const move = (pos: PointerPosition) => {
    if (!startPos) return;
    if (exceedsMoveThreshold(startPos, pos, moveThresholdPx)) {
      cancelledByMove = true;
      lastTapAt = 0;
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
    lastTapAt = 0;
  };

  const consumeClick = (): boolean => {
    if (longPressFired || cancelledByMove) {
      longPressFired = false;
      cancelledByMove = false;
      lastTapAt = 0;
      return false;
    }
    const nowMs = getNow();
    if (options.onDoubleTap && lastTapAt > 0 && nowMs - lastTapAt <= doubleTapWindowMs) {
      lastTapAt = 0;
      options.onDoubleTap();
      return true;
    }
    lastTapAt = nowMs;
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
  readonly onDoubleTap?: () => void;
  readonly delayMs?: number;
  readonly moveThresholdPx?: number;
  readonly doubleTapWindowMs?: number;
  readonly disabled?: boolean;
}

export interface LongPressHandlers {
  readonly isHolding: boolean;
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
  onDoubleTap,
  delayMs = LONG_PRESS_DELAY_MS,
  moveThresholdPx = LONG_PRESS_MOVE_THRESHOLD_PX,
  doubleTapWindowMs = DOUBLE_TAP_WINDOW_MS,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<PointerPosition | null>(null);
  const longPressFiredRef = useRef(false);
  const cancelledByMoveRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const lastTapAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (holdFeedbackTimerRef.current !== null) {
      clearTimeout(holdFeedbackTimerRef.current);
      holdFeedbackTimerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      clearTimers();
      startPosRef.current = null;
    };
    window.addEventListener('blur', handleBlur);
    return () => {
      clearTimers();
      window.removeEventListener('blur', handleBlur);
    };
  }, [clearTimers]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      clearTimers();
      longPressFiredRef.current = false;
      cancelledByMoveRef.current = false;
      suppressNextClickRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      if (!onLongPress) return;

      holdFeedbackTimerRef.current = setTimeout(() => {
        holdFeedbackTimerRef.current = null;
        if (startPosRef.current && !cancelledByMoveRef.current) {
          setIsHolding(true);
        }
      }, HOLD_FEEDBACK_DELAY_MS);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressFiredRef.current = true;
        suppressNextClickRef.current = true;
        lastTapAtRef.current = 0;
        setIsHolding(false);
        triggerHaptic(14);
        onLongPress();
      }, delayMs);
    },
    [disabled, onLongPress, clearTimers, delayMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current) return;
      if (exceedsMoveThreshold(startPosRef.current, { x: e.clientX, y: e.clientY }, moveThresholdPx)) {
        clearTimers();
        cancelledByMoveRef.current = true;
        lastTapAtRef.current = 0;
        startPosRef.current = null;
      }
    },
    [clearTimers, moveThresholdPx],
  );

  const onPointerUp = useCallback(() => {
    clearTimers();
    startPosRef.current = null;
  }, [clearTimers]);

  const onPointerCancel = useCallback(() => {
    clearTimers();
    startPosRef.current = null;
    longPressFiredRef.current = false;
    cancelledByMoveRef.current = false;
    suppressNextClickRef.current = false;
    lastTapAtRef.current = 0;
  }, [clearTimers]);

  const onClickHandler = useCallback(
    (e: React.MouseEvent) => {
      if (suppressNextClickRef.current || longPressFiredRef.current || cancelledByMoveRef.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClickRef.current = false;
        longPressFiredRef.current = false;
        cancelledByMoveRef.current = false;
        lastTapAtRef.current = 0;
        return;
      }
      if (!disabled) {
        const nowMs = Date.now();
        if (onDoubleTap && lastTapAtRef.current > 0 && nowMs - lastTapAtRef.current <= doubleTapWindowMs) {
          lastTapAtRef.current = 0;
          onDoubleTap();
          return;
        }
        lastTapAtRef.current = nowMs;
        onClick?.();
      }
    },
    [disabled, onClick, onDoubleTap, doubleTapWindowMs],
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
    isHolding,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick: onClickHandler,
    onContextMenu,
  };
}
