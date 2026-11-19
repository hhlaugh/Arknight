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
import { CardTouchDragOverlay } from '../components/battle/CardTouchDragOverlay';
import { TacticalBoardViewport } from '../components/battle/TacticalBoardViewport';
import battlefieldArenaSurface from '../assets/images/battlefield_arena_surface_1795044169209.jpg';
import deployPadAllyArt from '../assets/images/deploy_pad_ally_1795070691439.jpg';
import deployPadEnemyArt from '../assets/images/deploy_pad_enemy_1795070690125.jpg';
import titaniumHudSurface from '../assets/images/titanium_hud_surface_1795070730280.jpg';
import {
  computeTouchAimPoint,
  detectTouchDragIntent,
  resolveTouchDropTarget,
  type TouchDragLayoutMode,
  type TouchDragSlotCandidate,
  type TouchDropResolution,
} from '../components/battle/touchDrag';
import {
  getInvalidCardReason,
  getInvalidDeployReason,
  getInvalidUnitActionReason,
  previewAttackTargets,
} from '../components/battle/tacticalSelectors';
import {
  makeSlotKey,
  type FloatingPopupKind,
  type SlotKey,
  type UnitAnimationState,
} from '../components/battle/combatPresentation';
import { enumerateLegalActions } from '../game/legal-actions';
import { useCombatAnimations } from '../hooks/useCombatAnimations';
import { triggerHaptic, type PointerPosition } from '../hooks/useLongPress';
import { useViewport } from '../hooks/useViewport';
import { useAppSettings } from '../data/app-settings';
import { playTacticalSfx } from '../audio/bgmPlayer';
import { playCombatSfx } from '../audio/combatSfx';
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

interface TouchDragState {
  readonly cardId: CardInstanceId;
  readonly pointerId: number;
  readonly pointer: PointerPosition;
  readonly aimPoint: PointerPosition;
  readonly resolution: TouchDropResolution;
  readonly statusText: string;
  readonly layoutMode: TouchDragLayoutMode;
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
  readonly onOpenSettings?: () => void;
}

