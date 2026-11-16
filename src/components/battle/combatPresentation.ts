import type {
  BasePoints,
  CardInstance,
  CardInstanceId,
  CombatLogEvent,
  GameState,
  HpValue,
  LaneId,
  PlayerId,
  Position,
  SpValue,
} from '../../game/types';

export type AnimationSpeedMode = 'slow' | 'normal' | 'fast' | 'off';

export const DEFAULT_ANIMATION_SPEED_MODE: AnimationSpeedMode = 'slow';

export type SlotKey = `${PlayerId}:${LaneId}:${Position}`;

export interface UnitSlotLocation {
  readonly half: PlayerId;
  readonly lane: LaneId;
  readonly position: Position;
  readonly attackType: 'melee' | 'ranged';
  readonly name: string;
}

export type FloatingPopupKind = 'damage' | 'shield' | 'heal' | 'sp' | 'skill' | 'deploy' | 'status';

export interface FloatingPopup {
  readonly id: string;
  readonly kind: FloatingPopupKind;
  readonly label: string;
  readonly slotKey: SlotKey;
  readonly unitId?: CardInstanceId;
}

export interface SlotGhostCue {
  readonly id: string;
  readonly slotKey: SlotKey;
  readonly kind: 'defeat' | 'withdraw';
  readonly name: string;
}

export interface LaneStrikeCue {
  readonly id: string;
  readonly lane: LaneId;
  readonly attackType: 'melee' | 'ranged';
  readonly direction: 'up' | 'down';
  readonly attackerSlotKey: SlotKey;
  readonly targetSlotKey?: SlotKey;
  readonly targetHalf?: PlayerId;
  readonly targetLane?: LaneId;
  readonly toBase: boolean;
  readonly kind?: 'attack' | 'skill' | 'heal';
  readonly phase: 'strike' | 'impact';
}

export interface TurnBannerCue {
  readonly id: string;
  readonly actor: PlayerId;
  readonly turnNumber: number;
}

export interface PresentationBeat {
  readonly id: string;
  readonly durationMs: number;
  readonly phase: 'strike' | 'impact' | 'deploy' | 'withdraw' | 'skill' | 'turn';
  readonly visualState?: GameState;
  readonly deployedSlots: readonly SlotKey[];
  readonly deployedUnits: Readonly<Record<CardInstanceId, boolean>>;
  readonly attackingUnits: Readonly<Record<CardInstanceId, 'up' | 'down'>>;
  readonly hitUnits: Readonly<Record<CardInstanceId, boolean>>;
  readonly skillUnits: Readonly<Record<CardInstanceId, boolean>>;
  readonly laneStrikes: readonly LaneStrikeCue[];
  readonly floatingPopups: readonly FloatingPopup[];
  readonly ghostCues: readonly SlotGhostCue[];
  readonly baseDamage: {
    readonly ally?: number;
    readonly enemy?: number;
  };
  readonly turnBanner?: TurnBannerCue;
}

export interface UnitAnimationState {
  readonly deployed?: boolean;
  readonly hit?: boolean;
  readonly attackDirection?: 'up' | 'down' | null;
  readonly skillFlash?: boolean;
  readonly floatingPopups?: readonly FloatingPopup[];
  readonly disableMotion?: boolean;
}

export const MAX_QUEUED_BEATS = 18;

export function makeSlotKey(half: PlayerId, lane: LaneId, position: Position): SlotKey {
  return `${half}:${lane}:${position}`;
}

/**
 * 采集当前棋盘所有在场干员的位置和射程元数据，用于在单位阵亡或撤离后仍能定位动画格位。
 */
export function captureBoardPositions(state: GameState): Map<CardInstanceId, UnitSlotLocation> {
  const map = new Map<CardInstanceId, UnitSlotLocation>();
  for (const instance of Object.values(state.card_instances)) {
    if (instance.zone === 'board' && instance.board_half && instance.lane && instance.position) {
      const def = state.card_definitions[instance.card_id];
      map.set(instance.card_instance_id, {
        half: instance.board_half,
        lane: instance.lane,
        position: instance.position,
        attackType: def?.attack_type === 'ranged' ? 'ranged' : 'melee',
        name: def?.card_name_zh ?? instance.card_id,
      });
    }
  }
  return map;
}

