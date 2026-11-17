import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LocalGameController } from '../../client/localGameController';
import { DEMO_CARDS, PRESET_DECKS } from '../../client/gameData';
import { advancePhase, reduceGameAction } from '../../game/engine';
import type { CardInstanceId, CombatLogEvent, GameState, PlayerId } from '../../game/types';
import {
  buildPresentationBeats,
  captureBoardPositions,
  collectImmediateCombatAudioCues,
  DEFAULT_ANIMATION_SPEED_MODE,
  getBeatDurationMs,
  getCssAnimationScale,
  makeSlotKey,
} from './combatPresentation';
import { playCombatAudioCues, playCombatSfx } from '../../audio/combatSfx';
import { TacticalBattleHud } from './TacticalBattleHud';
import { PlayerHandDock } from './PlayerHandDock';
import { AttackPathOverlay } from './AttackPathOverlay';
import { UnitView } from './UnitView';
import { HealthBar } from '../ui/HealthBar';

function createStartedController(seed = 777): LocalGameController {
  const ctrl = LocalGameController.create({
    decks: { player_a: PRESET_DECKS[0], player_b: PRESET_DECKS[1] },
    cards: DEMO_CARDS,
    seed,
  });
  ctrl.submitMulligan('player_a', []);
  ctrl.submitMulligan('player_b', []);
  return ctrl;
}

