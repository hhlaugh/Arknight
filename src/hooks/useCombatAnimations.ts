import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardInstanceId, CombatLogEvent, GameState, PlayerId } from '../game/types';
import {
  buildPresentationBeats,
  captureBoardPositions,
  DEFAULT_ANIMATION_SPEED_MODE,
  getCssAnimationScale,
  type AnimationSpeedMode,
  type PresentationBeat,
  type UnitSlotLocation,
} from '../components/battle/combatPresentation';

const ANIM_SPEED_STORAGE_KEY = 'ark_tactical_anim_speed_v2';

function readStoredSpeedMode(): AnimationSpeedMode {
  if (typeof window === 'undefined') return DEFAULT_ANIMATION_SPEED_MODE;
  try {
    const val = window.localStorage.getItem(ANIM_SPEED_STORAGE_KEY);
    if (val === 'slow' || val === 'normal' || val === 'fast' || val === 'off') return val;
  } catch {
    // 忽略存储读取异常
  }
  return DEFAULT_ANIMATION_SPEED_MODE;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

interface UseCombatAnimationsParams {
  readonly state: GameState;
  readonly logHistory: readonly CombatLogEvent[];
  readonly bottomPlayer: PlayerId;
}

export interface CombatAnimationsHandle {
  readonly speedMode: AnimationSpeedMode;
  readonly cssAnimScale: number;
  readonly setSpeedMode: (mode: AnimationSpeedMode) => void;
  readonly cycleSpeedMode: () => void;
  readonly effectiveDisabled: boolean;
  readonly activeBeat: PresentationBeat | null;
  readonly isPlaying: boolean;
  readonly remainingQueueCount: number;
  readonly skipAll: () => void;
}

/**
 * 战斗轻量动画队列 Hook（100% 引擎日志驱动，零副作用、不阻塞任何玩家指令）。
 */
export function useCombatAnimations({
  state,
  logHistory,
  bottomPlayer,
}: UseCombatAnimationsParams): CombatAnimationsHandle {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [speedMode, setSpeedModeState] = useState<AnimationSpeedMode>(readStoredSpeedMode);
  const [queue, setQueue] = useState<readonly PresentationBeat[]>([]);

  const prevStateRef = useRef<GameState | null>(null);
  const prevLogLenRef = useRef<number>(logHistory.length);
  const prevPositionsRef = useRef<Map<CardInstanceId, UnitSlotLocation>>(captureBoardPositions(state));
  const timerRef = useRef<number | null>(null);

  const effectiveDisabled = speedMode === 'off' || prefersReducedMotion;

  const setSpeedMode = useCallback((mode: AnimationSpeedMode) => {
    setSpeedModeState(mode);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ANIM_SPEED_STORAGE_KEY, mode);
      } catch {
        // 忽略存储写入异常
      }
    }
    if (mode === 'off') {
      setQueue([]);
    }
  }, []);

  const cycleSpeedMode = useCallback(() => {
    const order: readonly AnimationSpeedMode[] = ['slow', 'normal', 'fast', 'off'];
    const idx = order.indexOf(speedMode);
    const next = order[(idx + 1) % order.length];
    setSpeedMode(next);
  }, [setSpeedMode, speedMode]);

  const skipAll = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setQueue([]);
  }, []);

  // 监听引擎快照与 logHistory 增量，提取本步轻量演出队列
  useEffect(() => {
    const prevState = prevStateRef.current;
    const prevLogLen = prevLogLenRef.current;
    const prevPositions = prevPositionsRef.current;

    // 首次挂载或重开对局（日志长度/版本回退）时不播放旧事件
    const isReset =
      prevState === null ||
      logHistory.length < prevLogLen ||
      state.state_version < prevState.state_version;

    const currentPositions = captureBoardPositions(state);
    prevStateRef.current = state;
    prevLogLenRef.current = logHistory.length;
    prevPositionsRef.current = currentPositions;

    if (isReset) {
      setQueue([]);
      return;
    }

    if (effectiveDisabled) {
      setQueue([]);
      return;
    }

    const newEvents = logHistory.slice(prevLogLen);
    if (
      newEvents.length === 0 &&
      prevState.active_player_id === state.active_player_id &&
      prevState.turn_number === state.turn_number &&
      prevState.players.player_a.base_points === state.players.player_a.base_points &&
      prevState.players.player_b.base_points === state.players.player_b.base_points
    ) {
      return;
    }

    const newBeats = buildPresentationBeats({
      prevState,
      nextState: state,
      newEvents,
      prevPositions,
      bottomPlayer,
      speedMode,
    });

    if (newBeats.length > 0) {
      // 保留合理上限以防连续快速操作堆积卡顿
      setQueue((prev) => {
        const combined = [...prev, ...newBeats];
        return combined.length > 10 ? combined.slice(combined.length - 10) : combined;
      });
    }
  }, [state, logHistory, bottomPlayer, speedMode, effectiveDisabled]);

  // 定时推进队列中的当前节拍，并在卸载或清空时清理定时器
  const activeBeat = !effectiveDisabled && queue.length > 0 ? queue[0] : null;

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!activeBeat) return;

    const duration = Math.max(80, activeBeat.durationMs);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setQueue((prev) => prev.slice(1));
    }, duration);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeBeat]);

  return {
    speedMode,
    cssAnimScale: effectiveDisabled ? 0 : getCssAnimationScale(speedMode),
    setSpeedMode,
    cycleSpeedMode,
    effectiveDisabled,
    activeBeat,
    isPlaying: Boolean(activeBeat),
    remainingQueueCount: activeBeat ? queue.length : 0,
    skipAll,
  };
}