export function getBeatDurationMs(baseMs: number, mode: AnimationSpeedMode): number {
  if (mode === 'off') return 0;
  if (mode === 'slow') return baseMs * 2;
  if (mode === 'fast') return Math.max(80, Math.round(baseMs * 0.5));
  return baseMs;
}

export function getCssAnimationScale(mode: AnimationSpeedMode): number {
  if (mode === 'slow') return 2;
  if (mode === 'fast') return 0.5;
  if (mode === 'off') return 0;
  return 1;
}

interface MutableVisualCursor {
  players: {
    player_a: GameState['players']['player_a'];
    player_b: GameState['players']['player_b'];
  };
  card_instances: Record<CardInstanceId, CardInstance>;
  readonly templateState: GameState;
}

function createVisualCursor(prevState: GameState, nextState: GameState): MutableVisualCursor {
  const clonedInstances: Record<CardInstanceId, CardInstance> = {};
  for (const [id, inst] of Object.entries(nextState.card_instances) as [CardInstanceId, CardInstance][]) {
    clonedInstances[id] = inst;
  }
  // 还原双方在上一状态中仍在场上的单位及其血量/护盾/SP，保证攻击命中前不提前剧透血量变化与退场
  for (const [id, prevInst] of Object.entries(prevState.card_instances) as [CardInstanceId, CardInstance][]) {
    if (prevInst.zone === 'board' && prevInst.operator_combat) {
      clonedInstances[id] = {
        ...prevInst,
        operator_combat: {
          ...prevInst.operator_combat,
          current_atk_modifiers: [...prevInst.operator_combat.current_atk_modifiers],
          statuses: [...prevInst.operator_combat.statuses],
          equipment_ids: [...prevInst.operator_combat.equipment_ids],
        },
        operator_lifecycle: prevInst.operator_lifecycle ? { ...prevInst.operator_lifecycle } : undefined,
      };
    }
  }

  return {
    players: {
      player_a: {
        ...nextState.players.player_a,
        base_points: prevState.players.player_a.base_points,
      },
      player_b: {
        ...nextState.players.player_b,
        base_points: prevState.players.player_b.base_points,
      },
    },
    card_instances: clonedInstances,
    templateState: nextState,
  };
}

function snapshotVisualCursor(cursor: MutableVisualCursor): GameState {
  const instancesCopy: Record<CardInstanceId, CardInstance> = {};
  for (const [id, inst] of Object.entries(cursor.card_instances) as [CardInstanceId, CardInstance][]) {
    instancesCopy[id] = inst.operator_combat
      ? {
          ...inst,
          operator_combat: {
            ...inst.operator_combat,
            current_atk_modifiers: [...inst.operator_combat.current_atk_modifiers],
            statuses: [...inst.operator_combat.statuses],
            equipment_ids: [...inst.operator_combat.equipment_ids],
          },
        }
      : inst;
  }

  return {
    ...cursor.templateState,
    players: {
      player_a: { ...cursor.players.player_a },
      player_b: { ...cursor.players.player_b },
    },
    card_instances: instancesCopy,
  };
}

