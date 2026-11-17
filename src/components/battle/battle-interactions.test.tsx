import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  createLongPressController,
  DOUBLE_TAP_WINDOW_MS,
  exceedsMoveThreshold,
  LONG_PRESS_DELAY_MS,
} from '../../hooks/useLongPress';
import { clampPopoverPosition } from './CardPreviewPopover';
import {
  computeTouchAimPoint,
  detectTouchDragIntent,
  resolveTouchDropTarget,
  type TouchDragSlotCandidate,
} from './touchDrag';
import {
  getInvalidCardReason,
  getInvalidDeployReason,
  getInvalidUnitActionReason,
  previewAttackTargets,
} from './tacticalSelectors';
import { UnitView } from './UnitView';
import { DEMO_CARDS, PRESET_DECKS } from '../../client/gameData';
import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from '../../game/engine';
import type { CardId, CardInstanceId, Cost, GameState } from '../../game/types';

function createActionPhaseState(seed = 2026): GameState {
  let state = createInitialGameState({
    decks: { player_a: PRESET_DECKS[0], player_b: PRESET_DECKS[1] },
    cards: DEMO_CARDS,
    seed,
  });
  state = mulligan(state, 'player_a', []).value;
  state = mulligan(state, 'player_b', []).value;
  state = advancePhase(state).value;
  if (state.phase === 'turn_start') {
    state = advancePhase(state).value;
  }
  return state;
}

