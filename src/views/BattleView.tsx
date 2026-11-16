import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ActionResult, LocalGameController, LocalGameSnapshot } from '../client/localGameController';
import { LANE_LABEL, PLAYER_LABEL } from '../client/gameData';
import { cardDefinitionOf } from '../components/cards/CardView';
import { UnitView } from '../components/battle/UnitView';
import type { UnitHighlight } from '../components/battle/UnitView';
import { LogView } from '../components/battle/LogView';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Modal } from '../components/ui/Modal';
import { TacticalBattleHud } from '../components/battle/TacticalBattleHud';
import { PlayerHandDock } from '../components/battle/PlayerHandDock';
import { TacticalDetailPanel } from '../components/battle/TacticalDetailPanel';
import { AttackPathOverlay, type Point2D } from '../components/battle/AttackPathOverlay';
import { CardPreviewPopover, type HoveredCardPreview } from '../components/battle/CardPreviewPopover';
import {
  getInvalidCardReason,
  getInvalidDeployReason,
  getInvalidUnitActionReason,
  previewAttackTargets,
} from '../components/battle/tacticalSelectors';
import {
  makeSlotKey,
  type FloatingPopupKind,
  type UnitAnimationState,
} from '../components/battle/combatPresentation';
import { enumerateLegalActions } from '../game/legal-actions';
import { useCombatAnimations } from '../hooks/useCombatAnimations';
import { useViewport } from '../hooks/useViewport';
import type { CardInstance, CardInstanceId, GameAction, LaneId, PlayerId, Position } from '../game/types';

const SLOT_POPUP_STYLE: Record<FloatingPopupKind, string> = {
  damage: 'bg-rose-950/95 text-rose-200 border-rose-400',
  shield: 'bg-sky-950/95 text-sky-200 border-sky-400',
  heal: 'bg-emerald-950/95 text-emerald-200 border-emerald-400',
  sp: 'bg-cyan-950/95 text-cyan-200 border-cyan-400',
  skill: 'bg-amber-950/95 text-amber-200 border-amber-400',
  deploy: 'bg-amber-950/90 text-amber-300 border-amber-500/80',
  status: 'bg-purple-950/95 text-purple-200 border-purple-400',
};

const LANES: readonly LaneId[] = ['left', 'center', 'right'];

type DeployAction = Extract<GameAction, { type: 'deploy_operator' }>;
type PlayCardAction = Extract<GameAction, { type: 'play_card' }>;
type SkillAction = Extract<GameAction, { type: 'activate_skill' }>;
type WithdrawAction = Extract<GameAction, { type: 'withdraw_operator' }>;
type PendingResolveAction = Extract<GameAction, { type: 'resolve_pending_choice' }>;

interface SlotCoords {
  readonly half: PlayerId;
  readonly lane: LaneId;
  readonly position: Position;
}

export interface NetworkStatus {
  readonly isOnline: boolean;
  readonly roomCode?: string;
  readonly seat?: 'host' | 'guest';
  readonly opponentConnected: boolean;
  readonly pausedForGuest?: boolean;
  readonly onLeaveRoom?: () => void;
}

interface BattleViewProps {
  readonly snapshot: LocalGameSnapshot;
  readonly controller?: LocalGameController;
  readonly onDispatch?: (action: GameAction) => ActionResult | Promise<ActionResult>;
  /** 单人模式下由人类操作的玩家座位；null 表示本地热座（双方都是人）。 */
  readonly humanPlayer?: PlayerId | null;
  readonly networkStatus?: NetworkStatus | null;
  readonly onExit?: () => void;
}