function applyEventToCursor(cursor: MutableVisualCursor, event: CombatLogEvent, nextState: GameState): void {
  if (event.type === 'unit_deployed' && event.source_instance_id) {
    const finalInst = nextState.card_instances[event.source_instance_id];
    if (finalInst) {
      cursor.card_instances[event.source_instance_id] = finalInst;
    }
    return;
  }

  if (event.type === 'unit_withdrawn' && event.source_instance_id) {
    const finalInst = nextState.card_instances[event.source_instance_id];
    if (finalInst) {
      cursor.card_instances[event.source_instance_id] = finalInst;
    } else {
      const prev = cursor.card_instances[event.source_instance_id];
      if (prev) {
        cursor.card_instances[event.source_instance_id] = {
          ...prev,
          zone: 'hand',
          board_half: null,
          lane: null,
          position: null,
        };
      }
    }
    return;
  }

  if (event.type === 'shield_absorbed' && event.target_instance_id && (event.amount ?? 0) > 0) {
    const target = cursor.card_instances[event.target_instance_id];
    if (target?.operator_combat) {
      cursor.card_instances[event.target_instance_id] = {
        ...target,
        operator_combat: {
          ...target.operator_combat,
          shield: Math.max(0, target.operator_combat.shield - (event.amount ?? 0)),
        },
      };
    }
    return;
  }

  if (event.type === 'damage_resolved' && event.target_instance_id) {
    const target = cursor.card_instances[event.target_instance_id];
    const dmg = event.amount ?? 0;
    if (target?.operator_combat) {
      cursor.card_instances[event.target_instance_id] = {
        ...target,
        operator_combat: {
          ...target.operator_combat,
          current_hp: Math.max(0, target.operator_combat.current_hp - dmg) as HpValue,
        },
      };
    }
    return;
  }

  if (event.type === 'healed' && event.target_instance_id && (event.amount ?? 0) > 0) {
    const target = cursor.card_instances[event.target_instance_id];
    const def = target ? cursor.templateState.card_definitions[target.card_id] : undefined;
    const maxHp = def?.hp ?? 99;
    if (target?.operator_combat) {
      cursor.card_instances[event.target_instance_id] = {
        ...target,
        operator_combat: {
          ...target.operator_combat,
          current_hp: Math.min(maxHp, target.operator_combat.current_hp + (event.amount ?? 0)) as HpValue,
        },
      };
    }
    return;
  }

  if (event.type === 'sp_gained' && event.target_instance_id && (event.amount ?? 0) > 0) {
    const target = cursor.card_instances[event.target_instance_id];
    const def = target ? cursor.templateState.card_definitions[target.card_id] : undefined;
    const maxSp = def?.max_sp ?? 99;
    if (target?.operator_combat) {
      cursor.card_instances[event.target_instance_id] = {
        ...target,
        operator_combat: {
          ...target.operator_combat,
          current_sp: Math.min(maxSp, target.operator_combat.current_sp + (event.amount ?? 0)) as SpValue,
        },
      };
    }
    return;
  }

  if (event.type === 'unit_defeated' && event.target_instance_id) {
    const finalInst = nextState.card_instances[event.target_instance_id];
    if (finalInst && finalInst.zone !== 'board') {
      cursor.card_instances[event.target_instance_id] = finalInst;
    } else {
      const target = cursor.card_instances[event.target_instance_id];
      if (target) {
        cursor.card_instances[event.target_instance_id] = {
          ...target,
          zone: 'discard',
          board_half: null,
          lane: null,
          position: null,
        };
      }
    }
    return;
  }

  if (event.type === 'base_damaged') {
    const defender = event.target_player_id ?? event.player_id;
    const dmg = event.amount ?? 0;
    if (defender && dmg > 0) {
      cursor.players[defender] = {
        ...cursor.players[defender],
        base_points: Math.max(0, cursor.players[defender].base_points - dmg) as BasePoints,
      };
    }
  }
}

interface MutableBeatBuilder {
  id: string;
  durationMs: number;
  phase: PresentationBeat['phase'];
  visualState?: GameState;
  deployedSlots: Set<SlotKey>;
  deployedUnits: Record<CardInstanceId, boolean>;
  attackingUnits: Record<CardInstanceId, 'up' | 'down'>;
  hitUnits: Record<CardInstanceId, boolean>;
  skillUnits: Record<CardInstanceId, boolean>;
  laneStrikes: LaneStrikeCue[];
  floatingPopups: FloatingPopup[];
  ghostCues: SlotGhostCue[];
  baseDamage: { ally?: number; enemy?: number };
  turnBanner?: TurnBannerCue;
  hasContent: boolean;
}

