import type { LocalGameSnapshot } from '../../client/localGameController';
import type { CardId, CardInstanceId, CombatLogEvent, GameState, PlayerId } from '../../game/types';

export interface SideSettlementMetrics {
  readonly playerId: PlayerId;
  readonly baseHp: number;
  readonly deployments: number;
  readonly withdrawals: number;
  readonly damageDealt: number;
  readonly baseDamageDealt: number;
  readonly healingDone: number;
  readonly kills: number;
  readonly skillsActivated: number;
  readonly shieldAbsorbed: number;
  readonly turnsTaken: number;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
}

export interface MvpOperatorSummary {
  readonly cardId: CardId;
  readonly cardNameZh: string;
  readonly ownerId: PlayerId;
  readonly rarity: number;
  readonly damageDealt: number;
  readonly kills: number;
  readonly healingDone: number;
  readonly skillsActivated: number;
  readonly impactScore: number;
}

export interface SettlementSummary {
  readonly sides: Readonly<Record<PlayerId, SideSettlementMetrics>>;
  readonly mvp: MvpOperatorSummary | null;
  readonly totalEvents: number;
  readonly totalCombatEvents: number;
  readonly isEarlySurrender: boolean;
}

interface MutableSideMetrics {
  deployments: number;
  withdrawals: number;
  damageDealt: number;
  baseDamageDealt: number;
  healingDone: number;
  kills: number;
  skillsActivated: number;
  shieldAbsorbed: number;
}

interface OperatorAccumulator {
  readonly cardId: CardId;
  readonly cardNameZh: string;
  readonly ownerId: PlayerId;
  readonly rarity: number;
  damageDealt: number;
  kills: number;
  healingDone: number;
  skillsActivated: number;
}

function createEmptySide(): MutableSideMetrics {
  return {
    deployments: 0,
    withdrawals: 0,
    damageDealt: 0,
    baseDamageDealt: 0,
    healingDone: 0,
    kills: 0,
    skillsActivated: 0,
    shieldAbsorbed: 0,
  };
}

function resolveSourcePlayer(event: CombatLogEvent, state: GameState): PlayerId | null {
  if (event.source_player_id) return event.source_player_id;
  if (event.source_instance_id) {
    const inst = state.card_instances[event.source_instance_id];
    if (inst) return inst.owner_id;
  }
  if (event.player_id && event.type !== 'base_damaged') return event.player_id;
  return null;
}

function resolveTargetPlayer(event: CombatLogEvent, state: GameState): PlayerId | null {
  if (event.target_player_id) return event.target_player_id;
  if (event.target_instance_id) {
    const inst = state.card_instances[event.target_instance_id];
    if (inst) return inst.owner_id;
  }
  if (event.player_id && event.type === 'base_damaged') return event.player_id;
  return null;
}

/**
 * 从真实规则引擎状态与日志流中提炼双方对局数据与 MVP 干员。
 * 所有数值均由真实战斗事件聚合，不生成虚构指标。
 */