export function BattleView({ snapshot, controller, onDispatch, humanPlayer = null, networkStatus = null, onExit }: BattleViewProps) {
  const state = snapshot.state;
  const actor = state.active_player_id;
  const canAct = !humanPlayer || actor === humanPlayer;
  const isActionPhase = state.phase === 'action';
  const hasPending = state.phase === 'turn_start' && state.turn_start_prepared && state.pending_effect_choices.length > 0;

  const { isMobile, isLandscape } = useViewport();
  const [dismissedOrientationTip, setDismissedOrientationTip] = useState(false);

  // 视角决定：单人/联机模式下 humanPlayer 固定为下方玩家；本地热座模式下，当前行动方 actor 置于下方
  const isHotseat = humanPlayer === null;
  const bottomPlayer: PlayerId = humanPlayer ?? actor;
  const topPlayer: PlayerId = bottomPlayer === 'player_a' ? 'player_b' : 'player_a';

  const [selection, setSelection] = useState<CardInstanceId | null>(null);
  const [hoveredCard, setHoveredCard] = useState<HoveredCardPreview | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<CardInstanceId | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<SlotCoords | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<CardInstanceId | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<SlotCoords | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'surrender' | 'exit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveOnExit = onExit ?? networkStatus?.onLeaveRoom ?? null;
  const surrenderActor: PlayerId = humanPlayer ?? actor;
  const canSurrender = Boolean((controller || onDispatch) && state.phase !== 'finished' && state.phase !== 'mulligan');

  const combatAnim = useCombatAnimations({
    state,
    logHistory: snapshot.logHistory,
    bottomPlayer,
  });
  const activeBeat = combatAnim.activeBeat;
  // 演出进行期间使用 activeBeat.visualState 展示血量/护盾/退场，保证“先轨迹攻击、后扣血结算”
  const displayState = activeBeat?.visualState ?? state;

  const boardGridRef = useRef<HTMLDivElement>(null);
  const slotElRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [boardGeometry, setBoardGeometry] = useState<{
    boardSize: { width: number; height: number };
    slotCenters: Record<string, Point2D>;
  }>({
    boardSize: { width: 0, height: 0 },
    slotCenters: {},
  });

  useLayoutEffect(() => {
    const measure = () => {
      const gridEl = boardGridRef.current;
      if (!gridEl) return;
      const gridRect = gridEl.getBoundingClientRect();
      if (gridRect.width <= 0 || gridRect.height <= 0) return;

      const centers: Record<string, Point2D> = {};
      for (const [key, el] of Object.entries(slotElRefs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        centers[key] = {
          x: rect.left - gridRect.left + rect.width / 2,
          y: rect.top - gridRect.top + rect.height / 2,
        };
      }
      setBoardGeometry({
        boardSize: { width: gridRect.width, height: gridRect.height },
        slotCenters: centers,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeBeat?.id, showLog, showDetail, isMobile, isLandscape]);

  useEffect(() => {
    setSelection(null);
    setHoveredCard(null);
    setHoveredUnitId(null);
    setHoveredSlot(null);
    setDraggingCardId(null);
    setDragOverSlot(null);
  }, [actor]);

  useEffect(() => {
    if (!isMobile) {
      setShowLog(true);
      setShowDetail(true);
      setHoveredCard(null);
    } else {
      setShowLog(false);
      setShowDetail(false);
      setHoveredCard(null);
      setHoveredUnitId(null);
      setHoveredSlot(null);
      setDraggingCardId(null);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  // Esc 键盘取消与清理非模态浮层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setHoveredCard(null);
      setDraggingCardId(null);
      setDragOverSlot(null);
      setHoveredSlot(null);
      setHoveredUnitId(null);
      if (isMobile && (showDetail || showLog)) {
        setShowDetail(false);
        setShowLog(false);
        return;
      }
      setSelection(null);
      setError(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, showDetail, showLog]);

  const legal = useMemo(() => enumerateLegalActions(state, actor), [state, actor]);

  const activeHandCardId = draggingCardId ?? (selection && state.card_instances[selection]?.zone === 'hand' ? selection : null);
  const activeHandDef = activeHandCardId ? cardDefinitionOf(state, activeHandCardId) : undefined;
  const activeHandIsOperator = activeHandDef?.card_type === 'operator';

  const selectedDeployActions = useMemo(
    () =>
      activeHandCardId
        ? legal.filter((action): action is DeployAction => action.type === 'deploy_operator' && action.card_instance_id === activeHandCardId)
        : [],
    [legal, activeHandCardId],
  );
  const selectedPlayActions = useMemo(
    () => (selection ? legal.filter((action): action is PlayCardAction => action.type === 'play_card' && action.card_instance_id === selection) : []),
    [legal, selection],
  );
  const playTargets = useMemo(
    () => new Set(selectedPlayActions.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
    [selectedPlayActions],
  );

  const selectedUnitActions = useMemo(() => {
    if (!selection) {
      return {
        canWithdraw: false,
        canSkillDirect: false,
        skillTargets: new Set<CardInstanceId>(),
        skillCost: null as number | null,
      };
    }
    const canWithdraw = legal.some((action) => action.type === 'withdraw_operator' && action.card_instance_id === selection);
    const skills = legal.filter((action): action is SkillAction => action.type === 'activate_skill' && action.card_instance_id === selection);
    const instance = state.card_instances[selection];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    return {
      canWithdraw,
      canSkillDirect: skills.some((action) => action.target_instance_id === undefined),
      skillTargets: new Set(skills.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
      skillCost: definition?.active_skill_sp_cost ?? null,
    };
  }, [legal, selection, state]);

  const pendingResolves = useMemo(
    () => (hasPending ? legal.filter((action): action is PendingResolveAction => action.type === 'resolve_pending_choice') : []),
    [legal, hasPending],
  );
  const pendingTargets = useMemo(
    () => new Set(pendingResolves.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
    [pendingResolves],
  );
  const canSkipPending = pendingResolves.some((action) => action.target_instance_id === undefined);

  const boardMap = useMemo(() => {
    const map = new Map<string, CardInstance>();
    for (const instance of Object.values(displayState.card_instances)) {
      if (instance.zone === 'board' && instance.board_half && instance.lane && instance.position) {
        map.set(`${instance.board_half}:${instance.lane}:${instance.position}`, instance);
      }
    }
    return map;
  }, [displayState.card_instances]);

  // 攻击范围与目标锁定预览
  const attackPreview = useMemo(() => {
    const targetSlot = dragOverSlot ?? hoveredSlot;
    if (
      activeHandCardId &&
      activeHandIsOperator &&
      targetSlot &&
      targetSlot.half === actor &&
      selectedDeployActions.some((a) => a.lane === targetSlot.lane && a.position === targetSlot.position)
    ) {
      return previewAttackTargets(state, {
        kind: 'draft',
        cardInstanceId: activeHandCardId,
        controllerId: actor,
        lane: targetSlot.lane,
        position: targetSlot.position,
      });
    }

    const focusUnitId = hoveredUnitId ?? (selection && state.card_instances[selection]?.zone === 'board' ? selection : null);
    if (focusUnitId) {
      const unit = state.card_instances[focusUnitId];
      if (unit && unit.zone === 'board') {
        return previewAttackTargets(state, { kind: 'unit', instance: unit });
      }
    }

    return null;
  }, [activeHandCardId, activeHandIsOperator, actor, dragOverSlot, hoveredSlot, hoveredUnitId, selectedDeployActions, selection, state]);

  const dispatch = async (action: GameAction, actorOverride: PlayerId = actor) => {
    if (combatAnim.isPlaying) {
      combatAnim.skipAll();
    }
    try {
      const result = onDispatch ? await onDispatch(action) : controller?.dispatch(actorOverride, action);
      if (result && !result.ok) {
        setError(result.reason ?? '操作不合法');
      } else {
        setSelection(null);
        setHoveredCard(null);
        setHoveredSlot(null);
        setDragOverSlot(null);
        setDraggingCardId(null);
        if (isMobile) setShowDetail(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行操作异常');
    }
  };

  const clearNonModalSelection = () => {
    setSelection(null);
    setHoveredCard(null);
    setHoveredSlot(null);
    setHoveredUnitId(null);
  };

  const onSlotClick = (half: PlayerId, lane: LaneId, position: Position) => {
    if (!canAct) {
      if (selection) setError('当前不是你的行动回合。');
      return;
    }
    if (hasPending) {
      setError('请先完成回合开始的 SP 支援选择。');
      return;
    }
    if (!isActionPhase) {
      if (selection) setError('只有行动阶段可以执行部署操作。');
      return;
    }

    const action = selectedDeployActions.find((candidate) => candidate.lane === lane && candidate.position === position);
    if (action) {
      dispatch(action);
      return;
    }

    if (selection) {
      const selectedInst = state.card_instances[selection];
      const selectedDef = cardDefinitionOf(state, selection);
      if (selectedInst?.zone === 'hand' && selectedDef) {
        if (selectedDef.card_type === 'operator') {
          const reason = getInvalidDeployReason(state, actor, selection, half, lane, position);
          if (reason) setError(reason);
        } else {
          setError('战术或支援卡请点击高亮作用单位，或使用「直接使用」按钮。');
        }
      }
    }
  };

  const onUnitClick = (instance: CardInstance) => {
    if (!canAct) {
      setSelection(instance.card_instance_id);
      return;
    }
    const targetId = instance.card_instance_id;

    if (hasPending) {
      const pendingAction = pendingResolves.find((candidate) => candidate.target_instance_id === targetId);
      if (pendingAction) {
        dispatch(pendingAction);
      } else {
        setError('SP 支援必须选择尚未满 SP 且未冻结的友方干员。');
      }
      return;
    }

    if (selection && playTargets.has(targetId)) {
      const action = selectedPlayActions.find((candidate) => candidate.target_instance_id === targetId);
      if (action) {
        dispatch(action);
        return;
      }
    }

    if (selection && selectedUnitActions.skillTargets.has(targetId)) {
      const action = legal.find(
        (candidate): candidate is SkillAction =>
          candidate.type === 'activate_skill' && candidate.card_instance_id === selection && candidate.target_instance_id === targetId,
      );
      if (action) {
        dispatch(action);
        return;
      }
    }

    if (selection === targetId) {
      setSelection(null);
      if (isMobile) setShowDetail(false);
    } else {
      setSelection(targetId);
    }
  };

  const onHandCardClick = (id: CardInstanceId) => {
    setHoveredCard(null);
    if (!canAct) {
      setError('当前不是你的行动回合。');
      return;
    }
    if (hasPending) {
      setError('请先完成回合开始的支援选择。');
      return;
    }
    if (!isActionPhase) {
      setError('当前不在行动阶段，无法使用手牌。');
      return;
    }

    if (selection === id) {
      setSelection(null);
      if (isMobile) setShowDetail(false);
      return;
    }

    setSelection(id);
    const reason = getInvalidCardReason(state, actor, id);
    if (reason) {
      setError(reason);
    }
  };

  const handleQuickSkillClick = () => {
    if (!selection) return;
    if (selectedUnitActions.canSkillDirect) {
      const action = legal.find(
        (a): a is SkillAction => a.type === 'activate_skill' && a.card_instance_id === selection && a.target_instance_id === undefined,
      );
      if (action) {
        dispatch(action);
        return;
      }
    }
    if (selectedUnitActions.skillTargets.size > 0) {
      setError('请直接点击棋盘上青色脉冲高亮的目标单位发动技能。');
      return;
    }
    const reason = getInvalidUnitActionReason(state, actor, selection, 'activate_skill');
    setError(reason ?? '当前无法发动主动技能。');
  };

  const handleQuickWithdrawClick = () => {
    if (!selection) return;
    const action = legal.find(
      (a): a is WithdrawAction => a.type === 'withdraw_operator' && a.card_instance_id === selection,
    );
    if (action) {
      dispatch(action);
      return;
    }
    const reason = getInvalidUnitActionReason(state, actor, selection, 'withdraw_operator');
    setError(reason ?? '当前无法撤离该干员。');
  };

  const selectedInstance = selection ? state.card_instances[selection] : undefined;
  const selectedDefinition = selection ? cardDefinitionOf(state, selection) : undefined;
  const hoveredCardInvalidReason = useMemo(() => {
    if (!hoveredCard || !isActionPhase || hasPending || !canAct || bottomPlayer !== actor) return null;
    return getInvalidCardReason(state, actor, hoveredCard.instanceId);
  }, [actor, bottomPlayer, canAct, hasPending, hoveredCard, isActionPhase, state]);

  const attackPreviewTargetName = attackPreview?.primaryTargetId
    ? cardDefinitionOf(state, attackPreview.primaryTargetId)?.card_name_zh ?? attackPreview.primaryTargetId
    : null;

  const renderSlot = (half: PlayerId, lane: LaneId, position: Position) => {
    const slotKey = makeSlotKey(half, lane, position);
    const key = slotKey;
    const instance = boardMap.get(key);
    const isDeployTarget =
      half === actor &&
      isActionPhase &&
      canAct &&
      !hasPending &&
      selectedDeployActions.some((action) => action.lane === lane && action.position === position);
    const isEnemy = half === topPlayer;
    const posName = isEnemy ? (position === 'front' ? '敌前锋' : '敌后排') : position === 'front' ? '我前锋' : '我后卫';

    const isSlotHovered =
      (hoveredSlot?.half === half && hoveredSlot.lane === lane && hoveredSlot.position === position) ||
      (dragOverSlot?.half === half && dragOverSlot.lane === lane && dragOverSlot.position === position);

    const isAttackLaneCell = Boolean(
      attackPreview?.laneSlots.some(
        (slot) => slot.half === half && slot.lane === lane && slot.position === position,
      ),
    );

    const slotPopups = activeBeat?.floatingPopups.filter((p) => p.slotKey === slotKey) ?? [];
    const slotGhost = activeBeat?.ghostCues.find((g) => g.slotKey === slotKey);
    const isDeployedSlot = Boolean(activeBeat?.deployedSlots.includes(slotKey));

    if (!instance) {
      const slotInvalidReason =
        isSlotHovered && !isDeployTarget && activeHandCardId && activeHandIsOperator && isActionPhase && canAct && !hasPending
          ? getInvalidDeployReason(state, actor, activeHandCardId, half, lane, position)
          : null;

      return (
        <div
          key={key}
          ref={(el) => {
            slotElRefs.current[slotKey] = el;
          }}
          role="button"
          tabIndex={isDeployTarget ? 0 : -1}
          aria-label={`${LANE_LABEL[lane]}${posName}${isDeployTarget ? ' 可部署' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSlotClick(half, lane, position);
          }}
          onKeyDown={(e) => {
            if (!isDeployTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onSlotClick(half, lane, position);
            }
          }}
          onMouseEnter={() => {
            if (!isMobile) setHoveredSlot({ half, lane, position });
          }}
          onMouseLeave={() => {
            setHoveredSlot((prev) =>
              prev && prev.half === half && prev.lane === lane && prev.position === position ? null : prev,
            );
          }}
          onDragOver={(e) => {
            if (!draggingCardId || !isActionPhase || !canAct || hasPending) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = isDeployTarget ? 'move' : 'none';
            setDragOverSlot({ half, lane, position });
          }}
          onDragLeave={() => {
            setDragOverSlot((prev) =>
              prev && prev.half === half && prev.lane === lane && prev.position === position ? null : prev,
            );
          }}
          onDrop={(e) => {
            if (!draggingCardId) return;
            e.preventDefault();
            e.stopPropagation();
            const cardId = draggingCardId;
            setDragOverSlot(null);
            setDraggingCardId(null);
            if (!isActionPhase || !canAct || hasPending) return;
            const action = legal.find(
              (a): a is DeployAction =>
                a.type === 'deploy_operator' &&
                a.card_instance_id === cardId &&
                a.lane === lane &&
                a.position === position,
            );
            if (action) {
              dispatch(action);
            } else {
              const reason = getInvalidDeployReason(state, actor, cardId, half, lane, position);
              if (reason) setError(reason);
            }
          }}
          className={`relative flex items-center justify-center h-[66px] sm:h-[74px] lg:h-[82px] border transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            isDeployTarget
              ? isSlotHovered
                ? 'border-[#f59e0b] bg-amber-500/35 ring-2 ring-[#f59e0b] shadow-[0_0_16px_rgba(245,158,11,0.55)] cursor-pointer'
                : 'border-[#e5a52b] bg-amber-500/20 ring-2 ring-[#e5a52b]/60 shadow-[0_0_12px_rgba(229,165,43,0.4)] cursor-pointer animate-pulse'
              : slotInvalidReason
                ? 'border-rose-500/70 bg-rose-950/35 cursor-not-allowed'
                : isAttackLaneCell
                  ? 'border-rose-500/60 bg-rose-950/25 ring-1 ring-rose-500/40'
                  : isEnemy
                    ? 'border-dashed border-rose-900/40 bg-[#160f12]/50 hover:border-rose-700/60 hover:bg-[#1f1418]'
                    : 'border-dashed border-sky-900/40 bg-[#0d141d]/50 hover:border-sky-700/60 hover:bg-[#131e2b]'
          }`}
          style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
        >
          {isDeployTarget ? (
            <div className="flex flex-col items-center gap-0.5 text-[#e5a52b] font-bold text-[11px] sm:text-xs tracking-wider text-center px-1">
              <span>
                {isSlotHovered && activeHandDef
                  ? `✓ 部署 ${activeHandDef.card_name_zh}`
                  : '+ 部署'}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono">
                {isSlotHovered && activeHandDef ? `-${activeHandDef.cost} DP · ${posName}` : `(${posName})`}
              </span>
            </div>
          ) : slotInvalidReason ? (
            <div className="flex flex-col items-center gap-0.5 text-rose-300 font-bold text-[10px] text-center px-1">
              <span>✕ 不可部署</span>
              <span className="text-[9px] font-normal text-rose-200/90 line-clamp-1">{slotInvalidReason}</span>
            </div>
          ) : isAttackLaneCell ? (
            <div className="flex flex-col items-center gap-0.5 text-rose-300/85 font-mono text-[9px] sm:text-[10px]">
              <span>⚔ 攻击航道</span>
              <span className="text-[8px] text-rose-400/75">{posName}</span>
            </div>
          ) : (
            <span className={`text-[9px] sm:text-[10px] font-mono tracking-wider ${isEnemy ? 'text-rose-400/60' : 'text-sky-400/60'}`}>
              {posName}
            </span>
          )}

          {/* Phase 6: 阵亡 / 撤离残影徽标与致死伤害跳字（零阻挡指针事件） */}
          {!combatAnim.effectiveDisabled && slotGhost && (
            <div
              aria-hidden="true"
              className={`absolute inset-1 flex items-center justify-center border pointer-events-none z-30 anim-ghost-fade ${
                slotGhost.kind === 'defeat'
                  ? 'bg-rose-950/85 border-rose-500/80 text-rose-200'
                  : 'bg-emerald-950/85 border-emerald-500/80 text-emerald-200'
              }`}
            >
              <span className="font-mono font-bold text-[10px] px-1 truncate">
                {slotGhost.kind === 'defeat' ? `💀 ${slotGhost.name} 退场` : `🏃 ${slotGhost.name} 撤离`}
              </span>
            </div>
          )}

          {!combatAnim.effectiveDisabled && slotPopups.length > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 -top-1 flex flex-col items-center gap-0.5 pointer-events-none z-40"
            >
              {slotPopups.slice(0, 2).map((popup) => (
                <span
                  key={popup.id}
                  className={`px-1.5 py-0.2 border font-mono font-black text-[11px] leading-tight whitespace-nowrap anim-float-number ${SLOT_POPUP_STYLE[popup.kind]}`}
                >
                  {popup.label}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    let highlight: UnitHighlight = 'none';
    if (
      pendingTargets.has(instance.card_instance_id) ||
      playTargets.has(instance.card_instance_id) ||
      selectedUnitActions.skillTargets.has(instance.card_instance_id)
    ) {
      highlight = 'target';
    } else if (selection === instance.card_instance_id) {
      highlight = 'selected';
    } else if (attackPreview?.primaryTargetId === instance.card_instance_id) {
      highlight = 'attack_target';
    }

    const unitAnimState: UnitAnimationState = {
      deployed: Boolean(activeBeat?.deployedUnits[instance.card_instance_id] || isDeployedSlot),
      hit: Boolean(activeBeat?.hitUnits[instance.card_instance_id]),
      attackDirection: activeBeat?.attackingUnits[instance.card_instance_id] ?? null,
      skillFlash: Boolean(activeBeat?.skillUnits[instance.card_instance_id]),
      floatingPopups: slotPopups,
      disableMotion: combatAnim.effectiveDisabled,
    };

    return (
      <div
        key={instance.card_instance_id}
        ref={(el) => {
          slotElRefs.current[slotKey] = el;
        }}
        className="relative"
      >
        <UnitView
          state={displayState}
          instance={instance}
          highlight={highlight}
          animState={unitAnimState}
          onClick={() => onUnitClick(instance)}
          onLongPress={() => {
            setSelection(instance.card_instance_id);
            setShowDetail(true);
          }}
          onHoverStart={() => {
            if (!isMobile) setHoveredUnitId(instance.card_instance_id);
          }}
          onHoverEnd={() => {
            setHoveredUnitId((prev) => (prev === instance.card_instance_id ? null : prev));
          }}
        />
        {!combatAnim.effectiveDisabled && isDeployedSlot && (
          <div
            aria-hidden="true"
            className="absolute inset-0 border-2 border-[#e5a52b] pointer-events-none z-30 anim-slot-flash"
          />
        )}
      </div>
    );
  };

  const canQuickActOnSelectedUnit = Boolean(
    selectedInstance?.zone === 'board' &&
      selectedInstance.controller_id === actor &&
      isActionPhase &&
      canAct &&
      !hasPending,
  );

  const selectionPromptContent =
    selectedInstance || attackPreview ? (
      <>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-1.5 h-3.5 bg-[#e5a52b] shrink-0" />
          {selectedInstance ? (
            <span className="truncate text-[11px] sm:text-xs">
              <strong>{selectedDefinition?.card_name_zh}</strong>
              {selectedInstance.zone === 'hand' ? (
                selectedDeployActions.length > 0 ? (
                  <span className="text-slate-200">
                    {' '}· 点击或拖放至高亮黄色格子部署（{selectedDefinition?.cost ?? 0} DP）
                  </span>
                ) : selectedPlayActions.length > 0 ? (
                  <span className="text-cyan-300"> · 点击青色高亮目标或右侧直接使用</span>
                ) : (
                  <span className="text-rose-300">
                    {' '}· {getInvalidCardReason(state, actor, selectedInstance.card_instance_id) ?? '当前无法使用'}
                  </span>
                )
              ) : attackPreview ? (
                <span className="text-slate-200">
                  {' '}· ⚔ 预计攻击：
                  {attackPreviewTargetName ? (
                    <strong className="text-rose-300">
                      {attackPreview.tauntBlocked ? `【${attackPreviewTargetName}】(嘲讽)` : `【${attackPreviewTargetName}】`}
                    </strong>
                  ) : (
                    <strong className="text-rose-300">对方基地</strong>
                  )}
                  {attackPreview.cannotAttackReason && (
                    <span className="text-slate-400 ml-1.5">({attackPreview.cannotAttackReason})</span>
                  )}
                </span>
              ) : (
                <span className="text-slate-300"> · 战场编队干员</span>
              )}
            </span>
          ) : (
            attackPreview && (
              <span className="truncate text-[11px] sm:text-xs text-slate-200">
                ⚔ 索敌预演：
                {attackPreviewTargetName ? (
                  <strong className="text-rose-300">
                    {attackPreview.tauntBlocked ? `【${attackPreviewTargetName}】(嘲讽拦截)` : `【${attackPreviewTargetName}】`}
                  </strong>
                ) : (
                  <strong className="text-rose-300">对方基地</strong>
                )}
                {attackPreview.cannotAttackReason && (
                  <span className="text-slate-400 ml-1.5">· {attackPreview.cannotAttackReason}</span>
                )}
              </span>
            )
          )}
        </div>

        {selectedInstance && (
          <div className="flex items-center gap-1.5 shrink-0">
            {canQuickActOnSelectedUnit && selectedDefinition?.effect_trigger === 'active' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleQuickSkillClick}
                className="px-2 py-0.5 text-[10px] min-h-[26px]"
              >
                ⚡ 技能
              </Button>
            )}
            {canQuickActOnSelectedUnit && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleQuickWithdrawClick}
                className="px-2 py-0.5 text-[10px] min-h-[26px]"
              >
                ↩ 撤离
              </Button>
            )}
            {isMobile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDetail(true)}
                className="px-2 py-0.5 text-[10px] min-h-[26px]"
              >
                详情档案
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelection(null)}
              className="text-slate-400 hover:text-white px-1.5 py-0.5 text-[10px] min-h-[26px]"
            >
              ✕ 取消
            </Button>
          </div>
        )}
      </>
    ) : null;

  return (
    <div
      className="grid grid-rows-[auto_auto_minmax(0,1fr)] h-[100dvh] w-full bg-[#0d1016] text-[#e8e9e6] font-sans overflow-hidden select-none"
      style={{ '--combat-anim-scale': String(combatAnim.cssAnimScale) } as React.CSSProperties}
    >
      {/* 1. 顶部敌方阵地与战局控制 HUD */}
      <TacticalBattleHud
        state={displayState}
        actor={actor}
        bottomPlayer={bottomPlayer}
        topPlayer={topPlayer}
        hasPending={hasPending}
        isHotseat={isHotseat}
        networkStatus={networkStatus}
        seed={controller?.getSetup().seed}
        showLog={showLog}
        onToggleLog={() => setShowLog((prev) => !prev)}
        showDetail={showDetail}
        onToggleDetail={() => setShowDetail((prev) => !prev)}
        onSurrender={canSurrender ? () => setConfirmDialog('surrender') : undefined}
        onExit={effectiveOnExit ? () => setConfirmDialog('exit') : undefined}
        animSpeedMode={combatAnim.speedMode}
        onCycleAnimSpeed={combatAnim.cycleSpeedMode}
        enemyBaseDamageDelta={activeBeat?.baseDamage.enemy ?? null}
        disableMotion={combatAnim.effectiveDisabled}
      />

      {/* 2. 系统提示与待决响应横幅区（无提示时自动折叠为 0px） */}
      <div className="shrink-0">
        {isMobile && !isLandscape && !dismissedOrientationTip && (
          <div className="px-3 py-1 bg-sky-950/90 border-b border-sky-500/40 text-sky-300 text-[11px] flex items-center justify-between z-20">
            <span>💡 提示：将手机横屏可获得更宽阔的战术交锋视野</span>
            <button
              type="button"
              onClick={() => setDismissedOrientationTip(true)}
              className="text-slate-400 hover:text-white px-1.5 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {networkStatus?.pausedForGuest && (
          <div className="px-4 py-1.5 bg-amber-950/90 border-b border-amber-500/60 text-amber-300 text-xs flex items-center justify-center gap-2">
            <span>⏸️ 访客网络已断开，对局已自动暂停，等待重连（宽限期 120 秒）…</span>
          </div>
        )}

        {hasPending && (
          <div className="px-3 sm:px-4 py-1.5 bg-[#1a2332] border-b border-[#3b4c66] flex items-center justify-between text-xs text-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-cyan-400" />
              <span className="text-[11px] sm:text-xs">回合开始支援：点击青色高亮友方干员充能 SP</span>
            </div>
            {canSkipPending && canAct && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  dispatch({
                    type: 'resolve_pending_choice',
                    source_instance_id: state.pending_effect_choices[0]?.source_instance_id ?? '',
                  })
                }
                className="text-[11px] px-2 py-0.5"
              >
                跳过充能
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 3. 核心三栏桌面工作区 / 移动端自适应战场 */}
      <div className="flex min-h-0 overflow-hidden relative">
        {!isMobile && showLog && (
          <aside className="w-80 border-r border-[#242e3d] bg-[#121620] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
            <Panel
              variant="default"
              title={`战斗日志 (${snapshot.logHistory.length})`}
              codeName="SYS.LOG"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setShowLog(false)} className="px-1.5 py-0 text-[10px]">
                  ◀ 收起
                </Button>
              }
              className="flex-1 border-0 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto p-2">
                <LogView history={snapshot.logHistory} state={snapshot.state} />
              </div>
            </Panel>
          </aside>
        )}

        {/* 中栏：CSS Grid 战场主舞台 + 整合手牌指挥托盘（点击空白区域取消选中） */}
        <main
          className="relative flex-1 min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_auto] bg-[#0a0d12] overflow-hidden"
          onClick={clearNonModalSelection}
        >
          {/* 非阻塞回合切换横幅 & 多段演出快捷跳过 */}
          {!combatAnim.effectiveDisabled && activeBeat?.turnBanner && (
            <div
              key={activeBeat.turnBanner.id}
              aria-live="polite"
              className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 bg-[#121923]/95 border border-[#e5a52b] shadow-[0_6px_24px_rgba(0,0,0,0.65)] flex items-center gap-2 anim-turn-banner"
              style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
            >
              <span className="w-1.5 h-3.5 bg-[#e5a52b]" />
              <span className="font-mono font-black text-xs sm:text-sm tracking-wider text-white whitespace-nowrap">
                T{String(activeBeat.turnBanner.turnNumber).padStart(2, '0')} ·{' '}
                {isHotseat
                  ? activeBeat.turnBanner.actor === 'player_a'
                    ? '玩家 A 行动'
                    : '玩家 B 行动'
                  : activeBeat.turnBanner.actor === bottomPlayer
                    ? '我方行动阶段'
                    : '敌方行动阶段'}
              </span>
            </div>
          )}

          {combatAnim.isPlaying && combatAnim.remainingQueueCount > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                combatAnim.skipAll();
              }}
              className="absolute top-2 right-3 z-40 px-2.5 py-1 bg-[#18202c]/95 hover:bg-[#222d3d] border border-amber-500/60 text-amber-300 font-mono font-bold text-[11px] cursor-pointer shadow-md"
              title="立即跳过余下战斗演出"
            >
              ⏭ 跳过演出 ({combatAnim.remainingQueueCount})
            </button>
          )}

          {/* 中央三路交锋推演棋盘（短屏/横屏下可平稳滚动，绝不被底部托盘遮挡） */}
          <div className="relative min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center px-1.5 sm:px-4 py-1.5 sm:py-2">
            <div ref={boardGridRef} className="relative my-auto w-full max-w-4xl">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 w-full">
                {LANES.map((lane) => {
                  const isDirectBaseLane = Boolean(attackPreview?.attacksBase && attackPreview.lane === lane);
                  const laneStrike = activeBeat?.laneStrikes.find((s) => s.lane === lane || s.targetLane === lane);
                  return (
                    <div
                      key={lane}
                      className={`relative flex flex-col bg-[#11161f] border overflow-hidden shadow-md transition-colors duration-150 ${
                        laneStrike
                          ? laneStrike.toBase
                            ? 'border-rose-500/80'
                            : laneStrike.kind === 'skill'
                              ? 'border-cyan-400/80'
                              : 'border-amber-500/75'
                          : 'border-[#263140]'
                      }`}
                      style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
                    >
                      {/* 航道路口标头 */}
                      <div className="px-2 py-0.5 sm:py-1 bg-[#151b24] border-b border-[#242f3d] flex items-center justify-between text-xs">
                        <span className="font-bold text-white tracking-wide text-[11px] sm:text-xs">{LANE_LABEL[lane]}</span>
                        {isDirectBaseLane ? (
                          <span className="text-[9px] font-mono font-bold text-rose-300 bg-rose-950/90 border border-rose-500/60 px-1">
                            ⚔ 直击基地
                          </span>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            {lane}
                          </span>
                        )}
                      </div>

                      {/* 敌方战区 (上方后排 + 前排) */}
                      <div className="px-1.5 py-0.2 sm:py-0.5 bg-rose-950/40 border-b border-rose-900/40 flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-rose-300">
                        <span>{isHotseat ? (topPlayer === 'player_a' ? '🔴 玩家 A 防线' : '🔴 玩家 B 防线') : '🔴 敌方战区'}</span>
                        <span className="text-[8px] sm:text-[9px] text-rose-400/80">后排/前锋</span>
                      </div>
                      <div className={`p-1 sm:p-1.5 space-y-1 bg-[#180e12]/60 border-b border-rose-900/30 ${actor === topPlayer ? 'bg-rose-950/20' : ''}`}>
                        {renderSlot(topPlayer, lane, 'back')}
                        {renderSlot(topPlayer, lane, 'front')}
                      </div>

                      {/* 三路阻挡与交锋核心线 */}
                      <div className="relative py-0.5 sm:py-1 px-2 bg-[#0f131a] border-y border-[#2d3848] flex items-center justify-center gap-1.5 select-none">
                        <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[#e5a52b] tracking-wider flex items-center gap-1">
                          <span>⚔</span>
                          <span>{isDirectBaseLane ? '无阻挡直击' : '交锋阻挡'}</span>
                        </span>
                        <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                      </div>

                      {/* 己方战区 (下方前排 + 后排) */}
                      <div className={`p-1 sm:p-1.5 space-y-1 bg-[#0b131d]/60 ${actor === bottomPlayer ? 'bg-sky-950/20' : ''}`}>
                        {renderSlot(bottomPlayer, lane, 'front')}
                        {renderSlot(bottomPlayer, lane, 'back')}
                      </div>
                      <div className="px-1.5 py-0.2 sm:py-0.5 bg-sky-950/40 border-t border-sky-900/40 flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-sky-300">
                        <span>{isHotseat ? (bottomPlayer === 'player_a' ? '🔵 玩家 A 防线' : '🔵 玩家 B 防线') : '🔵 我方防线'}</span>
                        <span className="text-[8px] sm:text-[9px] text-sky-400/80">前锋/后卫</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 全棋盘矢量攻击轨迹与锁定准星覆盖层 */}
              <AttackPathOverlay
                strikes={activeBeat?.laneStrikes ?? []}
                bottomPlayer={bottomPlayer}
                topPlayer={topPlayer}
                slotCenters={boardGeometry.slotCenters}
                boardSize={boardGeometry.boardSize}
                cssAnimScale={combatAnim.cssAnimScale}
                disableMotion={combatAnim.effectiveDisabled}
              />
            </div>
          </div>

          {/* 底部统一己方指挥面板与手牌托盘 */}
          <PlayerHandDock
            state={displayState}
            bottomPlayer={bottomPlayer}
            actor={actor}
            canAct={canAct}
            isActionPhase={isActionPhase}
            hasPending={hasPending}
            isHotseat={isHotseat}
            isMobile={isMobile}
            isLandscape={isLandscape}
            selection={selection}
            draggingCardId={draggingCardId}
            allyBaseDamageDelta={activeBeat?.baseDamage.ally ?? null}
            disableMotion={combatAnim.effectiveDisabled}
            selectionPrompt={selectionPromptContent}
            onHandCardClick={onHandCardClick}
            onLongPressCard={(id) => {
              setSelection(id);
              setShowDetail(true);
            }}
            onHoverCard={(preview) => {
              if (preview) {
                setHoveredCard(preview);
              } else {
                setHoveredCard(null);
              }
            }}
            onDragStartCard={(id, e) => {
              setHoveredCard(null);
              setDraggingCardId(id);
              setSelection(id);
              e.dataTransfer.setData('text/plain', id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEndCard={() => {
              setDraggingCardId(null);
              setDragOverSlot(null);
            }}
            onEndActionPhase={() => dispatch({ type: 'end_action_phase' })}
          />
        </main>

        {!isMobile && showDetail && (
          <aside className="w-80 border-l border-[#242e3d] bg-[#121620] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
            <TacticalDetailPanel
              state={state}
              selection={selection}
              onDeselect={() => setSelection(null)}
              canAct={canAct}
              isActionPhase={isActionPhase}
              hasPending={hasPending}
              legalActions={legal}
              onDispatch={dispatch}
              className="flex-1"
            />
          </aside>
        )}
      </div>

      {/* 桌面端悬停卡牌预览浮层 (独立 fixed 图层，绝不撑开页面) */}
      {!isMobile && !draggingCardId && (
        <CardPreviewPopover
          state={state}
          hovered={hoveredCard}
          invalidReason={hoveredCardInvalidReason}
        />
      )}

      {/* 5. 移动端独立底部抽屉：战斗日志 */}
      {isMobile && (
        <BottomSheet
          isOpen={showLog}
          onClose={() => setShowLog(false)}
          title={`战斗日志 (${snapshot.logHistory.length})`}
          codeName="SYS.LOG"
          maxHeight="max-h-[85vh]"
        >
          <div className="p-3 overflow-y-auto max-h-[70vh]">
            <LogView history={snapshot.logHistory} state={snapshot.state} />
          </div>
        </BottomSheet>
      )}

      {/* 6. 移动端独立底部抽屉：干员战术详情与指令操作 */}
      {isMobile && (
        <BottomSheet
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          title="战术单位指令与档案"
          codeName={selectedInstance?.card_id ?? 'SYS.DOSSIER'}
          maxHeight="max-h-[85vh]"
        >
          <div className="p-2 overflow-y-auto max-h-[70vh]">
            <TacticalDetailPanel
              state={state}
              selection={selection}
              onDeselect={() => {
                setSelection(null);
                setShowDetail(false);
              }}
              canAct={canAct}
              isActionPhase={isActionPhase}
              hasPending={hasPending}
              legalActions={legal}
              onDispatch={dispatch}
            />
          </div>
        </BottomSheet>
      )}

      {/* 7. 投降二次确认弹窗 */}
      <Modal
        isOpen={confirmDialog === 'surrender'}
        onClose={() => setConfirmDialog(null)}
        title="确认投降"
        codeName="SYS.SURRENDER"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDialog(null)}>
              继续作战
            </Button>
            <Button
              variant="danger"
              size="sm"
              cornerCut
              onClick={() => {
                setConfirmDialog(null);
                void dispatch({ type: 'surrender' }, surrenderActor);
              }}
            >
              确认投降
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
          <p className="m-0">
            {isHotseat
              ? `当前行动方【${PLAYER_LABEL[surrenderActor]}】将宣告撤退，直接判定对方获胜并进入战后结算页面。`
              : '宣告撤退将直接判定我方战败，并立即进入作战结算报告。'}
          </p>
          <p className="m-0 text-slate-400">该操作不可撤销，请确认是否立即结束推演。</p>
        </div>
      </Modal>

      {/* 9. 退出对局二次确认弹窗 */}
      <Modal
        isOpen={confirmDialog === 'exit'}
        onClose={() => setConfirmDialog(null)}
        title="确认退出对局"
        codeName="SYS.EXIT"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDialog(null)}>
              继续作战
            </Button>
            <Button
              variant="danger"
              size="sm"
              cornerCut
              onClick={() => {
                setConfirmDialog(null);
                effectiveOnExit?.();
              }}
            >
              确认退出
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
          <p className="m-0">
            退出将立即中止当前对局并返回主菜单，不会保留当前战局进度或发放战后奖励。
          </p>
          {canSurrender && (
            <p className="m-0 text-slate-400">如需认输并查看战报结算，请使用「投降」功能。</p>
          )}
        </div>
      </Modal>

      {/* 10. 浮动错误提示 */}
      {error && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-rose-950/95 border border-rose-500 text-rose-100 text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-[90vw]"
        >
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-2 text-rose-300 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

