import React, { useEffect, useRef, useState } from 'react';
import {
  BOARD_DRAG_THRESHOLD_PX,
  BOARD_MAX_SCALE,
  BOARD_MIN_SCALE,
  BOARD_SCALE_STEP,
  clampBoardPan,
  clampBoardScale,
  computeDefaultBoardScale,
  computePinchDistance,
  computePinchMidpoint,
  computeZoomAroundPoint,
  type BoardViewportTransform,
  type ViewportPoint,
  type ViewportSize,
} from './boardViewportMath';

import { DynamicBattlefieldBackdrop } from './DynamicBattlefieldBackdrop';
import type { ScenicSceneId } from '../ui/ScenicBackdrop';

interface TacticalBoardViewportProps {
  readonly children: React.ReactNode;
  readonly isMobile?: boolean;
  readonly disableGestures?: boolean;
  readonly disableMotion?: boolean;
  readonly arenaBackdropUrl?: string;
  readonly scenicScene?: ScenicSceneId;
  readonly onScaleChange?: (scale: number) => void;
  readonly onBackgroundClick?: () => void;
}

/**
 * 战术棋盘可缩放与拖动视野容器：
 * - 支持双指捏合缩放、鼠标滚轮以指针为中心缩放，以及单指/鼠标拖拽平移
 * - 自动在窄屏竖屏或未来扩展大规格棋盘超出视口时提供平滑适配倍率与一键复位
 * - 使用 6px 拖拽阈值隔离普通点击，保证卡牌/部署槽点选零误触
 */
