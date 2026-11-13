import { reduceGameAction } from '../../game/engine';
import { enumerateLegalActions, LANES, POSITIONS } from '../../game/legal-actions';
import type {
  CardDefinition,
  CardInstance,
  CardInstanceId,
  GameState,
  LaneId,
  PlayerId,
  Position,
} from '../../game/types';

export interface AttackPreviewResult {
  readonly attackerId?: CardInstanceId;
  readonly lane: LaneId;
  readonly controllerId: PlayerId;
  readonly primaryTargetId: CardInstanceId | null;
  readonly tauntBlocked: boolean;
  readonly attacksBase: boolean;
  readonly cannotAttackReason: string | null;
  readonly laneSlots: readonly { readonly half: PlayerId; readonly lane: LaneId; readonly position: Position }[];
}

function hasStatus(instance: CardInstance, kind: string): boolean {
  return Boolean(instance.operator_combat?.statuses.some((status) => status.kind === kind));
}

function isDisabled(instance: CardInstance): boolean {
  return hasStatus(instance, 'freeze') || hasStatus(instance, 'stun');
}

function isGrounded(state: GameState, instance: CardInstance): boolean {
  if (hasStatus(instance, 'grounded')) return true;
  const def = state.card_definitions[instance.card_id];
  return def?.floating !== true || isDisabled(instance);
}

function isLegalCombatTarget(state: GameState, candidate: CardInstance, attackerDef: CardDefinition): boolean {
  const def = state.card_definitions[candidate.card_id];
  if (!def || def.card_type !== 'operator' || !candidate.operator_combat || isDisabled(candidate)) {
    return false;
  }
  return def.floating !== true || isGrounded(state, candidate) || attackerDef.attack_type === 'ranged';
}

function canIntercept(state: GameState, candidate: CardInstance): boolean {
  return Boolean(
    candidate.zone === 'board' &&
      candidate.operator_combat &&
      !isDisabled(candidate) &&
      isGrounded(state, candidate),
  );
}

/**
 * 与 src/game/combat.ts 100% 对齐的攻击目标与航道预览选择器（只读，不产生副作用）。
 * 支持已部署单位或悬停待部署格子预演。
 */
export function previewAttackTargets(
  state: GameState,
  source:
    | { readonly kind: 'unit'; readonly instance: CardInstance }
    | {
        readonly kind: 'draft';
        readonly cardInstanceId: CardInstanceId;
        readonly controllerId: PlayerId;
        readonly lane: LaneId;
        readonly position: Position;
      },
): AttackPreviewResult | null {
  const controllerId = source.kind === 'unit' ? source.instance.controller_id : source.controllerId;
  const lane = source.kind === 'unit' ? source.instance.lane : source.lane;
  if (!lane) return null;

  const instance =
    source.kind === 'unit' ? source.instance : state.card_instances[source.cardInstanceId];
  if (!instance) return null;

  const attackerDef = state.card_definitions[instance.card_id];
  if (!attackerDef || attackerDef.card_type !== 'operator') return null;

  const enemyHalf: PlayerId = controllerId === 'player_a' ? 'player_b' : 'player_a';
  const laneSlots = [
    { half: enemyHalf, lane, position: 'front' as const },
    { half: enemyHalf, lane, position: 'back' as const },
  ];

  let cannotAttackReason: string | null = null;
  if (source.kind === 'unit') {
    if (hasStatus(instance, 'freeze')) {
      cannotAttackReason = '当前处于冻结状态，本回合跳过攻击';
    } else if (hasStatus(instance, 'stun')) {
      cannotAttackReason = '当前处于眩晕状态，本回合跳过攻击';
    } else if (instance.operator_lifecycle?.entered_battle_this_owner_turn) {
      cannotAttackReason = '本回合刚部署，将在下一次行动后参与交锋';
    }
  } else {
    cannotAttackReason = '部署当回合不会立刻攻击，下回合按此路径索敌';
  }

  const enemyBoard = Object.values(state.card_instances).filter(
    (candidate) =>
      candidate.zone === 'board' &&
      candidate.controller_id !== controllerId &&
      isLegalCombatTarget(state, candidate, attackerDef),
  );

  const posRank = (candidate: CardInstance) => (candidate.position === 'front' ? 0 : 1);
  const stableSort = (a: CardInstance, b: CardInstance) =>
    posRank(a) - posRank(b) || a.card_instance_id.localeCompare(b.card_instance_id);

  const taunts = enemyBoard.filter((candidate) => {
    if (hasStatus(candidate, 'freeze')) return false;
    const targetDef = state.card_definitions[candidate.card_id];
    return (
      targetDef?.taunt_scope === 'all_lanes' ||
      (candidate.lane === lane && targetDef?.taunt_scope === 'same_lane')
    );
  });

  if (taunts.length > 0) {
    const primary = taunts.sort(stableSort)[0];
    return {
      attackerId: source.kind === 'unit' ? source.instance.card_instance_id : undefined,
      lane,
      controllerId,
      primaryTargetId: primary.card_instance_id,
      tauntBlocked: true,
      attacksBase: false,
      cannotAttackReason,
      laneSlots,
    };
  }

  const sameLaneEnemies = enemyBoard.filter((candidate) => candidate.lane === lane);
  const groundEnemies = sameLaneEnemies.filter((candidate) => canIntercept(state, candidate));
  const frontTarget = groundEnemies.filter((candidate) => candidate.position === 'front').sort(stableSort)[0];
  if (frontTarget) {
    return {
      attackerId: source.kind === 'unit' ? source.instance.card_instance_id : undefined,
      lane,
      controllerId,
      primaryTargetId: frontTarget.card_instance_id,
      tauntBlocked: false,
      attacksBase: false,
      cannotAttackReason,
      laneSlots,
    };
  }

  const backTarget = groundEnemies.filter((candidate) => candidate.position === 'back').sort(stableSort)[0];
  if (backTarget) {
    return {
      attackerId: source.kind === 'unit' ? source.instance.card_instance_id : undefined,
      lane,
      controllerId,
      primaryTargetId: backTarget.card_instance_id,
      tauntBlocked: false,
      attacksBase: false,
      cannotAttackReason,
      laneSlots,
    };
  }

  if (attackerDef.attack_type === 'ranged') {
    const floatingTarget = sameLaneEnemies
      .filter((candidate) => {
        const d = state.card_definitions[candidate.card_id];
        return d?.floating === true && !isGrounded(state, candidate);
      })
      .sort(stableSort)[0];
    if (floatingTarget) {
      return {
        attackerId: source.kind === 'unit' ? source.instance.card_instance_id : undefined,
        lane,
        controllerId,
        primaryTargetId: floatingTarget.card_instance_id,
        tauntBlocked: false,
        attacksBase: false,
        cannotAttackReason,
        laneSlots,
      };
    }
  }

  return {
    attackerId: source.kind === 'unit' ? source.instance.card_instance_id : undefined,
    lane,
    controllerId,
    primaryTargetId: null,
    tauntBlocked: false,
    attacksBase: true,
    cannotAttackReason,
    laneSlots,
  };
}

