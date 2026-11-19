import { describe, expect, it } from 'vitest';
import {
  BOARD_MAX_SCALE,
  BOARD_MIN_SCALE,
  clampBoardPan,
  clampBoardScale,
  computeDefaultBoardScale,
  computePinchDistance,
  computePinchMidpoint,
  computeZoomAroundPoint,
} from './boardViewportMath';

describe('boardViewportMath: 棋盘缩放与拖动视野纯函数测试', () => {
  it('clampBoardScale: 严格将缩放倍率限制在 [0.65, 1.85]', () => {
    expect(clampBoardScale(0.2)).toBe(BOARD_MIN_SCALE);
    expect(clampBoardScale(3.5)).toBe(BOARD_MAX_SCALE);
    expect(clampBoardScale(Number.NaN)).toBe(1);
    expect(clampBoardScale(1.300001)).toBe(1.3);
  });

  it('clampBoardPan: 在任意倍率下限制平移边界防止棋盘移出视野', () => {
    const viewport = { width: 390, height: 420 };
    const content = { width: 376, height: 390 };

    const zoomedIn = clampBoardPan({ x: 9999, y: -9999 }, 1.6, viewport, content);
    expect(zoomedIn.x).toBeLessThan(350);
    expect(zoomedIn.x).toBeGreaterThan(100);
    expect(zoomedIn.y).toBeGreaterThan(-350);
    expect(zoomedIn.y).toBeLessThan(-100);

    const unzoomed = clampBoardPan({ x: 500, y: 500 }, 1, viewport, content);
    expect(unzoomed.x).toBeLessThanOrEqual(40);
    expect(unzoomed.y).toBeLessThanOrEqual(48);
  });

  it('computeZoomAroundPoint: 围绕光标/双指中心缩放时调整位移使锚点稳定', () => {
    const viewport = { width: 800, height: 600 };
    const content = { width: 760, height: 480 };
    const res = computeZoomAroundPoint({
      current: { scale: 1, x: 0, y: 0 },
      nextScale: 1.5,
      focalPoint: { x: 600, y: 400 },
      viewport,
      content,
    });
    expect(res.scale).toBe(1.5);
    expect(res.x).toBeLessThan(0);
    expect(res.y).toBeLessThan(0);
  });

  it('双指捏合距离与中点、未来大棋盘自动适配倍率计算正确', () => {
    expect(computePinchDistance({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50);
    expect(computePinchMidpoint({ x: 100, y: 200 }, { x: 220, y: 340 })).toEqual({ x: 160, y: 270 });

    // 未来更大棋盘在手机竖屏视口下自动缩放到完整可视倍率
    const mobileFit = computeDefaultBoardScale({ width: 360, height: 380 }, { width: 520, height: 480 });
    expect(mobileFit).toBeGreaterThanOrEqual(BOARD_MIN_SCALE);
    expect(mobileFit).toBeLessThan(1);

    // 足够宽敞时保持 1.0 原生尺寸
    expect(computeDefaultBoardScale({ width: 1000, height: 620 }, { width: 860, height: 480 })).toBe(1);
  });
});