export function TacticalBoardViewport({
  children,
  isMobile = false,
  disableGestures = false,
  disableMotion = false,
  arenaBackdropUrl,
  scenicScene,
  onScaleChange,
  onBackgroundClick,
}: TacticalBoardViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState<BoardViewportTransform>({ scale: 1, x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  const transformRef = useRef(transform);
  transformRef.current = transform;

  const activePointersRef = useRef<Map<number, ViewportPoint>>(new Map());
  const panSessionRef = useRef<{
    pointerId: number;
    startPointer: ViewportPoint;
    startPan: ViewportPoint;
    moved: boolean;
  } | null>(null);
  const pinchSessionRef = useRef<{
    initialDistance: number;
    initialTransform: BoardViewportTransform;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  const measureSizes = (): { viewport: ViewportSize; content: ViewportSize } => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    return {
      viewport: {
        width: vp?.clientWidth ?? 0,
        height: vp?.clientHeight ?? 0,
      },
      content: {
        width: ct?.offsetWidth ?? 0,
        height: ct?.offsetHeight ?? 0,
      },
    };
  };

  useEffect(() => {
    onScaleChange?.(transform.scale);
  }, [transform.scale, onScaleChange]);

  // 首次或视口尺寸变化时若棋盘超出当前容器则自动计算安全适配倍率
  useEffect(() => {
    const syncFit = () => {
      const { viewport, content } = measureSizes();
      if (viewport.width <= 0 || content.width <= 0) return;

      if (!hasAutoFitted) {
        const fit = computeDefaultBoardScale(viewport, content);
        if (fit < 0.99) {
          setTransform({ scale: fit, x: 0, y: 0 });
        }
        setHasAutoFitted(true);
        return;
      }

      setTransform((prev) => {
        const clampedPan = clampBoardPan({ x: prev.x, y: prev.y }, prev.scale, viewport, content);
        if (clampedPan.x === prev.x && clampedPan.y === prev.y) return prev;
        return { ...prev, x: clampedPan.x, y: clampedPan.y };
      });
    };

    syncFit();
    window.addEventListener('resize', syncFit);
    return () => window.removeEventListener('resize', syncFit);
  }, [hasAutoFitted]);

  const applyScaleStep = (delta: number, focalPoint?: ViewportPoint) => {
    const { viewport, content } = measureSizes();
    const cur = transformRef.current;
    const nextScale = clampBoardScale(cur.scale + delta);
    const focal = focalPoint ?? { x: viewport.width / 2, y: viewport.height / 2 };
    setTransform(
      computeZoomAroundPoint({
        current: cur,
        nextScale,
        focalPoint: focal,
        viewport,
        content,
      }),
    );
  };

  const resetViewport = () => {
    const { viewport, content } = measureSizes();
    const fit = computeDefaultBoardScale(viewport, content);
    setTransform({ scale: fit, x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disableGestures) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 滚轮缩放：向上放大，向下缩小
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    const focal = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    applyScaleStep(step, focal);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disableGestures) return;
    // 忽略右键
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    // 不抢占控制栏内部按钮手势
    if ((e.target as HTMLElement | null)?.closest?.('[data-board-camera-control="true"]')) {
      return;
    }

    const pt = { x: e.clientX, y: e.clientY };
    activePointersRef.current.set(e.pointerId, pt);

    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const dist = computePinchDistance(points[0]!, points[1]!);
      if (dist > 8) {
        pinchSessionRef.current = {
          initialDistance: dist,
          initialTransform: transformRef.current,
        };
        panSessionRef.current = null;
        setIsInteracting(true);
      }
      return;
    }

    if (activePointersRef.current.size === 1) {
      panSessionRef.current = {
        pointerId: e.pointerId,
        startPointer: pt,
        startPan: { x: transformRef.current.x, y: transformRef.current.y },
        moved: false,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disableGestures) return;
    if (!activePointersRef.current.has(e.pointerId)) return;

    const pt = { x: e.clientX, y: e.clientY };
    activePointersRef.current.set(e.pointerId, pt);

    // 1. 双指捏合缩放 + 中点平滑跟随
    if (activePointersRef.current.size >= 2 && pinchSessionRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const dist = computePinchDistance(points[0]!, points[1]!);
      const mid = computePinchMidpoint(points[0]!, points[1]!);
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || pinchSessionRef.current.initialDistance <= 0) return;

      const ratio = dist / pinchSessionRef.current.initialDistance;
      const { viewport, content } = measureSizes();
      const next = computeZoomAroundPoint({
        current: pinchSessionRef.current.initialTransform,
        nextScale: pinchSessionRef.current.initialTransform.scale * ratio,
        focalPoint: { x: mid.x - rect.left, y: mid.y - rect.top },
        viewport,
        content,
      });
      suppressNextClickRef.current = true;
      setTransform(next);
      return;
    }

    // 2. 单指 / 鼠标拖拽平移棋盘视野
    const pan = panSessionRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;

    const dx = pt.x - pan.startPointer.x;
    const dy = pt.y - pan.startPointer.y;
    const dist = Math.hypot(dx, dy);

    if (!pan.moved) {
      if (dist < BOARD_DRAG_THRESHOLD_PX) return;
      pan.moved = true;
      suppressNextClickRef.current = true;
      setIsInteracting(true);
    }

    const { viewport, content } = measureSizes();
    const clamped = clampBoardPan(
      { x: pan.startPan.x + dx, y: pan.startPan.y + dy },
      transformRef.current.scale,
      viewport,
      content,
    );
    setTransform((prev) => ({ ...prev, x: clamped.x, y: clamped.y }));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchSessionRef.current = null;
    }

    if (panSessionRef.current?.pointerId === e.pointerId) {
      panSessionRef.current = null;
    }

    if (activePointersRef.current.size === 0) {
      setIsInteracting(false);
      if (suppressNextClickRef.current) {
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 60);
      }
    }
  };

  const scalePercent = Math.round(transform.scale * 100);
  const isModified =
    Math.abs(transform.scale - 1) > 0.015 ||
    Math.abs(transform.x) > 2 ||
    Math.abs(transform.y) > 2;

  return (
    <div
      ref={viewportRef}
      data-testid="board-viewport"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={(e) => {
        if (suppressNextClickRef.current) {
          e.stopPropagation();
          e.preventDefault();
          suppressNextClickRef.current = false;
        }
      }}
      onClick={() => onBackgroundClick?.()}
      className="relative flex-1 min-h-0 overflow-hidden overscroll-contain flex items-center justify-center touch-none select-none px-1 sm:px-3 lg:px-4 py-1 sm:py-1.5"
    >
      {/* 动态 Arknights 主题战场氛围背景（CSS 轻微缓动 + 半边淡出官方风景 + Canvas 源石微尘/战术网格） */}
      <DynamicBattlefieldBackdrop
        backdropUrl={arenaBackdropUrl}
        scenicScene={scenicScene}
        disableMotion={disableMotion}
      />

      {/* 可缩放平移的棋盘载体层 */}
      <div
        ref={contentRef}
        data-board-scale={transform.scale.toFixed(2)}
        className="relative z-10 w-full max-w-4xl origin-center will-change-transform"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transition: isInteracting ? 'none' : 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {children}
      </div>

      {/* 浮动视野控制条：支持放大/缩小/百分比直显/一键复位适配 */}
      <div
        data-board-camera-control="true"
        data-testid="board-camera-controls"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-3 z-30 flex items-center gap-0.5 bg-[#121720]/92 backdrop-blur-xs border border-[#3a4859] shadow-[0_6px_20px_rgba(0,0,0,0.65)] p-0.5 font-mono text-[10px] sm:text-[11px] text-slate-200 tabular-nums"
        style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
      >
        <button
          type="button"
          onClick={() => applyScaleStep(-BOARD_SCALE_STEP)}
          disabled={transform.scale <= BOARD_MIN_SCALE + 0.01}
          aria-label="缩小棋盘视野"
          title="缩小视野"
          className="min-w-[28px] min-h-[28px] sm:min-w-[26px] sm:min-h-[26px] flex items-center justify-center bg-[#18202c] hover:bg-[#232e3e] disabled:opacity-35 text-slate-100 font-bold cursor-pointer transition-colors"
        >
          －
        </button>
        <button
          type="button"
          onClick={resetViewport}
          aria-label="重置棋盘视野缩放"
          title={isMobile ? '点击一键恢复适配视野（支持双指缩放/拖动）' : '点击恢复默认视野（支持滚轮缩放/拖拽平移）'}
          className="px-1.5 sm:px-2 min-h-[28px] sm:min-h-[26px] flex items-center justify-center hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          <span className={isModified ? 'text-amber-300 font-bold' : 'text-slate-300'}>
            {scalePercent}%
          </span>
        </button>
        <button
          type="button"
          onClick={() => applyScaleStep(BOARD_SCALE_STEP)}
          disabled={transform.scale >= BOARD_MAX_SCALE - 0.01}
          aria-label="放大棋盘视野"
          title="放大视野"
          className="min-w-[28px] min-h-[28px] sm:min-w-[26px] sm:min-h-[26px] flex items-center justify-center bg-[#18202c] hover:bg-[#232e3e] disabled:opacity-35 text-slate-100 font-bold cursor-pointer transition-colors"
        >
          ＋
        </button>
        {isModified && (
          <button
            type="button"
            onClick={resetViewport}
            aria-label="重置棋盘位置"
            title="复位棋盘位置与缩放"
            className="px-1.5 min-h-[28px] sm:min-h-[26px] flex items-center justify-center bg-amber-500/15 hover:bg-amber-500/25 border-l border-[#3a4859] text-amber-300 font-bold cursor-pointer transition-colors whitespace-nowrap"
          >
            复位
          </button>
        )}
      </div>
    </div>
  );
}