function createMutableBeat(
  id: string,
  durationMs = 460,
  phase: PresentationBeat['phase'] = 'impact',
): MutableBeatBuilder {
  return {
    id,
    durationMs,
    phase,
    deployedSlots: new Set<SlotKey>(),
    deployedUnits: {},
    attackingUnits: {},
    hitUnits: {},
    skillUnits: {},
    laneStrikes: [],
    floatingPopups: [],
    ghostCues: [],
    baseDamage: {},
    hasContent: false,
  };
}

function freezeBeat(builder: MutableBeatBuilder): PresentationBeat {
  return {
    id: builder.id,
    durationMs: builder.durationMs,
    phase: builder.phase,
    visualState: builder.visualState,
    deployedSlots: Array.from(builder.deployedSlots),
    deployedUnits: builder.deployedUnits,
    attackingUnits: builder.attackingUnits,
    hitUnits: builder.hitUnits,
    skillUnits: builder.skillUnits,
    laneStrikes: builder.laneStrikes,
    floatingPopups: builder.floatingPopups,
    ghostCues: builder.ghostCues,
    baseDamage: builder.baseDamage,
    turnBanner: builder.turnBanner,
  };
}

/**
 * 纯函数演出适配层：仅消费真实引擎 CombatLogEvent 与状态快照，绝不修改或延迟任何游戏规则。
 * 采用「先路径攻击演出（保持受击前 HP）→ 后命中扣血与退场（更新受击后 HP）」两段式节拍，
 * 让玩家清晰看清每次攻击路径并避免在攻击前提前显示扣血结果。
 */