export function computeSettlementSummary(snapshot: LocalGameSnapshot): SettlementSummary {
  const { state, logHistory } = snapshot;
  const sideStats: Record<PlayerId, MutableSideMetrics> = {
    player_a: createEmptySide(),
    player_b: createEmptySide(),
  };

  const opStats = new Map<string, OperatorAccumulator>();
  const ensureOperator = (instanceId: CardInstanceId | undefined, fallbackOwner: PlayerId | null): OperatorAccumulator | null => {
    if (!instanceId) return null;
    const inst = state.card_instances[instanceId];
    if (!inst) return null;
    const def = state.card_definitions[inst.card_id];
    const key = `${inst.owner_id}:${inst.card_id}`;
    let acc = opStats.get(key);
    if (!acc) {
      acc = {
        cardId: inst.card_id,
        cardNameZh: def?.card_name_zh ?? inst.card_id,
        ownerId: fallbackOwner ?? inst.owner_id,
        rarity: def?.rarity ?? 3,
        damageDealt: 0,
        kills: 0,
        healingDone: 0,
        skillsActivated: 0,
      };
      opStats.set(key, acc);
    }
    return acc;
  };

  let totalCombatEvents = 0;

  for (const event of logHistory) {
    const srcPlayer = resolveSourcePlayer(event, state);
    const tgtPlayer = resolveTargetPlayer(event, state);

    switch (event.type) {
      case 'unit_deployed': {
        if (srcPlayer) sideStats[srcPlayer].deployments += 1;
        break;
      }
      case 'unit_withdrawn': {
        if (srcPlayer) sideStats[srcPlayer].withdrawals += 1;
        break;
      }
      case 'damage_resolved': {
        totalCombatEvents += 1;
        const dmg = typeof event.amount === 'number' ? event.amount : 0;
        if (srcPlayer) {
          sideStats[srcPlayer].damageDealt += dmg;
          const acc = ensureOperator(event.source_instance_id, srcPlayer);
          if (acc) acc.damageDealt += dmg;
        }
        break;
      }
      case 'base_damaged': {
        totalCombatEvents += 1;
        const dmg = typeof event.amount === 'number' ? event.amount : 0;
        if (srcPlayer) {
          sideStats[srcPlayer].damageDealt += dmg;
          sideStats[srcPlayer].baseDamageDealt += dmg;
          const acc = ensureOperator(event.source_instance_id, srcPlayer);
          if (acc) acc.damageDealt += dmg;
        }
        break;
      }
      case 'unit_defeated': {
        totalCombatEvents += 1;
        const killerSide =
          srcPlayer ??
          (tgtPlayer === 'player_a' ? 'player_b' : tgtPlayer === 'player_b' ? 'player_a' : null);
        if (killerSide) {
          sideStats[killerSide].kills += 1;
        }
        const acc = ensureOperator(event.source_instance_id, killerSide);
        if (acc) acc.kills += 1;
        break;
      }
      case 'skill_activated': {
        totalCombatEvents += 1;
        if (srcPlayer) {
          sideStats[srcPlayer].skillsActivated += 1;
          const acc = ensureOperator(event.source_instance_id, srcPlayer);
          if (acc) acc.skillsActivated += 1;
        }
        break;
      }
      case 'healed': {
        totalCombatEvents += 1;
        const heal = typeof event.amount === 'number' ? event.amount : 0;
        if (srcPlayer) {
          sideStats[srcPlayer].healingDone += heal;
          const acc = ensureOperator(event.source_instance_id, srcPlayer);
          if (acc) acc.healingDone += heal;
        }
        break;
      }
      case 'shield_absorbed': {
        const absorbed = typeof event.amount === 'number' ? event.amount : 0;
        if (tgtPlayer) {
          sideStats[tgtPlayer].shieldAbsorbed += absorbed;
        }
        break;
      }
      default:
        break;
    }
  }

  let mvp: MvpOperatorSummary | null = null;
  for (const acc of opStats.values()) {
    const impactScore = acc.damageDealt + acc.kills * 5 + acc.healingDone + acc.skillsActivated * 2;
    if (impactScore <= 0) continue;
    if (
      !mvp ||
      impactScore > mvp.impactScore ||
      (impactScore === mvp.impactScore && acc.damageDealt > mvp.damageDealt)
    ) {
      mvp = {
        ...acc,
        impactScore,
      };
    }
  }

  const buildSideSummary = (playerId: PlayerId): SideSettlementMetrics => {
    const pState = state.players[playerId];
    const s = sideStats[playerId];
    return {
      playerId,
      baseHp: pState.base_points,
      deployments: s.deployments,
      withdrawals: s.withdrawals,
      damageDealt: s.damageDealt,
      baseDamageDealt: s.baseDamageDealt,
      healingDone: s.healingDone,
      kills: s.kills,
      skillsActivated: s.skillsActivated,
      shieldAbsorbed: s.shieldAbsorbed,
      turnsTaken: pState.turns_taken,
      handCount: pState.hand.length,
      deckCount: pState.deck.length,
      discardCount: pState.discard.length,
    };
  };

  return {
    sides: {
      player_a: buildSideSummary('player_a'),
      player_b: buildSideSummary('player_b'),
    },
    mvp,
    totalEvents: logHistory.length,
    totalCombatEvents,
    isEarlySurrender: totalCombatEvents === 0 && logHistory.length === 0,
  };
}
