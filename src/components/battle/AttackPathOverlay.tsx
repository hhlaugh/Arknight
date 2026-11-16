import React from 'react';
import type { LaneId, PlayerId, Position } from '../../game/types';
import type { LaneStrikeCue } from './combatPresentation';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

interface AttackPathOverlayProps {
  readonly strikes: readonly LaneStrikeCue[];
  readonly bottomPlayer: PlayerId;
  readonly topPlayer: PlayerId;
  readonly slotCenters?: Readonly<Record<string, Point2D>>;
  readonly boardSize?: { readonly width: number; readonly height: number };
  readonly cssAnimScale: number;
  readonly disableMotion: boolean;
}

const LANE_X_RATIO: Record<LaneId, number> = {
  left: 1 / 6,
  center: 0.5,
  right: 5 / 6,
};

function parseSlotKey(slotKey: string): { half: PlayerId; lane: LaneId; position: Position } | null {
  const parts = slotKey.split(':');
  if (parts.length !== 3) return null;
  const [half, lane, position] = parts;
  if (
    (half === 'player_a' || half === 'player_b') &&
    (lane === 'left' || lane === 'center' || lane === 'right') &&
    (position === 'front' || position === 'back')
  ) {
    return { half, lane, position };
  }
  return null;
}

function fallbackPointForSlot(
  slotKey: string,
  bottomPlayer: PlayerId,
  topPlayer: PlayerId,
  width: number,
  height: number,
): Point2D | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return null;
  const x = LANE_X_RATIO[parsed.lane] * width;
  let yRatio = 0.5;
  if (parsed.half === topPlayer) {
    yRatio = parsed.position === 'back' ? 0.21 : 0.40;
  } else if (parsed.half === bottomPlayer) {
    yRatio = parsed.position === 'front' ? 0.60 : 0.79;
  }
  return { x, y: yRatio * height };
}

function fallbackBasePoint(
  targetHalf: PlayerId,
  lane: LaneId,
  bottomPlayer: PlayerId,
  width: number,
  height: number,
): Point2D {
  const x = LANE_X_RATIO[lane] * width;
  const y = (targetHalf === bottomPlayer ? 0.96 : 0.04) * height;
  return { x, y };
}

function buildStrikePathD(start: Point2D, end: Point2D, attackType: 'melee' | 'ranged', direction: 'up' | 'down'): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (attackType === 'ranged' || Math.abs(dx) > 12) {
    // 远程或跨路攻击采用带横向弧度的战术抛物线，避开中线遮挡，清晰展示起点与落点
    const curveOffset = Math.abs(dx) > 12 ? 0 : direction === 'up' ? 34 : -34;
    const cx = (start.x + end.x) / 2 + curveOffset;
    const cy = (start.y + end.y) / 2;
    return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }
  // 近战直线突刺路径，略微偏移避免完全压在文字中心
  const offset = direction === 'up' ? -2 : 2;
  return `M ${(start.x + offset).toFixed(1)} ${start.y.toFixed(1)} L ${(end.x + offset).toFixed(1)} ${(end.y + dy * 0.01).toFixed(1)}`;
}

/**
 * 全棋盘战术攻击路径矢量覆盖层 (AttackPathOverlay)
 * 在攻击节拍内直接连接攻击方格位与目标格位（或基地边界），提供清晰的视觉轨迹与锁定准星。
 */
