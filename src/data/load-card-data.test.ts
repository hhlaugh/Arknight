import { describe, expect, it } from 'vitest';
import { loadDemoData, summarizeValidation } from './load-card-data';

describe('loadDemoData', () => {
  it('loads all source cards and two complete preset decks without changing source records', () => {
    const result = loadDemoData();
    expect(result.cards).toHaveLength(72);
    expect(result.decks).toHaveLength(2);
    expect(result.decks.map((deck) => deck.cards.reduce((sum, item) => sum + item.quantity, 0))).toEqual([20, 20]);
    expect(result.issues.some((item) => item.code === 'UNKNOWN_EFFECT_ACTION' || item.code === 'UNKNOWN_EFFECT_TRIGGER')).toBe(false);
  });

  it('accepts corrected fields and keeps rapid withdrawal exemptions explicit', () => {
    const sampleRapid = {
      card_id: 'TEST-TAC-RAPID',
      card_name_zh: '快速撤离测试',
      card_type: 'tactic',
      rarity: 4,
      cost: 1,
      effect_trigger: 'on_play',
      effect_json: {
        trigger: 'on_play',
        actions: [
          {
            type: 'withdraw_operator',
            ignore_control_restriction: true,
            ignore_half_restriction: true,
            withdrawal_refund_policy: 'full_paid_cost',
          },
        ],
      },
    };
    const result = loadDemoData([sampleRapid], '');
    expect(result.issues).toEqual([]);
    expect(result.validCards).toHaveLength(1);
    const rapid = result.validCards[0];
    expect(rapid?.effect_json.actions[0]).toMatchObject({
      ignore_control_restriction: true,
      ignore_half_restriction: true,
      withdrawal_refund_policy: 'full_paid_cost',
    });
  });

  it('validates data whitelist values and deck references, size, and copy limits', () => {
    const badCards = [
      { card_id: 'BAD', card_name_zh: '坏卡', card_type: 'operator', rarity: 1, cost: 0,
        effect_trigger: 'execute_js', effect_json: { trigger: 'execute_js', actions: [{ type: 'run_code' }] } },
    ];
    const badCsv = [
      'deck_id,deck_name_zh,card_id,card_name_zh,quantity,total_deck_size,notes',
      'BAD-DECK,坏牌组,NO-SUCH-CARD,不存在,3,20,test',
    ].join('\n');
    const result = loadDemoData(badCards, badCsv);
    const codes = result.issues.map((item) => item.code);
    expect(codes).toContain('UNKNOWN_EFFECT_TRIGGER');
    expect(codes).toContain('UNKNOWN_EFFECT_ACTION');
    expect(codes).toContain('UNKNOWN_DECK_CARD');
    expect(codes).toContain('COPY_LIMIT_EXCEEDED');
    expect(codes).toContain('INVALID_DECK_SIZE');
  });

  it('rejects duplicate card IDs and confirms rapid withdrawal keeps both v0.7 exemptions explicit', () => {
    const duplicate = [...loadDemoData().cards];
    const firstCardId = (duplicate[0] as { card_id: string }).card_id;
    duplicate.push(duplicate[0]);
    const result = loadDemoData(duplicate);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_CARD_ID', recordId: firstCardId }));

    const sampleRapid = {
      card_id: 'TEST-TAC-RAPID',
      card_name_zh: '快速撤离测试',
      card_type: 'tactic',
      rarity: 4,
      cost: 1,
      effect_trigger: 'on_play',
      effect_json: {
        trigger: 'on_play',
        actions: [
          {
            type: 'withdraw_operator',
            ignore_control_restriction: true,
            ignore_half_restriction: true,
            withdrawal_refund_policy: 'full_paid_cost',
          },
        ],
      },
    };
    const rapidResult = loadDemoData([sampleRapid], '');
    const rapid = rapidResult.cards[0] as { effect_json: { actions: Array<Record<string, unknown>> } };
    expect(rapid.effect_json.actions[0]).toMatchObject({ ignore_control_restriction: true, ignore_half_restriction: true });
    expect(rapidResult.issues).not.toContainEqual(expect.objectContaining({ code: 'REFUND_POLICY_FIELD_MISMATCH', recordId: 'TEST-TAC-RAPID' }));
  });

  it('reports a clean card pool after aligning fields with the v0.7 data contract', () => {
    const result = loadDemoData();
    expect(summarizeValidation(result.issues)).toEqual({ errors: 0, warnings: 0 });
  });
});
