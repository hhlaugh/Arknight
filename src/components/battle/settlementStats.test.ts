import { describe, expect, it } from 'vitest';
import { BotPlayer, botMulliganChoice } from '../../ai/botPlayer';
import { DEMO_CARDS, PRESET_DECKS } from '../../client/gameData';
import { LocalGameController } from '../../client/localGameController';
import { enumerateLegalActions } from '../../game/legal-actions';
import { computeSettlementSummary } from './settlementStats';

describe('computeSettlementSummary 战后战果统计聚合', () => {
  it('零战斗事件立即结束时返回干净空态且不虚构 MVP', () => {
    const deckA = PRESET_DECKS[0]!;
    const deckB = PRESET_DECKS[1] ?? deckA;
    const controller = LocalGameController.create({
      decks: { player_a: deckA, player_b: deckB },
      cards: DEMO_CARDS,
      seed: 10101,
    });
    controller.submitMulligan('player_a', []);
    controller.submitMulligan('player_b', []);

    const summary = computeSettlementSummary(controller.getSnapshot());
    expect(summary.isEarlySurrender).toBe(true);
    expect(summary.mvp).toBeNull();
    expect(summary.sides.player_a.baseHp).toBe(20);
    expect(summary.sides.player_b.baseHp).toBe(20);
  });

  it('从多回合人机推演日志中准确聚合双方部署、伤害、击杀与 MVP 干员', () => {
    const deckA = PRESET_DECKS[0]!;
    const deckB = PRESET_DECKS[1] ?? deckA;
    const controller = LocalGameController.create({
      decks: { player_a: deckA, player_b: deckB },
      cards: DEMO_CARDS,
      seed: 202607,
    });

    controller.submitMulligan('player_a', botMulliganChoice(controller.getSnapshot().state, 'player_a'));
    controller.submitMulligan('player_b', botMulliganChoice(controller.getSnapshot().state, 'player_b'));

    const botA = new BotPlayer({ player: 'player_a' });
    const botB = new BotPlayer({ player: 'player_b' });

    let steps = 0;
    while (
      controller.getSnapshot().state.phase !== 'finished' &&
      controller.getSnapshot().state.turn_number < 6 &&
      steps < 120
    ) {
      const current = controller.getSnapshot().state;
      const actor = current.active_player_id;
      const bot = actor === 'player_a' ? botA : botB;
      const action = bot.decide(current);
      const res = controller.dispatch(actor, action);
      if (!res.ok) {
        const fallback = enumerateLegalActions(current, actor)[0];
        if (fallback) controller.dispatch(actor, fallback);
      }
      steps += 1;
    }

    const snap = controller.getSnapshot();
    const summary = computeSettlementSummary(snap);

    expect(summary.isEarlySurrender).toBe(false);
    expect(summary.totalEvents).toBe(snap.logHistory.length);
    expect(summary.sides.player_a.deployments + summary.sides.player_b.deployments).toBeGreaterThan(0);
    expect(summary.sides.player_a.damageDealt + summary.sides.player_b.damageDealt).toBeGreaterThan(0);
    expect(summary.mvp).not.toBeNull();
    expect(summary.mvp!.impactScore).toBeGreaterThan(0);
  });
});
