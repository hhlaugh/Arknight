export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface BoardViewportTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export const BOARD_MIN_SCALE = 0.65;
export const BOARD_MAX_SCALE = 1.85;
export const BOARD_SCALE_STEP = 0.15;
export const BOARD_DRAG_THRESHOLD_PX = 6;

export function clampBoardScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.min(BOARD_MAX_SCALE, Math.max(BOARD_MIN_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

export function clampBoardPan(
  pan: ViewportPoint,
  scale: number,
  viewport: ViewportSize,
  content: ViewportSize,
): ViewportPoint {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { x: 0, y: 0 };
  }

  const scaledW = content.width * scale;
  const scaledH = content.height * scale;

  // 允许拖拽至超出视口的边缘区域，并在缩放小于视口时保留温和的视野微调裕度
  const marginX = Math.min(96, viewport.width * 0.22);
  const marginY = Math.min(96, viewport.height * 0.22);

  const overflowX = Math.max(0, (scaledW - viewport.width) / 2);
  const overflowY = Math.max(0, (scaledH - viewport.height) / 2);

  const maxX = overflowX + (scale > 1.02 ? marginX : Math.min(40, marginX * 0.45));
  const maxY = overflowY + (scale > 1.02 ? marginY : Math.min(48, marginY * 0.55));

  return {
    x: Math.round(Math.min(maxX, Math.max(-maxX, Number.isFinite(pan.x) ? pan.x : 0)) * 10) / 10,
    y: Math.round(Math.min(maxY, Math.max(-maxY, Number.isFinite(pan.y) ? pan.y : 0)) * 10) / 10,
  };
}

export function computeZoomAroundPoint(params: {
  readonly current: BoardViewportTransform;
  readonly nextScale: number;
  readonly focalPoint: ViewportPoint;
  readonly viewport: ViewportSize;
  readonly content: ViewportSize;
}): BoardViewportTransform {
  const { current, focalPoint, viewport, content } = params;
  const nextScale = clampBoardScale(params.nextScale);
  if (Math.abs(nextScale - current.scale) < 0.001) {
    return current;
  }

  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const ratio = nextScale / current.scale;

  // 以视口中心为缩放原点推算锚点位移，确保双指中心或光标所指格位保持稳定
  const dx = focalPoint.x - centerX;
  const dy = focalPoint.y - centerY;
  const rawPan = {
    x: dx - (dx - current.x) * ratio,
    y: dy - (dy - current.y) * ratio,
  };
  const clampedPan = clampBoardPan(rawPan, nextScale, viewport, content);

  return {
    scale: nextScale,
    x: clampedPan.x,
    y: clampedPan.y,
  };
}

export function computePinchDistance(a: ViewportPoint, b: ViewportPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function computePinchMidpoint(a: ViewportPoint, b: ViewportPoint): ViewportPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function computeDefaultBoardScale(
  viewport: ViewportSize,
  content: ViewportSize,
): number {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) {
    return 1;
  }
  const widthRatio = (viewport.width - 8) / content.width;
  const heightRatio = (viewport.height - 8) / content.height;
  const fitRatio = Math.min(widthRatio, heightRatio);
  if (fitRatio >= 0.98) {
    return 1;
  }
  return clampBoardScale(fitRatio);
}