/**
 * 直接向引擎 reduceGameAction 查询在目标格子部署手牌失败的权威原因，不在 UI 中重复编写业务规则。
 */
export function getInvalidDeployReason(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
  half: PlayerId,
  lane: LaneId,
  position: Position,
): string | null {
  if (half !== actorId) {
    return '只能部署在己方半区阵位。';
  }
  const result = reduceGameAction(state, actorId, {
    type: 'deploy_operator',
    card_instance_id: cardInstanceId,
    lane,
    position,
  });
  return result.ok ? null : result.reason;
}

/**
 * 直接向引擎 reduceGameAction / enumerateLegalActions 查询手牌当前不可打出的真实原因。
 */
export function getInvalidCardReason(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
): string | null {
  const instance = state.card_instances[cardInstanceId];
  if (!instance) return '找不到卡牌实例。';
  const definition = state.card_definitions[instance.card_id];
  if (!definition) return '找不到卡牌定义。';

  const legal = enumerateLegalActions(state, actorId);
  if (
    legal.some(
      (action) =>
        (action.type === 'deploy_operator' || action.type === 'play_card') &&
        action.card_instance_id === cardInstanceId,
    )
  ) {
    return null;
  }

  if (definition.card_type === 'operator') {
    const preferredPositions: readonly Position[] =
      definition.deploy_rule === 'back_only' || (definition.deploy_rule === undefined && definition.attack_type === 'ranged') || definition.floating
        ? ['back', 'front']
        : ['front', 'back'];

    let firstReason: string | null = null;
    for (const position of preferredPositions) {
      for (const lane of LANES) {
        const res = reduceGameAction(state, actorId, {
          type: 'deploy_operator',
          card_instance_id: cardInstanceId,
          lane,
          position,
        });
        if (!res.ok) {
          if (!firstReason) firstReason = res.reason;
          if (res.reason !== '所选部署位已被占用。' && res.reason !== '干员不能部署在所选位置。') {
            return res.reason;
          }
        }
      }
    }
    return firstReason ?? '当前无法部署该干员。';
  }

  const directPlay = reduceGameAction(state, actorId, {
    type: 'play_card',
    card_instance_id: cardInstanceId,
  });
  if (!directPlay.ok) {
    if (
      directPlay.reason.includes('必须指定') ||
      directPlay.reason.includes('白名单效果并指定目标')
    ) {
      const boardUnits = Object.values(state.card_instances).filter((unit) => unit.zone === 'board');
      if (boardUnits.length === 0) {
        return '场上暂无符合条件的指定目标。';
      }
      return '场上当前没有合法的作用目标。';
    }
    return directPlay.reason;
  }
  return null;
}

/**
 * 查询在场单位主动技能或撤离不可执行时的权威引擎原因。
 */
export function getInvalidUnitActionReason(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
  actionType: 'activate_skill' | 'withdraw_operator',
): string | null {
  if (actionType === 'withdraw_operator') {
    const res = reduceGameAction(state, actorId, {
      type: 'withdraw_operator',
      card_instance_id: cardInstanceId,
    });
    return res.ok ? null : res.reason;
  }

  const res = reduceGameAction(state, actorId, {
    type: 'activate_skill',
    card_instance_id: cardInstanceId,
  });
  return res.ok ? null : res.reason;
}