describe('Phase 6: 战斗轻量动画与视觉反馈测试', () => {
  it('部署演出适配: 从真实引擎 unit_deployed 日志生成落位脉冲与跳字，且绝不修改 GameState', () => {
    const ctrl = createStartedController(1001);
    const prevSnapshot = ctrl.getSnapshot();
    const prevState = prevSnapshot.state;
    const prevPositions = captureBoardPositions(prevState);
    const actor = prevState.active_player_id;

    // 找一张当前费用够用的近战干员部署
    const opId = prevState.players[actor].hand.find((id) => {
      const def = prevState.card_definitions[prevState.card_instances[id].card_id];
      return def?.card_type === 'operator' && def.cost <= prevState.players[actor].cost;
    });
    expect(opId).toBeDefined();

    const opDef = prevState.card_definitions[prevState.card_instances[opId!].card_id]!;
    const pos = opDef.attack_type === 'melee' && !opDef.floating ? 'front' : 'back';
    const res = ctrl.dispatch(actor, {
      type: 'deploy_operator',
      card_instance_id: opId!,
      lane: 'center',
      position: pos,
    });
    expect(res.ok).toBe(true);

    const nextSnapshot = ctrl.getSnapshot();
    const newEvents = nextSnapshot.logHistory.slice(prevSnapshot.logHistory.length);
    const frozenNextCopy = structuredClone(nextSnapshot.state);

    const beats = buildPresentationBeats({
      prevState,
      nextState: nextSnapshot.state,
      newEvents,
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'normal',
    });

    expect(beats.length).toBeGreaterThanOrEqual(1);
    const deployBeat = beats[0]!;
    const expectedSlot = makeSlotKey(actor, 'center', pos);
    expect(deployBeat.deployedSlots).toContain(expectedSlot);
    expect(deployBeat.deployedUnits[opId!]).toBe(true);
    expect(deployBeat.floatingPopups.some((p) => p.slotKey === expectedSlot && p.kind === 'deploy')).toBe(true);
    const expectedDeployCue = (opDef.rarity ?? 3) >= 5 ? 'deploy_elite' : 'deploy';
    expect(deployBeat.audioCues?.some((c) => c.kind === expectedDeployCue)).toBe(true);
    // 零规则耦合校验：适配器未改动 state 一分一毫
    expect(nextSnapshot.state).toEqual(frozenNextCopy);
  });

  it('真实交锋流水线: 正确识别近战/远程攻击、护盾吸收、伤害跳字、阵亡原位退场残影、直击基地与回合切换', () => {
    const ctrl = createStartedController(2026);
    const s0 = ctrl.getSnapshot().state;
    const actor = s0.active_player_id;
    const enemy: PlayerId = actor === 'player_a' ? 'player_b' : 'player_a';

    // 构造一个已部署的友方远程单位(左路)与敌方残血前锋(左路)，以及一个友方近战单位(右路空路直击基地)
    const allyRanged = Object.values(s0.card_instances).find(
      (i) => i.owner_id === actor && s0.card_definitions[i.card_id]?.attack_type === 'ranged',
    )!;
    const allyMelee = Object.values(s0.card_instances).find(
      (i) => i.owner_id === actor && s0.card_definitions[i.card_id]?.attack_type === 'melee',
    )!;
    const enemyTarget = Object.values(s0.card_instances).find(
      (i) => i.owner_id === enemy && s0.card_definitions[i.card_id]?.card_type === 'operator',
    )!;

    const stagedState: GameState = {
      ...s0,
      card_instances: {
        ...s0.card_instances,
        [allyRanged.card_instance_id]: {
          ...allyRanged,
          zone: 'board',
          board_half: actor,
          lane: 'left',
          position: 'back',
          operator_combat: {
            current_hp: 5,
            current_atk_modifiers: [3],
            current_sp: 0,
            shield: 0,
            statuses: [],
            equipment_ids: [],
          },
          operator_lifecycle: { entered_battle_this_owner_turn: false },
        },
        [allyMelee.card_instance_id]: {
          ...allyMelee,
          zone: 'board',
          board_half: actor,
          lane: 'right',
          position: 'front',
          operator_combat: {
            current_hp: 6,
            current_atk_modifiers: [],
            current_sp: 0,
            shield: 0,
            statuses: [],
            equipment_ids: [],
          },
          operator_lifecycle: { entered_battle_this_owner_turn: false },
        },
        [enemyTarget.card_instance_id]: {
          ...enemyTarget,
          zone: 'board',
          board_half: enemy,
          lane: 'left',
          position: 'front',
          operator_combat: {
            current_hp: 2,
            current_atk_modifiers: [],
            current_sp: 0,
            shield: 1,
            statuses: [],
            equipment_ids: [],
          },
          operator_lifecycle: { entered_battle_this_owner_turn: false },
        },
      },
    };

    const prevPositions = captureBoardPositions(stagedState);
    const res = reduceGameAction(stagedState, actor, { type: 'end_action_phase' });
    expect(res.ok).toBe(true);

    // 与 LocalGameController 一致：推进 combat -> turn_end -> turn_start -> action 并收集增量战报
    let nextState = res.value;
    const combatEvents: CombatLogEvent[] = [];
    for (let guard = 0; guard < 5 && nextState.phase !== 'action' && nextState.phase !== 'finished'; guard += 1) {
      const prevLen = nextState.combat_log.length;
      const stepped = advancePhase(nextState);
      expect(stepped.ok).toBe(true);
      nextState = stepped.value;
      if (nextState.combat_log.length >= prevLen) {
        combatEvents.push(...nextState.combat_log.slice(prevLen));
      } else {
        combatEvents.push(...nextState.combat_log);
      }
    }

    // 敌方单位已阵亡进入弃牌堆，lane/position 已被清空
    expect(nextState.card_instances[enemyTarget.card_instance_id].zone).toBe('discard');
    expect(nextState.card_instances[enemyTarget.card_instance_id].lane).toBeNull();

    const beats = buildPresentationBeats({
      prevState: stagedState,
      nextState,
      newEvents: combatEvents,
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'normal',
    });

    // 第一段：左路远程攻击拆分为 Strike（攻击轨迹先行、目标保持受击前 HP）-> Impact（伤害扣血与原格位阵亡退场）
    const leftStrikeBeat = beats.find(
      (b) => b.phase === 'strike' && b.laneStrikes.some((s) => s.lane === 'left'),
    );
    expect(leftStrikeBeat).toBeDefined();
    expect(leftStrikeBeat!.laneStrikes[0]!.attackType).toBe('ranged');
    expect(leftStrikeBeat!.laneStrikes[0]!.direction).toBe('up');
    expect(leftStrikeBeat!.laneStrikes[0]!.targetSlotKey).toBe(makeSlotKey(enemy, 'left', 'front'));
    expect(leftStrikeBeat!.attackingUnits[allyRanged.card_instance_id]).toBe('up');
    expect(leftStrikeBeat!.audioCues?.some((c) => c.kind === 'strike_ranged')).toBe(true);
    // 关键校验：Strike 阶段绝不提前显示被攻击后的生命值或退场状态
    expect(leftStrikeBeat!.visualState?.card_instances[enemyTarget.card_instance_id]?.zone).toBe('board');
    expect(leftStrikeBeat!.visualState?.card_instances[enemyTarget.card_instance_id]?.operator_combat?.current_hp).toBe(2);
    expect(leftStrikeBeat!.visualState?.card_instances[enemyTarget.card_instance_id]?.operator_combat?.shield).toBe(1);

    const leftImpactBeat = beats.find(
      (b) => b.phase === 'impact' && b.laneStrikes.some((s) => s.lane === 'left'),
    );
    expect(leftImpactBeat).toBeDefined();
    expect(leftImpactBeat!.hitUnits[enemyTarget.card_instance_id]).toBe(true);
    expect(leftImpactBeat!.floatingPopups.some((p) => p.kind === 'shield' && p.label === '🛡 -1')).toBe(true);
    expect(leftImpactBeat!.floatingPopups.some((p) => p.kind === 'damage' && p.label.startsWith('-'))).toBe(true);
    expect(leftImpactBeat!.audioCues?.some((c) => c.kind === 'shield')).toBe(true);
    expect(leftImpactBeat!.audioCues?.some((c) => c.kind === 'hit' && (c.delayMs ?? 0) > 0)).toBe(true);
    expect(leftImpactBeat!.audioCues?.some((c) => c.kind === 'defeat' && (c.delayMs ?? 0) >= 75)).toBe(true);
    expect(
      leftImpactBeat!.ghostCues.some(
        (g) => g.kind === 'defeat' && g.slotKey === makeSlotKey(enemy, 'left', 'front'),
      ),
    ).toBe(true);
    expect(leftImpactBeat!.visualState?.card_instances[enemyTarget.card_instance_id]?.zone).toBe('discard');

    // 第二段：右路近战攻击空路直击基地（Strike 阶段保持基地受击前血量，Impact 阶段才扣除基地 HP）
    const rightStrikeBeat = beats.find(
      (b) => b.phase === 'strike' && b.laneStrikes.some((s) => s.lane === 'right'),
    );
    expect(rightStrikeBeat).toBeDefined();
    expect(rightStrikeBeat!.laneStrikes[0]!.attackType).toBe('melee');
    expect(rightStrikeBeat!.laneStrikes[0]!.toBase).toBe(true);
    expect(rightStrikeBeat!.audioCues?.some((c) => c.kind === 'strike_melee')).toBe(true);
    expect(rightStrikeBeat!.visualState?.players[enemy].base_points).toBe(stagedState.players[enemy].base_points);

    const rightImpactBeat = beats.find(
      (b) => b.phase === 'impact' && b.laneStrikes.some((s) => s.lane === 'right'),
    );
    expect(rightImpactBeat).toBeDefined();
    expect(rightImpactBeat!.baseDamage.enemy).toBeGreaterThan(0);
    expect(rightImpactBeat!.audioCues?.some((c) => c.kind === 'base_hit')).toBe(true);
    expect(rightImpactBeat!.visualState!.players[enemy].base_points).toBeLessThan(stagedState.players[enemy].base_points);

    // 最后一段：回合切换横幅 + 抽卡音效
    const turnBeat = beats.find((b) => Boolean(b.turnBanner));
    expect(turnBeat).toBeDefined();
    expect(turnBeat!.turnBanner!.actor).toBe(enemy);
    expect(turnBeat!.audioCues?.some((c) => c.kind === 'turn_enemy')).toBe(true);
    expect(turnBeat!.audioCues?.some((c) => c.kind === 'draw')).toBe(true);

    // 动画关闭时即时音频队列与 SSR 安全调用验证
    const immediateCues = collectImmediateCombatAudioCues({
      prevState: stagedState,
      nextState,
      newEvents: combatEvents,
      bottomPlayer: actor,
    });
    expect(immediateCues.some((c) => c.kind === 'shield')).toBe(true);
    expect(immediateCues.some((c) => c.kind === 'hit')).toBe(true);
    expect(immediateCues.some((c) => c.kind === 'draw')).toBe(true);
    expect(() => playCombatSfx('skill')).not.toThrow();
    expect(() => playCombatAudioCues(immediateCues)).not.toThrow();
  });

  it('撤离与倍速/关闭控制: withdraw 生成撤离残影；fast 时长减半；off 返回空队列', () => {
    const ctrl = createStartedController(3030);
    const prevSnapshot = ctrl.getSnapshot();
    const prevState = prevSnapshot.state;
    const actor = prevState.active_player_id;

    // 构造一个已过部署回合的场上单位进行撤离
    const unitId = prevState.players[actor].hand.find(
      (id) => prevState.card_definitions[prevState.card_instances[id].card_id]?.card_type === 'operator',
    )!;
    const unitInst = prevState.card_instances[unitId];
    const staged: GameState = {
      ...prevState,
      card_instances: {
        ...prevState.card_instances,
        [unitId]: {
          ...unitInst,
          zone: 'board',
          board_half: actor,
          lane: 'center',
          position: 'front',
          operator_combat: {
            current_hp: 4,
            current_atk_modifiers: [],
            current_sp: 0,
            shield: 0,
            statuses: [],
            equipment_ids: [],
          },
          operator_lifecycle: { entered_battle_this_owner_turn: false },
        },
      },
    };
    const prevPositions = captureBoardPositions(staged);

    const events: CombatLogEvent[] = [
      {
        sequence: 1,
        type: 'unit_withdrawn',
        source_instance_id: unitId,
        source_player_id: actor,
        source_name: staged.card_definitions[unitInst.card_id]!.card_name_zh,
        lane: 'center',
        position: 'front',
        detail: '主动撤离战场',
      },
    ];

    const slowBeats = buildPresentationBeats({
      prevState: staged,
      nextState: prevState,
      newEvents: events,
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'slow',
    });
    expect(DEFAULT_ANIMATION_SPEED_MODE).toBe('slow');
    expect(getBeatDurationMs(440, 'slow')).toBe(880);
    expect(getCssAnimationScale('slow')).toBe(2);
    expect(slowBeats[0]!.durationMs).toBe(880);

    const fastBeats = buildPresentationBeats({
      prevState: staged,
      nextState: prevState,
      newEvents: events,
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'fast',
    });
    expect(fastBeats).toHaveLength(1);
    expect(fastBeats[0]!.ghostCues[0]!.kind).toBe('withdraw');
    expect(fastBeats[0]!.audioCues?.some((c) => c.kind === 'withdraw')).toBe(true);
    expect(fastBeats[0]!.durationMs).toBe(getBeatDurationMs(440, 'fast'));

    const offBeats = buildPresentationBeats({
      prevState: staged,
      nextState: prevState,
      newEvents: events,
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'off',
    });
    expect(offBeats).toHaveLength(0);

    // 主动技能事件应附加 skill 音效节拍
    const skillBeats = buildPresentationBeats({
      prevState: staged,
      nextState: staged,
      newEvents: [
        {
          sequence: 2,
          type: 'skill_activated',
          source_instance_id: unitId,
          source_player_id: actor,
          skill_name: '战术指令',
          detail: '发动技能',
        },
      ],
      prevPositions,
      bottomPlayer: actor,
      speedMode: 'normal',
    });
    expect(skillBeats.some((b) => b.audioCues?.some((c) => c.kind === 'skill'))).toBe(true);
  });

  it('组件视觉渲染: UnitView/HealthBar/TacticalBattleHud 正确渲染浮动伤害、基地受击标徽、倍速按钮及禁用动效', () => {
    const ctrl = createStartedController(4040);
    const state = ctrl.getSnapshot().state;
    const actor = state.active_player_id;
    const enemy: PlayerId = actor === 'player_a' ? 'player_b' : 'player_a';

    const unitId = state.players[actor].hand.find(
      (id) => state.card_definitions[state.card_instances[id].card_id]?.card_type === 'operator',
    )!;
    const unitInst = {
      ...state.card_instances[unitId],
      zone: 'board' as const,
      board_half: actor,
      lane: 'left' as const,
      position: 'front' as const,
      operator_combat: {
        current_hp: 3,
        current_atk_modifiers: [],
        current_sp: 2,
        shield: 1,
        statuses: [],
        equipment_ids: [],
      },
    };

    const unitHtml = renderToString(
      <UnitView
        state={{ ...state, card_instances: { ...state.card_instances, [unitId]: unitInst } }}
        instance={unitInst}
        highlight="none"
        animState={{
          hit: true,
          floatingPopups: [
            {
              id: 'p1',
              kind: 'damage',
              label: '-4',
              slotKey: makeSlotKey(actor, 'left', 'front'),
              unitId: unitId as CardInstanceId,
            },
          ],
          disableMotion: false,
        }}
      />,
    );
    expect(unitHtml).toContain('anim-hit-shake');
    expect(unitHtml).toContain('-4');
    expect(unitHtml).toContain('anim-float-number');

    const unitDisabledHtml = renderToString(
      <UnitView
        state={{ ...state, card_instances: { ...state.card_instances, [unitId]: unitInst } }}
        instance={unitInst}
        highlight="none"
        animState={{
          hit: true,
          floatingPopups: [
            {
              id: 'p1',
              kind: 'damage',
              label: '-4',
              slotKey: makeSlotKey(actor, 'left', 'front'),
              unitId: unitId as CardInstanceId,
            },
          ],
          disableMotion: true,
        }}
      />,
    );
    expect(unitDisabledHtml).not.toContain('anim-hit-shake');
    expect(unitDisabledHtml).not.toContain('anim-float-number');

    const hbHtml = renderToString(<HealthBar currentHp={3} maxHp={10} shield={2} />);
    expect(hbHtml).toContain('tabular-nums');

    const hudHtml = renderToString(
      <TacticalBattleHud
        state={state}
        actor={actor}
        bottomPlayer={actor}
        topPlayer={enemy}
        hasPending={false}
        showLog
        onToggleLog={() => {}}
        showDetail
        onToggleDetail={() => {}}
        animSpeedMode="fast"
        onCycleAnimSpeed={() => {}}
        enemyBaseDamageDelta={2}
      />,
    );
    expect(hudHtml).toContain('2x');
    expect(hudHtml).toContain('-2');

    const dockHtml = renderToString(
      <PlayerHandDock
        state={state}
        bottomPlayer={actor}
        actor={actor}
        canAct
        isActionPhase
        hasPending={false}
        isHotseat={false}
        isMobile={false}
        selection={null}
        draggingCardId={null}
        allyBaseDamageDelta={3}
        onHandCardClick={() => {}}
        onLongPressCard={() => {}}
        onHoverCard={() => {}}
        onDragStartCard={() => {}}
        onDragEndCard={() => {}}
        onEndActionPhase={() => {}}
      />,
    );
    expect(dockHtml).toContain('-3');
    expect(dockHtml).toContain('结束行动');
    expect(dockHtml).toContain('/10');

    const defaultHudHtml = renderToString(
      <TacticalBattleHud
        state={state}
        actor={actor}
        bottomPlayer={actor}
        topPlayer={enemy}
        hasPending={false}
        showLog
        onToggleLog={() => {}}
        showDetail
        onToggleDetail={() => {}}
        onCycleAnimSpeed={() => {}}
      />,
    );
    expect(defaultHudHtml).toContain('0.5x');

    const overlayHtml = renderToString(
      <AttackPathOverlay
        strikes={[
          {
            id: 's1',
            lane: 'left',
            attackType: 'ranged',
            direction: 'up',
            attackerSlotKey: makeSlotKey(actor, 'left', 'back'),
            targetSlotKey: makeSlotKey(enemy, 'left', 'front'),
            targetHalf: enemy,
            targetLane: 'left',
            toBase: false,
            kind: 'attack',
            phase: 'strike',
          },
        ]}
        bottomPlayer={actor}
        topPlayer={enemy}
        cssAnimScale={2}
        disableMotion={false}
      />,
    );
    expect(overlayHtml).toContain('data-testid="attack-path-overlay"');
    expect(overlayHtml).toContain('anim-path-draw');
    expect(overlayHtml).toContain('anim-reticle-lock');
    expect(overlayHtml).toContain('animateMotion');
  });
});