describe('Phase 5: 桌面与移动端交互体验测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('长按控制器: 静止长按达到 450ms 触发详情回调，松手不会误触发部署/点击', () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    const ctrl = createLongPressController({ onLongPress, onTap });

    ctrl.start({ x: 100, y: 500 });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS - 50);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(ctrl.wasLongPressTriggered()).toBe(true);

    ctrl.end();
    const tapped = ctrl.consumeClick();
    expect(tapped).toBe(false);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('长按控制器: 手牌横向滑动超过 10px 时立即取消长按计时器，绝不误弹详情', () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    const ctrl = createLongPressController({ onLongPress, onTap });

    expect(exceedsMoveThreshold({ x: 100, y: 500 }, { x: 106, y: 504 })).toBe(false);
    expect(exceedsMoveThreshold({ x: 100, y: 500 }, { x: 115, y: 500 })).toBe(true);

    ctrl.start({ x: 100, y: 500 });
    vi.advanceTimersByTime(150);
    ctrl.move({ x: 118, y: 502 });
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
    ctrl.end();
    expect(ctrl.consumeClick()).toBe(false);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('长按控制器: 短促点击在阈值内正常触发单击选中', () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    const ctrl = createLongPressController({ onLongPress, onTap });

    ctrl.start({ x: 100, y: 500 });
    vi.advanceTimersByTime(120);
    ctrl.end();
    expect(ctrl.consumeClick()).toBe(true);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('悬停浮层坐标钳位: 左右边缘与底部手牌触发时严禁超出视口裁切', () => {
    const leftEdgePos = clampPopoverPosition(
      { left: 4, top: 620, right: 120, bottom: 770, width: 116, height: 150 },
      1280,
      800,
    );
    expect(leftEdgePos.left).toBeGreaterThanOrEqual(12);
    expect(leftEdgePos.top).toBeGreaterThanOrEqual(12);

    const rightEdgePos = clampPopoverPosition(
      { left: 1200, top: 620, right: 1316, bottom: 770, width: 116, height: 150 },
      1280,
      800,
    );
    expect(rightEdgePos.left + 236).toBeLessThanOrEqual(1280 - 12);
  });

  it('引擎驱动错误原因: 部署半区/前后排规则/费用不足/已占格均直接返回引擎真实 reason', () => {
    const baseState = createActionPhaseState(2026);
    const actor = baseState.active_player_id;
    const enemy = actor === 'player_a' ? 'player_b' : 'player_a';

    // 找一张当前玩家手牌里的干员，调整双方状态进行确定性校验
    const handOpId = baseState.players[actor].hand.find(
      (id) => baseState.card_definitions[baseState.card_instances[id].card_id]?.card_type === 'operator',
    )!;
    const handOpDef = baseState.card_definitions[baseState.card_instances[handOpId].card_id];

    // 1. 敌方半区部署 -> 返回半区错误
    expect(getInvalidDeployReason(baseState, actor, handOpId, enemy, 'center', 'front')).toBe(
      '只能部署在己方半区阵位。',
    );

    // 2. 强制令费用为 0 测试手牌和格子不可部署时的真实原因
    const zeroCostState: GameState = {
      ...baseState,
      players: {
        ...baseState.players,
        [actor]: { ...baseState.players[actor], cost: 0 as Cost },
      },
    };
    const validPos =
      handOpDef.deploy_rule === 'back_only' || (handOpDef.deploy_rule === undefined && handOpDef.attack_type === 'ranged') || handOpDef.floating
        ? 'back'
        : 'front';
    const invalidPos = validPos === 'front' ? 'back' : 'front';

    if (handOpDef.deploy_rule !== 'front_or_back') {
      expect(getInvalidDeployReason(zeroCostState, actor, handOpId, actor, 'center', invalidPos)).toBe(
        '干员不能部署在所选位置。',
      );
    }
    if (handOpDef.cost > 0) {
      expect(getInvalidDeployReason(zeroCostState, actor, handOpId, actor, 'center', validPos)).toBe('费用不足。');
      expect(getInvalidCardReason(zeroCostState, actor, handOpId)).toBe('费用不足。');
    }

    // 3. 给足够费用部署成功后再点同一格子 -> 返回已占用
    const richState: GameState = {
      ...baseState,
      players: {
        ...baseState.players,
        [actor]: { ...baseState.players[actor], cost: 10 as Cost },
      },
    };
    const res = reduceGameAction(richState, actor, {
      type: 'deploy_operator',
      card_instance_id: handOpId,
      lane: 'left',
      position: validPos,
    });
    expect(res.ok).toBe(true);
    const anotherOpId = res.value.players[actor].hand.find(
      (id) => res.value.card_definitions[res.value.card_instances[id].card_id]?.card_type === 'operator',
    );
    if (anotherOpId) {
      expect(getInvalidDeployReason(res.value, actor, anotherOpId, actor, 'left', validPos)).toBe(
        '所选部署位已被占用。',
      );
    }

    // 4. 在场单位主动技能不可用时直接返回引擎原因
    const skillErr = getInvalidUnitActionReason(res.value, actor, handOpId, 'activate_skill');
    expect(typeof skillErr).toBe('string');
  });

  it('攻击范围与索敌预演: 与 combat.ts 一致（直击基地、同路前锋优先、跨路嘲讽拦截）', () => {
    const state = createActionPhaseState(42);
    const actor = state.active_player_id;
    const enemy = actor === 'player_a' ? 'player_b' : 'player_a';

    const meleeId = 'unit-melee' as CardInstanceId;
    const enemyFrontId = 'unit-enemy-front' as CardInstanceId;
    const enemyBackId = 'unit-enemy-back' as CardInstanceId;
    const tauntId = 'unit-taunt' as CardInstanceId;

    const meleeDefId = 'OP-GUA-001' as CardId;
    const enemyDefId = 'OP-SNI-001' as CardId;
    const tauntDefId = 'OP-DEF-003' as CardId; // 查找是否带 all_lanes 嘲讽，若无则显式挂载测试定义
    const tauntDef = {
      ...DEMO_CARDS.find((c) => c.card_id === meleeDefId)!,
      card_id: tauntDefId,
      card_name_zh: '测试重装',
      taunt_scope: 'all_lanes' as const,
    };

    const customDefs = {
      ...state.card_definitions,
      [tauntDefId]: tauntDef,
    };

    const emptyLaneState: GameState = {
      ...state,
      card_definitions: customDefs,
      card_instances: {
        ...state.card_instances,
        [meleeId]: {
          card_instance_id: meleeId,
          card_id: meleeDefId,
          owner_id: actor,
          controller_id: actor,
          board_half: actor,
          lane: 'center',
          position: 'front',
          zone: 'board',
          operator_combat: {
            current_hp: 10 as never,
            current_atk_modifiers: [],
            current_sp: 0 as never,
            shield: 0,
            statuses: [],
            equipment_ids: [],
          },
          operator_lifecycle: {
            redeploy_cd_remaining: 0,
            redeploy_cd_applied_owner_turn_index: null,
            has_deployed_before: true,
            entered_battle_this_owner_turn: false,
            paid_deploy_cost: 3 as never,
            once_per_game_flags: {},
          },
        },
      },
    };

    // 1. 敌方中路无人 -> 直击基地
    const previewEmpty = previewAttackTargets(emptyLaneState, {
      kind: 'unit',
      instance: emptyLaneState.card_instances[meleeId],
    });
    expect(previewEmpty?.attacksBase).toBe(true);
    expect(previewEmpty?.primaryTargetId).toBeNull();

    // 2. 敌方中路前排与后排均有人 -> 优先锁定前排
    const duelState: GameState = {
      ...emptyLaneState,
      card_instances: {
        ...emptyLaneState.card_instances,
        [enemyFrontId]: {
          ...emptyLaneState.card_instances[meleeId],
          card_instance_id: enemyFrontId,
          card_id: meleeDefId,
          owner_id: enemy,
          controller_id: enemy,
          board_half: enemy,
          lane: 'center',
          position: 'front',
        },
        [enemyBackId]: {
          ...emptyLaneState.card_instances[meleeId],
          card_instance_id: enemyBackId,
          card_id: enemyDefId,
          owner_id: enemy,
          controller_id: enemy,
          board_half: enemy,
          lane: 'center',
          position: 'back',
        },
      },
    };
    const previewFront = previewAttackTargets(duelState, {
      kind: 'unit',
      instance: duelState.card_instances[meleeId],
    });
    expect(previewFront?.attacksBase).toBe(false);
    expect(previewFront?.primaryTargetId).toBe(enemyFrontId);

    // 3. 敌方左路有全路嘲讽单位 -> 强制拦截中路攻击
    const tauntState: GameState = {
      ...duelState,
      card_instances: {
        ...duelState.card_instances,
        [tauntId]: {
          ...emptyLaneState.card_instances[meleeId],
          card_instance_id: tauntId,
          card_id: tauntDefId,
          owner_id: enemy,
          controller_id: enemy,
          board_half: enemy,
          lane: 'left',
          position: 'front',
        },
      },
    };
    const previewTaunt = previewAttackTargets(tauntState, {
      kind: 'unit',
      instance: tauntState.card_instances[meleeId],
    });
    expect(previewTaunt?.tauntBlocked).toBe(true);
    expect(previewTaunt?.primaryTargetId).toBe(tauntId);
  });

  it('UnitView: 不同高亮状态 (attack_target vs target vs selected) 渲染可区分视觉指示', () => {
    const state = createActionPhaseState(99);
    const unitId = 'test-unit' as CardInstanceId;
    const def = DEMO_CARDS.find((c) => c.card_type === 'operator')!;
    const unitState: GameState = {
      ...state,
      card_instances: {
        ...state.card_instances,
        [unitId]: {
          card_instance_id: unitId,
          card_id: def.card_id,
          owner_id: 'player_b',
          controller_id: 'player_b',
          board_half: 'player_b',
          lane: 'center',
          position: 'front',
          zone: 'board',
          operator_combat: {
            current_hp: (def.hp ?? 10) as never,
            current_atk_modifiers: [],
            current_sp: 0 as never,
            shield: 0,
            statuses: [],
            equipment_ids: [],
          },
        },
      },
    };

    const htmlAttackTarget = renderToString(
      <UnitView state={unitState} instance={unitState.card_instances[unitId]} highlight="attack_target" />,
    );
    expect(htmlAttackTarget).toContain('data-highlight="attack_target"');
    expect(htmlAttackTarget).toContain('⚔ 锁定');

    const htmlSkillTarget = renderToString(
      <UnitView state={unitState} instance={unitState.card_instances[unitId]} highlight="target" />,
    );
    expect(htmlSkillTarget).toContain('data-highlight="target"');
    expect(htmlSkillTarget).toContain('◎ 目标');

    const htmlSkillReady = renderToString(
      <UnitView
        state={unitState}
        instance={unitState.card_instances[unitId]}
        highlight="none"
        canActivateSkill
      />,
    );
    expect(htmlSkillReady).toContain('data-skill-ready="true"');
    expect(htmlSkillReady).toContain('⚡ 就绪');

    const htmlDragLocked = renderToString(
      <UnitView
        state={unitState}
        instance={unitState.card_instances[unitId]}
        highlight="target"
        isDragLocked
      />,
    );
    expect(htmlDragLocked).toContain('✓ 释放锁定');
  });

  it('双击手势识别: 300ms 内连续轻点触发双击快速技能，超过阈值则按普通单击处理', () => {
    let clock = 1000;
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    const onDoubleTap = vi.fn();
    const ctrl = createLongPressController({
      onLongPress,
      onTap,
      onDoubleTap,
      now: () => clock,
    });

    // 第一次点击
    ctrl.start({ x: 180, y: 320 });
    ctrl.end();
    expect(ctrl.consumeClick()).toBe(true);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();

    // 220ms 后第二次点击 -> 识别为双击
    clock += 220;
    ctrl.start({ x: 182, y: 321 });
    ctrl.end();
    expect(ctrl.consumeClick()).toBe(true);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledTimes(1);

    // 超过 DOUBLE_TAP_WINDOW_MS 再次点击 -> 重新作为普通单击
    clock += DOUBLE_TAP_WINDOW_MS + 60;
    ctrl.start({ x: 180, y: 320 });
    ctrl.end();
    expect(ctrl.consumeClick()).toBe(true);
    expect(onTap).toHaveBeenCalledTimes(2);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('移动端拖牌意图识别: 竖屏上拉拖牌 vs 横向滑手牌，横屏侧栏左拉拖牌 vs 纵向滚动', () => {
    // 竖屏 bottom 模式
    expect(
      detectTouchDragIntent({
        start: { x: 200, y: 700 },
        current: { x: 204, y: 694 },
        layoutMode: 'bottom',
      }),
    ).toBe('pending');
    expect(
      detectTouchDragIntent({
        start: { x: 200, y: 700 },
        current: { x: 202, y: 675 },
        layoutMode: 'bottom',
      }),
    ).toBe('drag');
    expect(
      detectTouchDragIntent({
        start: { x: 200, y: 700 },
        current: { x: 240, y: 696 },
        layoutMode: 'bottom',
      }),
    ).toBe('scroll');

    // 横屏 side-rail 模式
    expect(
      detectTouchDragIntent({
        start: { x: 740, y: 260 },
        current: { x: 710, y: 256 },
        layoutMode: 'side-rail',
      }),
    ).toBe('drag');
    expect(
      detectTouchDragIntent({
        start: { x: 740, y: 260 },
        current: { x: 742, y: 295 },
        layoutMode: 'side-rail',
      }),
    ).toBe('scroll');
  });

  it('触控准星偏移与格位磁吸解析: 精准命中、24px 边缘磁吸、非法格位提示与棋盘直接释放', () => {
    const aim = computeTouchAimPoint({ x: 160, y: 400 }, 390, 844);
    expect(aim.x).toBe(160);
    expect(aim.y).toBe(372); // 默认上移 28px 防止手指遮挡

    const slots: TouchDragSlotCandidate[] = [
      {
        key: 'player_a:left:front',
        half: 'player_a',
        lane: 'left',
        position: 'front',
        rect: { left: 20, top: 300, right: 120, bottom: 360 },
        isValidDeploy: true,
        isValidUnitTarget: false,
      },
      {
        key: 'player_a:center:front',
        half: 'player_a',
        lane: 'center',
        position: 'front',
        rect: { left: 140, top: 300, right: 240, bottom: 360 },
        isValidDeploy: false,
        isValidUnitTarget: false,
      },
    ];
    const boardRect = { left: 10, top: 140, right: 380, bottom: 480 };

    // 1. 直接命中有效格
    const directRes = resolveTouchDropTarget({
      aimPoint: { x: 70, y: 330 },
      slots,
      boardRect,
      canDirectPlay: false,
    });
    expect(directRes.kind).toBe('slot');
    if (directRes.kind === 'slot') {
      expect(directRes.snapped).toBe(false);
      expect(directRes.slot.key).toBe('player_a:left:front');
    }

    // 2. 位于有效格边缘外 16px（<= 24px）自动磁吸至格中心
    const snappedRes = resolveTouchDropTarget({
      aimPoint: { x: 70, y: 376 },
      slots,
      boardRect,
      canDirectPlay: false,
    });
    expect(snappedRes.kind).toBe('slot');
    if (snappedRes.kind === 'slot') {
      expect(snappedRes.snapped).toBe(true);
      expect(snappedRes.aimCenter).toEqual({ x: 70, y: 330 });
    }

    // 3. 落在不可部署格位内
    const invalidRes = resolveTouchDropTarget({
      aimPoint: { x: 190, y: 330 },
      slots,
      boardRect,
      canDirectPlay: false,
    });
    expect(invalidRes.kind).toBe('invalid_slot');

    // 4. 非指向型战术卡拖入棋盘空白区 -> direct_play
    const directPlayRes = resolveTouchDropTarget({
      aimPoint: { x: 300, y: 200 },
      slots,
      boardRect,
      canDirectPlay: true,
    });
    expect(directPlayRes.kind).toBe('direct_play');

    // 5. 拖回手牌托盘区 -> 安全取消
    const cancelRes = resolveTouchDropTarget({
      aimPoint: { x: 190, y: 720 },
      slots,
      boardRect,
      canDirectPlay: true,
    });
    expect(cancelRes.kind).toBe('cancel');
  });
});
