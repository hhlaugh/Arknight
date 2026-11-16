import type {
  CardInstanceId,
  CombatLogEvent,
  GameState,
  LaneId,
  PlayerId,
  Position,
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
  readonly toBase: boolean;
}

export interface TurnBannerCue {
  readonly id: string;
  readonly actor: PlayerId;
  readonly turnNumber: number;
}

export interface PresentationBeat {
  readonly id: string;
  readonly durationMs: number;
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

const MAX_QUEUED_BEATS = 10;

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

interface MutableBeatBuilder {
  id: string;
  durationMs: number;
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

function createMutableBeat(id: string, durationMs = 340): MutableBeatBuilder {
  return {
    id,
    durationMs,
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

  const beats: MutableBeatBuilder[] = [];
  let current = createMutableBeat(`beat-init-${nextState.state_version}`, 340);

  const flushCurrent = () => {
    if (current.hasContent) {
      beats.push(current);
      current = createMutableBeat(`beat-${nextState.state_version}-${beats.length}`, 350);
    }
  };

  for (const event of newEvents) {
    const seqId = `seq-${event.sequence}`;

    if (event.type === 'attack_declared') {
      // 每次新的 attack_declared 开启一个新的交锋节拍，形成清晰的依次结算节奏
      if (current.hasContent) {
        flushCurrent();
      }
      current.durationMs = 360;
      const attackerLoc = resolveLoc(event.source_instance_id);
      const targetLoc = resolveLoc(event.target_instance_id);
      if (attackerLoc && event.source_instance_id) {
        const direction: 'up' | 'down' = attackerLoc.half === bottomPlayer ? 'up' : 'down';
        current.attackingUnits[event.source_instance_id] = direction;
        current.laneStrikes.push({
          id: `strike-${seqId}`,
          lane: attackerLoc.lane,
          attackType: attackerLoc.attackType,
          direction,
          attackerSlotKey: makeSlotKey(attackerLoc.half, attackerLoc.lane, attackerLoc.position),
          targetSlotKey: targetLoc ? makeSlotKey(targetLoc.half, targetLoc.lane, targetLoc.position) : undefined,
          toBase: !event.target_instance_id,
        });
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'unit_deployed') {
      const targetId = event.source_instance_id;
      const loc = resolveLoc(targetId);
      const slotKey =
        loc
          ? makeSlotKey(loc.half, loc.lane, loc.position)
          : event.source_player_id && event.lane && event.position
            ? makeSlotKey(event.source_player_id, event.lane, event.position)
            : undefined;
      if (slotKey) {
        current.deployedSlots.add(slotKey);
        if (targetId) current.deployedUnits[targetId] = true;
        current.floatingPopups.push({
          id: `pop-${seqId}`,
          kind: 'deploy',
          label: '部署入场',
          slotKey,
          unitId: targetId,
        });
        current.durationMs = Math.max(current.durationMs, 320);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'unit_withdrawn') {
      const targetId = event.source_instance_id;
      const loc = resolveLoc(targetId);
      const slotKey =
        loc
          ? makeSlotKey(loc.half, loc.lane, loc.position)
          : event.source_player_id && event.lane && event.position
            ? makeSlotKey(event.source_player_id, event.lane, event.position)
            : undefined;
      if (slotKey) {
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
        current.durationMs = Math.max(current.durationMs, 340);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'skill_activated' || event.type === 'reaction_triggered' || event.type === 'effect_triggered') {
      const srcLoc = resolveLoc(event.source_instance_id);
      const tgtLoc = resolveLoc(event.target_instance_id);
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
      current.durationMs = Math.max(current.durationMs, 350);
      continue;
    }

    if (event.type === 'shield_absorbed') {
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
        current.durationMs = Math.max(current.durationMs, 380);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'healed') {
      const loc = resolveLoc(event.target_instance_id);
      if (loc && event.target_instance_id && (event.amount ?? 0) > 0) {
        current.floatingPopups.push({
          id: `pop-heal-${seqId}`,
          kind: 'heal',
          label: `+${event.amount}`,
          slotKey: makeSlotKey(loc.half, loc.lane, loc.position),
          unitId: event.target_instance_id,
        });
        current.durationMs = Math.max(current.durationMs, 360);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'sp_gained') {
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
      const loc = resolveLoc(event.target_instance_id);
      if (loc) {
        const slotKey = makeSlotKey(loc.half, loc.lane, loc.position);
        current.ghostCues.push({
          id: `ghost-dead-${seqId}`,
          slotKey,
          kind: 'defeat',
          name: event.target_name ?? loc.name,
        });
        current.durationMs = Math.max(current.durationMs, 400);
        current.hasContent = true;
      }
      continue;
    }

    if (event.type === 'base_damaged') {
      const defender = event.target_player_id ?? event.player_id;
      const dmg = event.amount ?? 0;
      if (defender && dmg > 0) {
        if (defender === bottomPlayer) {
          current.baseDamage.ally = (current.baseDamage.ally ?? 0) + dmg;
        } else {
          current.baseDamage.enemy = (current.baseDamage.enemy ?? 0) + dmg;
        }
        current.durationMs = Math.max(current.durationMs, 420);
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
      const fallback = createMutableBeat(`beat-base-${nextState.state_version}`, 400);
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
    const bannerBeat = createMutableBeat(`beat-turn-${nextState.state_version}`, 480);
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
      durationMs: 420,
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