export function buildPresentationBeats(params: {
  readonly prevState: GameState | null;
  readonly nextState: GameState;
  readonly newEvents: readonly CombatLogEvent[];
  readonly prevPositions: ReadonlyMap<CardInstanceId, UnitSlotLocation>;
  readonly bottomPlayer: PlayerId;
  readonly speedMode: AnimationSpeedMode;
}): readonly PresentationBeat[] {
  const { prevState, nextState, newEvents, prevPositions, bottomPlayer, speedMode } = params;

  if (speedMode === 'off') {
    return [];
  }

  const nextPositions = captureBoardPositions(nextState);
  const resolveLoc = (id?: CardInstanceId): UnitSlotLocation | undefined => {
    if (!id) return undefined;
    return nextPositions.get(id) ?? prevPositions.get(id);
  };

  const cursor = prevState ? createVisualCursor(prevState, nextState) : null;
  const beats: MutableBeatBuilder[] = [];
  let current = createMutableBeat(`beat-init-${nextState.state_version}`, 440, 'impact');
  let activeStrikeCue: LaneStrikeCue | null = null;

  const flushCurrent = () => {
    if (current.hasContent) {
      if (cursor && !current.visualState) {
        current.visualState = snapshotVisualCursor(cursor);
      }
      beats.push(current);
      current = createMutableBeat(`beat-${nextState.state_version}-${beats.length}`, 460, 'impact');
    }
  };

  for (const event of newEvents) {
    const seqId = `seq-${event.sequence}`;

    if (event.type === 'attack_declared') {
      if (current.hasContent) {
        flushCurrent();
      }
      activeStrikeCue = null;

      const attackerLoc = resolveLoc(event.source_instance_id);
      const targetLoc = resolveLoc(event.target_instance_id);
      if (attackerLoc && event.source_instance_id) {
        const direction: 'up' | 'down' = attackerLoc.half === bottomPlayer ? 'up' : 'down';
        const enemyHalf: PlayerId = attackerLoc.half === 'player_a' ? 'player_b' : 'player_a';
        const baseCue: LaneStrikeCue = {
          id: `strike-${seqId}`,
          lane: attackerLoc.lane,
          attackType: attackerLoc.attackType,
          direction,
          attackerSlotKey: makeSlotKey(attackerLoc.half, attackerLoc.lane, attackerLoc.position),
          targetSlotKey: targetLoc ? makeSlotKey(targetLoc.half, targetLoc.lane, targetLoc.position) : undefined,
          targetHalf: targetLoc?.half ?? enemyHalf,
          targetLane: targetLoc?.lane ?? attackerLoc.lane,
          toBase: !event.target_instance_id,
          kind: 'attack',
          phase: 'strike',
        };

        // 第 1 拍：攻击路径发射/突进阶段（此时 visualState 保持受击前 HP，不剧透扣血）
        const strikeBeat = createMutableBeat(`beat-strike-${seqId}`, 520, 'strike');
        if (cursor) {
          strikeBeat.visualState = snapshotVisualCursor(cursor);
        }
        strikeBeat.attackingUnits[event.source_instance_id] = direction;
        strikeBeat.laneStrikes.push(baseCue);
        strikeBeat.hasContent = true;
        beats.push(strikeBeat);

        // 第 2 拍：准备命中阶段（后续伤害、护盾、退场事件将应用到 cursor 并附带在 impactBeat 上）
        activeStrikeCue = { ...baseCue, phase: 'impact' };
        current = createMutableBeat(`beat-impact-${seqId}`, 480, 'impact');
        current.laneStrikes.push(activeStrikeCue);
      }
      continue;
    }

    if (event.type === 'unit_deployed') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const targetId = event.source_instance_id;
      const loc = resolveLoc(targetId);
      const slotKey =
        loc
          ? makeSlotKey(loc.half, loc.lane, loc.position)
          : event.source_player_id && event.lane && event.position
            ? makeSlotKey(event.source_player_id, event.lane, event.position)
            : undefined;
      if (slotKey) {
        current.phase = 'deploy';
        current.deployedSlots.add(slotKey);
        if (targetId) current.deployedUnits[targetId] = true;
        current.floatingPopups.push({
          id: `pop-${seqId}`,
          kind: 'deploy',
          label: '部署入场',
          slotKey,
          unitId: targetId,
        });
        current.durationMs = Math.max(current.durationMs, 380);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'unit_withdrawn') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const targetId = event.source_instance_id;
      const loc = resolveLoc(targetId);
      const slotKey =
        loc
          ? makeSlotKey(loc.half, loc.lane, loc.position)
          : event.source_player_id && event.lane && event.position
            ? makeSlotKey(event.source_player_id, event.lane, event.position)
            : undefined;
      if (slotKey) {
        current.phase = 'withdraw';
        current.ghostCues.push({
          id: `ghost-${seqId}`,
          slotKey,
          kind: 'withdraw',
          name: event.source_name ?? loc?.name ?? '干员',
        });
        current.floatingPopups.push({
          id: `pop-${seqId}`,
          kind: 'status',
          label: '↩ 撤离',
          slotKey,
          unitId: targetId,
        });
        current.durationMs = Math.max(current.durationMs, 400);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'skill_activated' || event.type === 'reaction_triggered' || event.type === 'effect_triggered') {
      const srcLoc = resolveLoc(event.source_instance_id);
      const tgtLoc = resolveLoc(event.target_instance_id);
      if (event.source_instance_id && srcLoc && tgtLoc && event.target_instance_id !== event.source_instance_id && !activeStrikeCue) {
        // 若技能有明确的跨格目标，先播一段技能光束指向目标，再结算效果
        if (current.hasContent) {
          flushCurrent();
        }
        const castBeat = createMutableBeat(`beat-skill-cast-${seqId}`, 440, 'strike');
        if (cursor) {
          castBeat.visualState = snapshotVisualCursor(cursor);
        }
        castBeat.skillUnits[event.source_instance_id] = true;
        castBeat.laneStrikes.push({
          id: `skill-path-${seqId}`,
          lane: srcLoc.lane,
          attackType: 'ranged',
          direction: srcLoc.half === bottomPlayer ? 'up' : 'down',
          attackerSlotKey: makeSlotKey(srcLoc.half, srcLoc.lane, srcLoc.position),
          targetSlotKey: makeSlotKey(tgtLoc.half, tgtLoc.lane, tgtLoc.position),
          targetHalf: tgtLoc.half,
          targetLane: tgtLoc.lane,
          toBase: false,
          kind: 'skill',
          phase: 'strike',
        });
        castBeat.floatingPopups.push({
          id: `pop-skill-${seqId}`,
          kind: 'skill',
          label: event.skill_name ? `⚡ ${event.skill_name}` : '⚡ 效果',
          slotKey: makeSlotKey(srcLoc.half, srcLoc.lane, srcLoc.position),
          unitId: event.source_instance_id,
        });
        castBeat.hasContent = true;
        beats.push(castBeat);
        continue;
      }

      if (event.source_instance_id && srcLoc) {
        current.skillUnits[event.source_instance_id] = true;
        current.floatingPopups.push({
          id: `pop-skill-${seqId}`,
          kind: 'skill',
          label: event.skill_name ? `⚡ ${event.skill_name}` : '⚡ 效果',
          slotKey: makeSlotKey(srcLoc.half, srcLoc.lane, srcLoc.position),
          unitId: event.source_instance_id,
        });
        current.hasContent = true;
      }
      if (event.target_instance_id && event.target_instance_id !== event.source_instance_id && tgtLoc) {
        current.skillUnits[event.target_instance_id] = true;
        current.hasContent = true;
      }
      current.durationMs = Math.max(current.durationMs, 420);
      continue;
    }

    if (event.type === 'shield_absorbed') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id && (event.amount ?? 0) > 0) {
        current.floatingPopups.push({
          id: `pop-shd-${seqId}`,
          kind: 'shield',
          label: `🛡 -${event.amount}`,
          slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
          unitId: event.target_instance_id,
        });
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'damage_resolved') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id) {
        current.hitUnits[event.target_instance_id] = true;
        const dmg = event.amount ?? 0;
        if (dmg > 0 || (event.absorbed ?? 0) === 0) {
          current.floatingPopups.push({
            id: `pop-dmg-${seqId}`,
            kind: 'damage',
            label: `-${dmg}`,
            slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
            unitId: event.target_instance_id,
          });
        }
        current.durationMs = Math.max(current.durationMs, 480);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'healed') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id && (event.amount ?? 0) > 0) {
        current.floatingPopups.push({
          id: `pop-heal-${seqId}`,
          kind: 'heal',
          label: `+${event.amount}`,
          slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
          unitId: event.target_instance_id,
        });
        current.durationMs = Math.max(current.durationMs, 440);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'sp_gained') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id && (event.amount ?? 0) > 0) {
        current.floatingPopups.push({
          id: `pop-sp-${seqId}`,
          kind: 'sp',
          label: `+${event.amount} SP`,
          slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
          unitId: event.target_instance_id,
        });
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'status_applied') {
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id) {
        current.floatingPopups.push({
          id: `pop-st-${seqId}`,
          kind: 'status',
          label: event.detail.includes('冻结')
            ? '❄ 冻结'
            : event.detail.includes('眩晕')
              ? '💫 眩晕'
              : event.detail.includes('减速')
                ? '⏳ 减速'
                : '⚓ 状态',
          slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
          unitId: event.target_instance_id,
        });
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'unit_defeated') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const loc = resolveLoc(event.target_instance_id);
      if (loc) {
        const slotKey = makeSlotKey(loc.half, loc.lane, loc.position);
        current.ghostCues.push({
          id: `ghost-dead-${seqId}`,
          slotKey,
          kind: 'defeat',
          name: event.target_name ?? loc.name,
        });
        current.durationMs = Math.max(current.durationMs, 500);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'base_damaged') {
      if (cursor) applyEventToCursor(cursor, event, nextState);
      const defender = event.target_player_id ?? event.player_id;
      const dmg = event.amount ?? 0;
      if (defender && dmg > 0) {
        if (defender === bottomPlayer) {
          current.baseDamage.ally = (current.baseDamage.ally ?? 0) + dmg;
        } else {
          current.baseDamage.enemy = (current.baseDamage.enemy ?? 0) + dmg;
        }
        current.durationMs = Math.max(current.durationMs, 500);
        current.hasContent = true;
      }
    }
  }

  flushCurrent();

  // 检查双方基地 HP 是否发生事件日志之外的直接变化（防御性补全）
  if (prevState && beats.length === 0) {
    const allyDiff = prevState.players[bottomPlayer].base_points - nextState.players[bottomPlayer].base_points;
    const topPlayer: PlayerId = bottomPlayer === 'player_a' ? 'player_b' : 'player_a';
    const enemyDiff = prevState.players[topPlayer].base_points - nextState.players[topPlayer].base_points;
    if (allyDiff > 0 || enemyDiff > 0) {
      const fallback = createMutableBeat(`beat-base-${nextState.state_version}`, 480, 'impact');
      fallback.visualState = nextState;
      if (allyDiff > 0) fallback.baseDamage.ally = allyDiff;
      if (enemyDiff > 0) fallback.baseDamage.enemy = enemyDiff;
      fallback.hasContent = true;
      beats.push(fallback);
    }
  }

  // 若回合归属或回合数切换且对局尚未结束，追加非阻塞回合切换横幅提示
  const turnSwitched =
    prevState !== null &&
    nextState.phase !== 'finished' &&
    nextState.phase !== 'mulligan' &&
    (prevState.active_player_id !== nextState.active_player_id || prevState.turn_number !== nextState.turn_number);

  if (turnSwitched) {
    const bannerBeat = createMutableBeat(`beat-turn-${nextState.state_version}`, 520, 'turn');
    bannerBeat.visualState = nextState;
    bannerBeat.turnBanner = {
      id: `turn-${nextState.turn_number}-${nextState.active_player_id}-${nextState.state_version}`,
      actor: nextState.active_player_id,
      turnNumber: nextState.turn_number,
    };
    bannerBeat.hasContent = true;
    beats.push(bannerBeat);
  }

  // 若队列过长（极端场面），合并超出部分到最后一帧避免拖慢交互
  let normalized = beats.map(freezeBeat);
  if (normalized.length > MAX_QUEUED_BEATS) {
    const head = normalized.slice(0, MAX_QUEUED_BEATS - 1);
    const tail = normalized.slice(MAX_QUEUED_BEATS - 1);
    const lastTurnBanner = tail.find((b) => b.turnBanner)?.turnBanner;
    const mergedPopups = tail.flatMap((b) => b.floatingPopups).slice(-8);
    const mergedGhosts = tail.flatMap((b) => b.ghostCues);
    const mergedAllyBase = tail.reduce((s, b) => s + (b.baseDamage.ally ?? 0), 0);
    const mergedEnemyBase = tail.reduce((s, b) => s + (b.baseDamage.enemy ?? 0), 0);
    head.push({
      id: `beat-coalesced-${nextState.state_version}`,
      durationMs: 480,
      phase: 'impact',
      visualState: nextState,
      deployedSlots: tail.flatMap((b) => b.deployedSlots),
      deployedUnits: Object.assign({}, ...tail.map((b) => b.deployedUnits)),
      attackingUnits: Object.assign({}, ...tail.map((b) => b.attackingUnits)),
      hitUnits: Object.assign({}, ...tail.map((b) => b.hitUnits)),
      skillUnits: Object.assign({}, ...tail.map((b) => b.skillUnits)),
      laneStrikes: tail.flatMap((b) => b.laneStrikes),
      floatingPopups: mergedPopups,
      ghostCues: mergedGhosts,
      baseDamage: {
        ...(mergedAllyBase > 0 ? { ally: mergedAllyBase } : {}),
        ...(mergedEnemyBase > 0 ? { enemy: mergedEnemyBase } : {}),
      },
      turnBanner: lastTurnBanner,
    });
    normalized = head;
  }

  return normalized.map((beat) => ({
    ...beat,
    durationMs: getBeatDurationMs(beat.durationMs, speedMode),
  }));
}