export function BattleView({ snapshot, controller, onDispatch, humanPlayer = null, networkStatus = null, onExit, onOpenSettings }: BattleViewProps) {
  const state = snapshot.state;
  const actor = state.active_player_id;
  const canAct = !humanPlayer || actor === humanPlayer;
  const isActionPhase = state.phase === 'action';
  const hasPending = state.phase === 'turn_start' && state.turn_start_prepared && state.pending_effect_choices.length > 0;

  const { width, height, isMobile, isPhone, isLandscape, isShortViewport, isCompactLandscape } = useViewport();
  const useCompactBoard = isCompactLandscape || (isPhone && isShortViewport) || isShortViewport;
  const useSideRail = isCompactLandscape;

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
  const [touchDragState, setTouchDragState] = useState<TouchDragState | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'surrender' | 'exit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const touchCandidateRef = useRef<{
    cardId: CardInstanceId;
    pointerId: number;
    start: PointerPosition;
    layoutMode: TouchDragLayoutMode;
    active: boolean;
  } | null>(null);
  const touchCleanupRef = useRef<(() => void) | null>(null);
  const justFinishedTouchDragAtRef = useRef(0);
  const lastSnappedSlotKeyRef = useRef<SlotKey | null>(null);

  const effectiveOnExit = onExit ?? networkStatus?.onLeaveRoom ?? null;
  const surrenderActor: PlayerId = humanPlayer ?? actor;
  const canSurrender = Boolean((controller || onDispatch) && state.phase !== 'finished' && state.phase !== 'mulligan');
  const appSettings = useAppSettings();

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
  const [boardScale, setBoardScale] = useState(1);
  const boardScaleRef = useRef(1);
  boardScaleRef.current = boardScale;

  const [slotTapCue, setSlotTapCue] = useState<{
    readonly slotKey: SlotKey;
    readonly kind: 'tap' | 'skill' | 'deploy';
    readonly seq: number;
  } | null>(null);
  const tapCueSeqRef = useRef(0);
  const tapCueTimerRef = useRef<number | null>(null);

  const triggerSlotCue = (slotKey: SlotKey, kind: 'tap' | 'skill' | 'deploy') => {
    tapCueSeqRef.current += 1;
    const seq = tapCueSeqRef.current;
    setSlotTapCue({ slotKey, kind, seq });
    if (tapCueTimerRef.current !== null) {
      window.clearTimeout(tapCueTimerRef.current);
    }
    tapCueTimerRef.current = window.setTimeout(() => {
      setSlotTapCue((prev) => (prev && prev.seq === seq ? null : prev));
    }, 460);
  };

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

      const scale = Math.max(0.1, boardScaleRef.current);
      const centers: Record<string, Point2D> = {};
      for (const [key, el] of Object.entries(slotElRefs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        centers[key] = {
          x: (rect.left - gridRect.left + rect.width / 2) / scale,
          y: (rect.top - gridRect.top + rect.height / 2) / scale,
        };
      }
      setBoardGeometry({
        boardSize: { width: gridRect.width / scale, height: gridRect.height / scale },
        slotCenters: centers,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && boardGridRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(boardGridRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [activeBeat?.id, boardScale, showLog, showDetail, isMobile, isLandscape, isCompactLandscape, width, height]);

  const cancelPendingTouchCandidate = () => {
    touchCleanupRef.current?.();
    touchCleanupRef.current = null;
    touchCandidateRef.current = null;
    lastSnappedSlotKeyRef.current = null;
    setTouchDragState(null);
  };

  useEffect(() => {
    cancelPendingTouchCandidate();
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
      cancelPendingTouchCandidate();
    }
  }, [isMobile]);

  useEffect(() => {
    return () => {
      touchCleanupRef.current?.();
      touchCleanupRef.current = null;
      if (tapCueTimerRef.current !== null) {
        window.clearTimeout(tapCueTimerRef.current);
        tapCueTimerRef.current = null;
      }
    };
  }, []);

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
        playTacticalSfx('alert');
        setError(result.reason ?? '操作不合法');
      } else {
        if (action.type === 'end_action_phase') {
          playTacticalSfx('confirm');
        }
        setSelection(null);
        setHoveredCard(null);
        setHoveredSlot(null);
        setDragOverSlot(null);
        setDraggingCardId(null);
        if (isMobile) setShowDetail(false);
      }
    } catch (err) {
      playTacticalSfx('alert');
      setError(err instanceof Error ? err.message : '执行操作异常');
    }
  };

  const clearNonModalSelection = () => {
    if (Date.now() - justFinishedTouchDragAtRef.current < 160) return;
    setSelection(null);
    setHoveredCard(null);
    setHoveredSlot(null);
    setHoveredUnitId(null);
  };

  const onSlotClick = (half: PlayerId, lane: LaneId, position: Position) => {
    if (Date.now() - justFinishedTouchDragAtRef.current < 160) return;
    const slotKey = makeSlotKey(half, lane, position);
    if (!canAct) {
      triggerSlotCue(slotKey, 'tap');
      if (selection) {
        playTacticalSfx('alert');
        setError('当前不是你的行动回合。');
      }
      return;
    }
    if (hasPending) {
      triggerSlotCue(slotKey, 'tap');
      playTacticalSfx('alert');
      setError('请先完成回合开始的 SP 支援选择。');
      return;
    }
    if (!isActionPhase) {
      triggerSlotCue(slotKey, 'tap');
      if (selection) {
        playTacticalSfx('alert');
        setError('只有行动阶段可以执行部署操作。');
      }
      return;
    }

    const action = selectedDeployActions.find((candidate) => candidate.lane === lane && candidate.position === position);
    if (action) {
      triggerSlotCue(slotKey, 'deploy');
      triggerHaptic(10);
      dispatch(action);
      return;
    }

    triggerSlotCue(slotKey, 'tap');
    if (selection) {
      const selectedInst = state.card_instances[selection];
      const selectedDef = cardDefinitionOf(state, selection);
      if (selectedInst?.zone === 'hand' && selectedDef) {
        if (selectedDef.card_type === 'operator') {
          const reason = getInvalidDeployReason(state, actor, selection, half, lane, position);
          if (reason) {
            playTacticalSfx('alert');
            setError(reason);
          }
        } else {
          playTacticalSfx('alert');
          setError('战术或支援卡请点击高亮作用单位，或使用「直接使用」按钮。');
        }
      }
    }
  };

  const onUnitClick = (instance: CardInstance) => {
    const unitSlotKey =
      instance.board_half && instance.lane && instance.position
        ? makeSlotKey(instance.board_half, instance.lane, instance.position)
        : null;

    if (!canAct) {
      if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
      playCombatSfx('select');
      setSelection(instance.card_instance_id);
      return;
    }
    const targetId = instance.card_instance_id;

    if (hasPending) {
      const pendingAction = pendingResolves.find((candidate) => candidate.target_instance_id === targetId);
      if (pendingAction) {
        if (unitSlotKey) triggerSlotCue(unitSlotKey, 'skill');
        dispatch(pendingAction);
      } else {
        if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
        playTacticalSfx('alert');
        setError('SP 支援必须选择尚未满 SP 且未冻结的友方干员。');
      }
      return;
    }

    if (selection && playTargets.has(targetId)) {
      const action = selectedPlayActions.find((candidate) => candidate.target_instance_id === targetId);
      if (action) {
        if (unitSlotKey) triggerSlotCue(unitSlotKey, 'skill');
        triggerHaptic(12);
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
        if (unitSlotKey) triggerSlotCue(unitSlotKey, 'skill');
        triggerHaptic(14);
        dispatch(action);
        return;
      }
    }

    if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
    triggerHaptic(6);
    if (selection === targetId) {
      playTacticalSfx('click');
      setSelection(null);
      if (isMobile) setShowDetail(false);
    } else {
      playCombatSfx('select');
      setSelection(targetId);
    }
  };

  const onHandCardClick = (id: CardInstanceId) => {
    setHoveredCard(null);
    if (!canAct) {
      playTacticalSfx('alert');
      setError('当前不是你的行动回合。');
      return;
    }
    if (hasPending) {
      playTacticalSfx('alert');
      setError('请先完成回合开始的支援选择。');
      return;
    }
    if (!isActionPhase) {
      playTacticalSfx('alert');
      setError('当前不在行动阶段，无法使用手牌。');
      return;
    }

    if (selection === id) {
      playTacticalSfx('click');
      setSelection(null);
      if (isMobile) setShowDetail(false);
      return;
    }

    setSelection(id);
    const reason = getInvalidCardReason(state, actor, id);
    if (reason) {
      playTacticalSfx('alert');
      setError(reason);
    } else {
      playCombatSfx('select');
    }
  };

  const handleQuickSkillClick = () => {
    if (!selection) return;
    const selectedInst = state.card_instances[selection];
    const selectedSlotKey =
      selectedInst?.board_half && selectedInst.lane && selectedInst.position
        ? makeSlotKey(selectedInst.board_half, selectedInst.lane, selectedInst.position)
        : null;
    if (selectedUnitActions.canSkillDirect) {
      const action = legal.find(
        (a): a is SkillAction => a.type === 'activate_skill' && a.card_instance_id === selection && a.target_instance_id === undefined,
      );
      if (action) {
        if (selectedSlotKey) triggerSlotCue(selectedSlotKey, 'skill');
        triggerHaptic(14);
        dispatch(action);
        return;
      }
    }
    if (selectedUnitActions.skillTargets.size > 0) {
      if (selectedSlotKey) triggerSlotCue(selectedSlotKey, 'tap');
      playTacticalSfx('alert');
      setError('请直接点击棋盘上青色脉冲高亮的目标单位发动技能。');
      return;
    }
    if (selectedSlotKey) triggerSlotCue(selectedSlotKey, 'tap');
    const reason = getInvalidUnitActionReason(state, actor, selection, 'activate_skill');
    playTacticalSfx('alert');
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
    playTacticalSfx('alert');
    setError(reason ?? '当前无法撤离该干员。');
  };

  const handleUnitDoubleTap = (instance: CardInstance) => {
    const unitId = instance.card_instance_id;
    const unitSlotKey =
      instance.board_half && instance.lane && instance.position
        ? makeSlotKey(instance.board_half, instance.lane, instance.position)
        : null;
    // 若刚才已有其它选中项且该单位属于可选目标，单击已触发目标作用，不重复触发技能
    if (
      selection &&
      selection !== unitId &&
      (pendingTargets.has(unitId) || playTargets.has(unitId) || selectedUnitActions.skillTargets.has(unitId))
    ) {
      return;
    }

    if (!canAct || hasPending || !isActionPhase || instance.controller_id !== actor) {
      if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
      setSelection(unitId);
      setShowDetail(true);
      playCombatSfx('select');
      triggerHaptic(10);
      return;
    }

    const directSkill = legal.find(
      (a): a is SkillAction =>
        a.type === 'activate_skill' && a.card_instance_id === unitId && a.target_instance_id === undefined,
    );
    if (directSkill) {
      if (unitSlotKey) triggerSlotCue(unitSlotKey, 'skill');
      triggerHaptic(14);
      void dispatch(directSkill);
      return;
    }

    const targetedSkills = legal.filter(
      (a): a is SkillAction =>
        a.type === 'activate_skill' && a.card_instance_id === unitId && a.target_instance_id !== undefined,
    );
    if (targetedSkills.length > 0) {
      if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
      setSelection(unitId);
      playCombatSfx('select');
      triggerHaptic(10);
      return;
    }

    if (unitSlotKey) triggerSlotCue(unitSlotKey, 'tap');
    setSelection(unitId);
    const reason = getInvalidUnitActionReason(state, actor, unitId, 'activate_skill');
    playTacticalSfx('alert');
    triggerHaptic(8);
    setError(reason ?? '当前无法发动主动技能。');
  };

  const evaluateTouchDragRef = useRef<
    (cardId: CardInstanceId, pointer: PointerPosition) => {
      aimPoint: PointerPosition;
      resolution: TouchDropResolution;
      statusText: string;
    }
  >(() => ({
    aimPoint: { x: 0, y: 0 },
    resolution: { kind: 'cancel', aimCenter: { x: 0, y: 0 } },
    statusText: '',
  }));

  evaluateTouchDragRef.current = (cardId, pointer) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : width;
    const vh = typeof window !== 'undefined' ? window.innerHeight : height;
    const aimPoint = computeTouchAimPoint(pointer, vw, vh);
    const cardDef = cardDefinitionOf(state, cardId);

    const deployActionsForCard =
      canAct && isActionPhase && !hasPending
        ? legal.filter((a): a is DeployAction => a.type === 'deploy_operator' && a.card_instance_id === cardId)
        : [];
    const playActionsForCard =
      canAct && isActionPhase && !hasPending
        ? legal.filter((a): a is PlayCardAction => a.type === 'play_card' && a.card_instance_id === cardId)
        : [];
    const playTargetIds = new Set(
      playActionsForCard.map((a) => a.target_instance_id).filter((id): id is CardInstanceId => id !== undefined),
    );
    const canDirectPlay = playActionsForCard.some((a) => a.target_instance_id === undefined);

    const slots: TouchDragSlotCandidate[] = [];
    for (const half of [topPlayer, bottomPlayer] as const) {
      for (const lane of LANES) {
        for (const position of ['front', 'back'] as const) {
          const slotKey = makeSlotKey(half, lane, position);
          const el = slotElRefs.current[slotKey];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const unit = boardMap.get(slotKey);
          const isValidDeploy =
            half === actor &&
            !unit &&
            deployActionsForCard.some((a) => a.lane === lane && a.position === position);
          const isValidUnitTarget = Boolean(unit && playTargetIds.has(unit.card_instance_id));
          slots.push({
            key: slotKey,
            half,
            lane,
            position,
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
            isValidDeploy,
            unitId: unit?.card_instance_id,
            isValidUnitTarget,
          });
        }
      }
    }

    const boardElRect = boardGridRef.current?.getBoundingClientRect();
    const boardRect = boardElRect
      ? {
          left: boardElRect.left,
          top: boardElRect.top,
          right: boardElRect.right,
          bottom: boardElRect.bottom,
        }
      : null;

    const resolution = resolveTouchDropTarget({
      aimPoint,
      slots,
      boardRect,
      canDirectPlay,
    });

    let statusText = '松手返回手牌区（取消操作）';
    if (resolution.kind === 'slot') {
      if (resolution.slot.isValidDeploy) {
        const posLabel = resolution.slot.position === 'front' ? '前锋' : '后卫';
        statusText = `松手部署 · ${LANE_LABEL[resolution.slot.lane]}${posLabel} (-${cardDef?.cost ?? 0} DP)`;
      } else {
        const targetDef = resolution.slot.unitId ? cardDefinitionOf(state, resolution.slot.unitId) : undefined;
        statusText = `松手施放 · 目标【${targetDef?.card_name_zh ?? '干员'}】`;
      }
    } else if (resolution.kind === 'direct_play') {
      statusText = `松手直接施放 · ${cardDef?.card_name_zh ?? '战术指令'} (-${cardDef?.cost ?? 0} DP)`;
    } else if (resolution.kind === 'invalid_slot') {
      if (cardDef?.card_type === 'operator') {
        statusText =
          getInvalidDeployReason(
            state,
            actor,
            cardId,
            resolution.slot.half,
            resolution.slot.lane,
            resolution.slot.position,
          ) ?? '所选格位不可部署';
      } else {
        statusText = getInvalidCardReason(state, actor, cardId) ?? '该目标无法使用此卡牌';
      }
    }

    return { aimPoint, resolution, statusText };
  };

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const legalRef = useRef(legal);
  legalRef.current = legal;

  const handleTouchStartCardCandidate = (
    cardId: CardInstanceId,
    e: React.PointerEvent<HTMLDivElement>,
    layoutMode: TouchDragLayoutMode,
  ) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    if (!canAct || !isActionPhase || hasPending) return;

    cancelPendingTouchCandidate();
    const pointerId = e.pointerId;
    const start: PointerPosition = { x: e.clientX, y: e.clientY };
    touchCandidateRef.current = { cardId, pointerId, start, layoutMode, active: false };

    const cleanup = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      touchCleanupRef.current = null;
      touchCandidateRef.current = null;
      lastSnappedSlotKeyRef.current = null;
    };

    const syncDragFrame = (pointer: PointerPosition) => {
      const candidate = touchCandidateRef.current;
      if (!candidate) return;
      const evaluated = evaluateTouchDragRef.current(candidate.cardId, pointer);
      setTouchDragState({
        cardId: candidate.cardId,
        pointerId: candidate.pointerId,
        pointer,
        aimPoint: evaluated.aimPoint,
        resolution: evaluated.resolution,
        statusText: evaluated.statusText,
        layoutMode: candidate.layoutMode,
      });

      if (evaluated.resolution.kind === 'slot' || evaluated.resolution.kind === 'invalid_slot') {
        const s = evaluated.resolution.slot;
        setDragOverSlot({ half: s.half, lane: s.lane, position: s.position });
        const nextSnapKey = evaluated.resolution.kind === 'slot' ? s.key : null;
        if (nextSnapKey && nextSnapKey !== lastSnappedSlotKeyRef.current) {
          triggerHaptic(6);
        }
        lastSnappedSlotKeyRef.current = nextSnapKey;
      } else {
        setDragOverSlot(null);
        lastSnappedSlotKeyRef.current = null;
      }
    };

    const onWindowPointerMove = (moveEv: PointerEvent) => {
      const candidate = touchCandidateRef.current;
      if (!candidate || moveEv.pointerId !== candidate.pointerId) return;
      const current: PointerPosition = { x: moveEv.clientX, y: moveEv.clientY };

      if (!candidate.active) {
        const intent = detectTouchDragIntent({
          start: candidate.start,
          current,
          layoutMode: candidate.layoutMode,
        });
        if (intent === 'pending') return;
        if (intent === 'scroll') {
          cleanup();
          return;
        }
        candidate.active = true;
        setHoveredCard(null);
        setDraggingCardId(candidate.cardId);
        setSelection(candidate.cardId);
        playCombatSfx('select');
        triggerHaptic(8);
      }

      if (moveEv.cancelable) {
        moveEv.preventDefault();
      }
      syncDragFrame(current);
    };

    const finishDrag = (endEv: PointerEvent, cancelled: boolean) => {
      const candidate = touchCandidateRef.current;
      if (!candidate || endEv.pointerId !== candidate.pointerId) return;
      const wasActive = candidate.active;
      const draggedCardId = candidate.cardId;
      cleanup();

      if (!wasActive) return;

      justFinishedTouchDragAtRef.current = Date.now();
      setDraggingCardId(null);
      setDragOverSlot(null);
      setTouchDragState(null);

      if (cancelled) {
        playTacticalSfx('click');
        return;
      }

      const dropPointer: PointerPosition = { x: endEv.clientX, y: endEv.clientY };
      const evaluated = evaluateTouchDragRef.current(draggedCardId, dropPointer);
      const currentLegal = legalRef.current;

      if (evaluated.resolution.kind === 'slot') {
        const slot = evaluated.resolution.slot;
        if (slot.isValidDeploy) {
          const action = currentLegal.find(
            (a): a is DeployAction =>
              a.type === 'deploy_operator' &&
              a.card_instance_id === draggedCardId &&
              a.lane === slot.lane &&
              a.position === slot.position,
          );
          if (action) {
            triggerHaptic(14);
            void dispatchRef.current(action);
            return;
          }
        } else if (slot.isValidUnitTarget && slot.unitId) {
          const action = currentLegal.find(
            (a): a is PlayCardAction =>
              a.type === 'play_card' &&
              a.card_instance_id === draggedCardId &&
              a.target_instance_id === slot.unitId,
          );
          if (action) {
            triggerHaptic(14);
            void dispatchRef.current(action);
            return;
          }
        }
      } else if (evaluated.resolution.kind === 'direct_play') {
        const action = currentLegal.find(
          (a): a is PlayCardAction =>
            a.type === 'play_card' &&
            a.card_instance_id === draggedCardId &&
            a.target_instance_id === undefined,
        );
        if (action) {
          triggerHaptic(14);
          void dispatchRef.current(action);
          return;
        }
      } else if (evaluated.resolution.kind === 'invalid_slot') {
        playTacticalSfx('alert');
        triggerHaptic(10);
        setError(evaluated.statusText);
        return;
      }

      playTacticalSfx('click');
    };

    const onWindowPointerUp = (upEv: PointerEvent) => finishDrag(upEv, false);
    const onWindowPointerCancel = (cancelEv: PointerEvent) => finishDrag(cancelEv, true);

    touchCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
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

      const isTouchLockedSlot = Boolean(
        touchDragState &&
          touchDragState.resolution.kind === 'slot' &&
          touchDragState.resolution.slot.key === slotKey &&
          touchDragState.resolution.slot.isValidDeploy,
      );

      const isSlotTapped = !combatAnim.effectiveDisabled && slotTapCue?.slotKey === slotKey;

      return (
        <div
          key={key}
          ref={(el) => {
            slotElRefs.current[slotKey] = el;
          }}
          role="button"
          tabIndex={isDeployTarget ? 0 : -1}
          aria-label={`${LANE_LABEL[lane]}${posName}${isDeployTarget ? ' 可部署' : ''}`}
          data-tap-cue={isSlotTapped ? slotTapCue.kind : undefined}
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
              if (reason) {
                playTacticalSfx('alert');
                setError(reason);
              }
            }
          }}
          className={`group relative overflow-hidden flex items-center justify-center ${
            useCompactBoard ? 'h-[54px]' : 'h-[58px] sm:h-[70px] lg:h-[82px]'
          } border transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            isSlotTapped ? 'anim-cell-hit-shake' : ''
          } ${
            isDeployTarget
              ? isTouchLockedSlot
                ? 'border-[#f59e0b] bg-amber-500/35 ring-2 ring-[#f59e0b] scale-[1.03] shadow-[0_0_20px_rgba(245,158,11,0.7)] cursor-pointer z-20'
                : isSlotHovered
                  ? 'border-[#f59e0b] bg-amber-500/30 ring-2 ring-[#f59e0b] shadow-[0_0_16px_rgba(245,158,11,0.55)] cursor-pointer'
                  : 'border-[#e5a52b] bg-amber-500/18 ring-2 ring-[#e5a52b]/60 shadow-[0_0_12px_rgba(229,165,43,0.4)] cursor-pointer animate-pulse'
              : slotInvalidReason
                ? 'border-rose-500/70 bg-rose-950/35 cursor-not-allowed'
                : isAttackLaneCell
                  ? 'border-rose-500/60 bg-rose-950/25 ring-1 ring-rose-500/40'
                  : isEnemy
                    ? 'border-rose-900/55 bg-[#140d11]/85 hover:border-rose-600/75'
                    : 'border-sky-900/55 bg-[#0c131c]/85 hover:border-sky-500/75'
          }`}
          style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
        >
          {/* 商业级 AIGC 战术部署平台地板素材（取代普通虚线 CSS 框） */}
          <img
            src={isEnemy ? deployPadEnemyArt : deployPadAllyArt}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            data-testid={`deploy-pad-${isEnemy ? 'enemy' : 'ally'}`}
            className={`pointer-events-none select-none absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
              isDeployTarget
                ? 'opacity-[0.82]'
                : isAttackLaneCell
                  ? 'opacity-[0.72]'
                  : 'opacity-[0.58] group-hover:opacity-[0.76]'
            }`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${
              isDeployTarget
                ? 'bg-amber-950/35'
                : isEnemy
                  ? 'bg-[#120a0e]/45'
                  : 'bg-[#091119]/45'
            }`}
          />
          {isSlotTapped && (
            <div
              key={`slot-tap-${slotTapCue.seq}`}
              aria-hidden="true"
              className="absolute inset-0 border border-amber-300/70 bg-amber-400/12 pointer-events-none z-25 anim-slot-flash"
            />
          )}
          <div className="relative z-10 flex flex-col items-center justify-center w-full px-1">
          {isDeployTarget ? (
            <div className="flex flex-col items-center gap-0.5 text-[#e5a52b] font-bold text-[10px] sm:text-xs tracking-wider text-center px-1">
              <span className="truncate max-w-full">
                {isTouchLockedSlot
                  ? '✓ 释放部署'
                  : isSlotHovered && activeHandDef
                    ? `✓ 部署 ${activeHandDef.card_name_zh}`
                    : '+ 部署'}
              </span>
              <span className="text-[8px] sm:text-[10px] font-mono">
                {(isTouchLockedSlot || isSlotHovered) && activeHandDef
                  ? `-${activeHandDef.cost} DP · ${posName}`
                  : `(${posName})`}
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
            <span className={`px-1.5 py-0.2 bg-black/55 border border-white/10 text-[9px] sm:text-[10px] font-mono tracking-wider ${isEnemy ? 'text-rose-200/80' : 'text-sky-200/80'}`}>
              {posName}
            </span>
          )}
          </div>

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

    const canActivateUnitSkill =
      instance.controller_id === actor &&
      isActionPhase &&
      canAct &&
      !hasPending &&
      legal.some(
        (a) => a.type === 'activate_skill' && a.card_instance_id === instance.card_instance_id,
      );
    const isUnitDragLocked = Boolean(
      touchDragState &&
        touchDragState.resolution.kind === 'slot' &&
        touchDragState.resolution.slot.key === slotKey &&
        touchDragState.resolution.slot.isValidUnitTarget,
    );

    const unitTapCue =
      !combatAnim.effectiveDisabled && slotTapCue?.slotKey === slotKey
        ? { kind: slotTapCue.kind, seq: slotTapCue.seq }
        : null;
    const isSkillWaveActive =
      !combatAnim.effectiveDisabled &&
      (Boolean(activeBeat?.skillUnits[instance.card_instance_id]) || unitTapCue?.kind === 'skill');

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
          compact={useCompactBoard}
          canActivateSkill={canActivateUnitSkill}
          isDragLocked={isUnitDragLocked}
          animState={unitAnimState}
          tapCue={unitTapCue}
          onClick={() => onUnitClick(instance)}
          onDoubleTap={() => handleUnitDoubleTap(instance)}
          onLongPress={() => {
            cancelPendingTouchCandidate();
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
        {isSkillWaveActive && (
          <div
            key={`wave-${unitTapCue?.seq ?? activeBeat?.id ?? 'skill'}`}
            aria-hidden="true"
            className="absolute -inset-1 border-2 border-cyan-300/85 shadow-[0_0_20px_rgba(34,211,238,0.6)] pointer-events-none z-30 anim-skill-wave"
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
  const directPlayAction =
    selectedInstance?.zone === 'hand' && canAct && isActionPhase && !hasPending
      ? selectedPlayActions.find((a) => a.target_instance_id === undefined)
      : undefined;

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
                    {' '}· {isMobile ? (useSideRail ? '左拖或点黄格部署' : '上拖或点黄格部署') : '点黄格部署'}（{selectedDefinition?.cost ?? 0} DP）
                  </span>
                ) : selectedPlayActions.length > 0 ? (
                  <span className="text-cyan-300">
                    {directPlayAction
                      ? isMobile
                        ? ' · 拖入棋盘或点下方直接使用'
                        : ' · 可直接使用此战术卡'
                      : isMobile
                        ? ' · 拖向目标或点击青色高亮单位发动'
                        : ' · 点击青色高亮目标发动'}
                  </span>
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
                  {canQuickActOnSelectedUnit && selectedUnitActions.canSkillDirect && (
                    <span className="text-amber-300 ml-1.5">· ⚡双击可发动技能</span>
                  )}
                  {canQuickActOnSelectedUnit && selectedUnitActions.skillTargets.size > 0 && (
                    <span className="text-cyan-300 ml-1.5">· ⚡点青格目标发动技能</span>
                  )}
                </span>
              ) : (
                <span className="text-slate-300"> · 战场编队干员（长按看详情）</span>
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
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {directPlayAction && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => dispatch(directPlayAction)}
                className="px-2.5 py-0.5 text-[10px] min-h-[28px] sm:min-h-[26px] font-bold"
              >
                ⚡ 直接使用
              </Button>
            )}
            {canQuickActOnSelectedUnit && selectedDefinition?.effect_trigger === 'active' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleQuickSkillClick}
                className="px-2.5 py-0.5 text-[10px] min-h-[28px] sm:min-h-[26px]"
              >
                ⚡ 技能
              </Button>
            )}
            {canQuickActOnSelectedUnit && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleQuickWithdrawClick}
                className="px-2.5 py-0.5 text-[10px] min-h-[28px] sm:min-h-[26px]"
              >
                ↩ 撤离
              </Button>
            )}
            {isMobile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDetail(true)}
                className="px-2.5 py-0.5 text-[10px] min-h-[28px] sm:min-h-[26px]"
              >
                详情档案
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                playTacticalSfx('click');
                setSelection(null);
              }}
              className="text-slate-400 hover:text-white px-2 py-0.5 text-[10px] min-h-[28px] sm:min-h-[26px]"
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
        onOpenSettings={onOpenSettings}
      />

      {/* 2. 系统提示与待决响应横幅区（无提示时自动折叠为 0px） */}
      <div className="shrink-0">

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

        {/* 中栏：自适应战场主舞台 + 手牌指挥托盘（手机横屏自动切换为左右分栏，竖屏与桌面上下布局） */}
        <main
          className={`relative flex-1 min-w-0 min-h-0 grid ${
            useSideRail ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)_auto]'
          } bg-[#0a0d12] overflow-hidden`}
          onClick={clearNonModalSelection}
        >
          {/* 中央三路交锋推演棋盘（含非阻塞回合横幅与跳过演出按钮） */}
          <div className="relative min-w-0 min-h-0 flex flex-col overflow-hidden">
            {!combatAnim.effectiveDisabled && activeBeat?.turnBanner && (
              <div
                key={activeBeat.turnBanner.id}
                aria-live="polite"
                className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-40 px-3 sm:px-4 py-1 sm:py-1.5 bg-[#121923]/95 border border-[#e5a52b] shadow-[0_6px_24px_rgba(0,0,0,0.65)] flex items-center gap-2 anim-turn-banner"
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
                className="absolute top-2 right-2 sm:right-3 z-40 px-2 sm:px-2.5 py-1 bg-[#18202c]/95 hover:bg-[#222d3d] border border-amber-500/60 text-amber-300 font-mono font-bold text-[10px] sm:text-[11px] cursor-pointer shadow-md"
                title="立即跳过余下战斗演出"
              >
                ⏭ 跳过演出 ({combatAnim.remainingQueueCount})
              </button>
            )}

            <TacticalBoardViewport
              isMobile={isMobile}
              disableGestures={Boolean(touchDragState || draggingCardId)}
              disableMotion={combatAnim.effectiveDisabled}
              arenaBackdropUrl={battlefieldArenaSurface}
              onScaleChange={setBoardScale}
              onBackgroundClick={clearNonModalSelection}
            >
              <div
                ref={boardGridRef}
                className={`relative w-full transition-all duration-150 ${
                  touchDragState?.resolution.kind === 'direct_play'
                    ? 'ring-2 ring-cyan-400/85 bg-cyan-950/15 shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                    : ''
                }`}
              >
                {touchDragState?.resolution.kind === 'direct_play' && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1 bg-cyan-950/95 border border-cyan-400 text-cyan-200 font-mono font-bold text-[11px] shadow-lg whitespace-nowrap"
                  >
                    ⚡ 松手直接释放战术指令
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1 sm:gap-2 lg:gap-2.5 w-full">
                  {LANES.map((lane) => {
                    const isDirectBaseLane = Boolean(attackPreview?.attacksBase && attackPreview.lane === lane);
                    const laneStrike = activeBeat?.laneStrikes.find((s) => s.lane === lane || s.targetLane === lane);
                    return (
                      <div
                        key={lane}
                        className={`relative flex flex-col bg-[#11161f]/92 backdrop-blur-[1px] border border-t-2 border-t-rose-500/65 border-b-2 border-b-sky-500/65 overflow-hidden shadow-[0_8px_22px_rgba(0,0,0,0.65)] transition-colors duration-150 ${
                          laneStrike
                            ? laneStrike.toBase
                              ? 'border-rose-500/85'
                              : laneStrike.kind === 'skill'
                                ? 'border-cyan-400/85'
                                : 'border-amber-500/80'
                            : 'border-[#2c3849]'
                        }`}
                        style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
                      >
                        <img
                          src={titaniumHudSurface}
                          alt=""
                          aria-hidden="true"
                          referrerPolicy="no-referrer"
                          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.28]"
                        />
                        {/* 航道路口标头 */}
                        <div className="relative z-10 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-[#151b24]/90 border-b border-[#242f3d] flex items-center justify-between text-xs">
                          <span className="font-bold text-white tracking-wide text-[10px] sm:text-xs">{LANE_LABEL[lane]}</span>
                          {isDirectBaseLane ? (
                            <span className="text-[8px] sm:text-[9px] font-mono font-bold text-rose-300 bg-rose-950/90 border border-rose-500/60 px-1 whitespace-nowrap">
                              ⚔ 直击
                            </span>
                          ) : (
                            <span className="text-[8px] sm:text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                              {lane}
                            </span>
                          )}
                        </div>

                        {/* 敌方战区 (上方后排 + 前排)：窄屏/横屏隐藏重复文字条释放空间 */}
                        <div className={`relative z-10 ${useCompactBoard ? 'hidden' : 'hidden sm:flex'} px-1.5 py-0.5 bg-rose-950/45 border-b border-rose-900/40 items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-rose-300`}>
                          <span>{isHotseat ? (topPlayer === 'player_a' ? '🔴 玩家 A 防线' : '🔴 玩家 B 防线') : '🔴 敌方战区'}</span>
                          <span className="text-[8px] sm:text-[9px] text-rose-400/80">后排/前锋</span>
                        </div>
                        <div className={`relative z-10 p-0.5 sm:p-1.5 space-y-0.5 sm:space-y-1 bg-[#180e12]/60 border-b border-rose-900/30 ${actor === topPlayer ? 'bg-rose-950/20' : ''}`}>
                          {renderSlot(topPlayer, lane, 'back')}
                          {renderSlot(topPlayer, lane, 'front')}
                        </div>

                        {/* 三路阻挡与交锋核心线 */}
                        <div className="relative z-10 py-0.5 px-1 sm:px-2 bg-[#0f131a]/92 border-y border-[#2d3848] flex items-center justify-center gap-1 sm:gap-1.5 select-none">
                          <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                          <span className="text-[8px] sm:text-[10px] font-mono font-bold text-[#e5a52b] tracking-wider flex items-center gap-0.5 sm:gap-1 whitespace-nowrap">
                            <span>⚔</span>
                            <span>{isDirectBaseLane ? '直击基地' : '交锋线'}</span>
                          </span>
                          <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                        </div>

                        {/* 己方战区 (下方前排 + 后排) */}
                        <div className={`relative z-10 p-0.5 sm:p-1.5 space-y-0.5 sm:space-y-1 bg-[#0b131d]/60 ${actor === bottomPlayer ? 'bg-sky-950/20' : ''}`}>
                          {renderSlot(bottomPlayer, lane, 'front')}
                          {renderSlot(bottomPlayer, lane, 'back')}
                        </div>
                        <div className={`relative z-10 ${useCompactBoard ? 'hidden' : 'hidden sm:flex'} px-1.5 py-0.5 bg-sky-950/45 border-t border-sky-900/40 items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-sky-300`}>
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
                  disableMotion={combatAnim.effectiveDisabled || !appSettings.combatVfxEnabled}
                />
              </div>
            </TacticalBoardViewport>
          </div>

          {/* 底部 / 横屏右侧统一己方指挥面板与手牌托盘 */}
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
            layoutMode={useSideRail ? 'side-rail' : 'bottom'}
            selection={selection}
            draggingCardId={draggingCardId}
            allyBaseDamageDelta={activeBeat?.baseDamage.ally ?? null}
            disableMotion={combatAnim.effectiveDisabled}
            selectionPrompt={selectionPromptContent}
            onHandCardClick={onHandCardClick}
            onLongPressCard={(id) => {
              cancelPendingTouchCandidate();
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
              playCombatSfx('select');
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
            onTouchStartCardCandidate={handleTouchStartCardCandidate}
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
          maxHeight={isLandscape ? 'max-h-[92dvh]' : 'max-h-[85dvh]'}
        >
          <LogView history={snapshot.logHistory} state={snapshot.state} />
        </BottomSheet>
      )}

      {/* 6. 移动端独立底部抽屉：干员战术详情与指令操作 */}
      {isMobile && (
        <BottomSheet
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          title="战术单位指令与档案"
          codeName={selectedInstance?.card_id ?? 'SYS.DOSSIER'}
          maxHeight={isLandscape ? 'max-h-[92dvh]' : 'max-h-[85dvh]'}
        >
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

      {/* 10. 浮动错误提示（移动端置于顶部 HUD 下方，避免遮挡底部手牌与行动按钮） */}
      {error && (
        <div
          role="alert"
          className="fixed top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-auto sm:bottom-6 left-1/2 -translate-x-1/2 z-50 px-3 sm:px-4 py-2 bg-rose-950/95 border border-rose-500 text-rose-100 text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-[92vw]"
        >
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-2 text-rose-300 hover:text-white shrink-0">
            ✕
          </button>
        </div>
      )}
      {/* 11. 移动端触控拖拽悬浮预览、瞄准虚线与磁吸准星 */}
      {touchDragState && cardDefinitionOf(state, touchDragState.cardId) && (
        <CardTouchDragOverlay
          definition={cardDefinitionOf(state, touchDragState.cardId)!}
          pointer={touchDragState.pointer}
          aimPoint={touchDragState.aimPoint}
          resolution={touchDragState.resolution}
          statusText={touchDragState.statusText}
          viewportWidth={typeof window !== 'undefined' ? window.innerWidth : width}
          viewportHeight={typeof window !== 'undefined' ? window.innerHeight : height}
        />
      )}
    </div>
  );
}