export function AttackPathOverlay({
  strikes,
  bottomPlayer,
  topPlayer,
  slotCenters,
  boardSize,
  cssAnimScale,
  disableMotion,
}: AttackPathOverlayProps) {
  if (disableMotion || strikes.length === 0) return null;

  const width = boardSize && boardSize.width > 0 ? boardSize.width : 900;
  const height = boardSize && boardSize.height > 0 ? boardSize.height : 420;
  const travelSeconds = Math.max(0.24, 0.44 * (cssAnimScale > 0 ? cssAnimScale : 1));

  return (
    <svg
      data-testid="attack-path-overlay"
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 w-full h-full z-30 overflow-visible"
    >
      <defs>
        <marker id="atk-arrow-ally" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 1 1 L 11 6 L 1 11 L 3.5 6 Z" fill="#e5a52b" />
        </marker>
        <marker id="atk-arrow-enemy" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 1 1 L 11 6 L 1 11 L 3.5 6 Z" fill="#fb7185" />
        </marker>
        <marker id="atk-arrow-skill" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 1 1 L 11 6 L 1 11 L 3.5 6 Z" fill="#22d3ee" />
        </marker>
      </defs>

      {strikes.map((strike) => {
        const start =
          slotCenters?.[strike.attackerSlotKey] ??
          fallbackPointForSlot(strike.attackerSlotKey, bottomPlayer, topPlayer, width, height);
        if (!start) return null;

        let end: Point2D | null = null;
        if (strike.targetSlotKey) {
          end =
            slotCenters?.[strike.targetSlotKey] ??
            fallbackPointForSlot(strike.targetSlotKey, bottomPlayer, topPlayer, width, height);
        } else if (strike.toBase) {
          const targetHalf = strike.targetHalf ?? (strike.direction === 'up' ? topPlayer : bottomPlayer);
          const targetLane = strike.targetLane ?? strike.lane;
          const baseLaneFrontKey = `${targetHalf}:${targetLane}:front`;
          const frontCenter = slotCenters?.[baseLaneFrontKey];
          if (frontCenter) {
            end = {
              x: frontCenter.x,
              y: strike.direction === 'up' ? Math.max(10, frontCenter.y - 96) : Math.min(height - 10, frontCenter.y + 96),
            };
          } else {
            end = fallbackBasePoint(targetHalf, targetLane, bottomPlayer, width, height);
          }
        }

        if (!end) return null;

        const isSkill = strike.kind === 'skill';
        const isAlly = strike.direction === 'up';
        const primaryColor = isSkill ? '#22d3ee' : isAlly ? '#38bdf8' : '#fb7185';
        const accentColor = isSkill ? '#a5f3fc' : isAlly ? '#e5a52b' : '#f59e0b';
        const markerUrl = isSkill
          ? 'url(#atk-arrow-skill)'
          : isAlly
            ? 'url(#atk-arrow-ally)'
            : 'url(#atk-arrow-enemy)';

        const pathD = buildStrikePathD(start, end, strike.attackType, strike.direction);
        const isStrikePhase = strike.phase === 'strike';

        return (
          <g key={`${strike.id}-${strike.phase}`}>
            {/* 攻击起点锚定光圈 */}
            <circle
              cx={start.x}
              cy={start.y}
              r={isStrikePhase ? 9 : 6}
              fill="none"
              stroke={primaryColor}
              strokeWidth={isStrikePhase ? 2.5 : 1.5}
              strokeOpacity={isStrikePhase ? 0.9 : 0.35}
            />
            <circle cx={start.x} cy={start.y} r={3.5} fill={accentColor} fillOpacity={isStrikePhase ? 1 : 0.4} />

            {/* 外层柔光轨迹线 */}
            <path
              d={pathD}
              fill="none"
              stroke={primaryColor}
              strokeWidth={isStrikePhase ? 8 : 5}
              strokeOpacity={isStrikePhase ? 0.25 : 0.14}
              strokeLinecap="round"
            />

            {/* 主路径矢线 */}
            <path
              d={pathD}
              fill="none"
              stroke={accentColor}
              strokeWidth={isStrikePhase ? 3 : 2}
              strokeOpacity={isStrikePhase ? 0.95 : 0.45}
              strokeLinecap="round"
              markerEnd={markerUrl}
              className={isStrikePhase ? 'anim-path-draw' : undefined}
            />

            {/* 打击阶段：流动能量虚线与行进弹体 */}
            {isStrikePhase && (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.8}
                  strokeOpacity={0.75}
                  className="anim-path-flow"
                />
                <circle r={strike.attackType === 'ranged' ? 5.5 : 4.5} fill={accentColor} stroke="#ffffff" strokeWidth={1.5}>
                  <animateMotion dur={`${travelSeconds.toFixed(2)}s`} repeatCount="1" fill="freeze" path={pathD} />
                </circle>
              </>
            )}

            {/* 目标点准星 / 命中爆发圈 */}
            {isStrikePhase ? (
              <g className="anim-reticle-lock">
                <circle
                  cx={end.x}
                  cy={end.y}
                  r={strike.toBase ? 15 : 13}
                  fill={primaryColor}
                  fillOpacity={0.14}
                  stroke={accentColor}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <line x1={end.x - 19} y1={end.y} x2={end.x - 10} y2={end.y} stroke={accentColor} strokeWidth={2} />
                <line x1={end.x + 10} y1={end.y} x2={end.x + 19} y2={end.y} stroke={accentColor} strokeWidth={2} />
                <line x1={end.x} y1={end.y - 19} x2={end.x} y2={end.y - 10} stroke={accentColor} strokeWidth={2} />
                <line x1={end.x} y1={end.y + 10} x2={end.x} y2={end.y + 19} stroke={accentColor} strokeWidth={2} />
              </g>
            ) : (
              <circle
                cx={end.x}
                cy={end.y}
                r={18}
                fill={accentColor}
                fillOpacity={0.22}
                stroke={accentColor}
                strokeWidth={2.5}
                className="anim-impact-burst"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
