import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BottomSheet } from './BottomSheet';
import { PlayerHandDock } from '../battle/PlayerHandDock';
import { UnitView } from '../battle/UnitView';
import { CardFrame } from '../cards/CardFrame';
import { LocalGameController } from '../../client/localGameController';
import { DEMO_CARDS, PRESET_DECKS } from '../../client/gameData';
import type { CardId } from '../../game/types';

describe('Phase 3: 移动端独立布局、抽屉组件与多比例响应式适配测试', () => {
  it('BottomSheet: 当 isOpen 为 false 时不渲染任何 DOM 内容', () => {
    const html = renderToString(
      <BottomSheet isOpen={false} onClose={() => {}} title="战斗日志">
        <div>日志内容</div>
      </BottomSheet>,
    );
    expect(html).toBe('');
  });

  it('BottomSheet: 当 isOpen 为 true 时渲染抽屉标题、代号与内容', () => {
    const html = renderToString(
      <BottomSheet isOpen={true} onClose={() => {}} title="干员战术档案" codeName="OP-VAN-001">
        <div data-testid="drawer-body">干员属性与技能详情</div>
      </BottomSheet>,
    );
    expect(html).toContain('干员战术档案');
    expect(html).toContain('OP-VAN-001');
    expect(html).toContain('干员属性与技能详情');
    expect(html).toContain('max-h-[85dvh]');
  });

  it('BottomSheet: 具有用于拖动/关闭的把手与关闭按钮', () => {
    const html = renderToString(
      <BottomSheet isOpen={true} onClose={() => {}} title="战术指令">
        <button type="button">撤离干员</button>
      </BottomSheet>,
    );
    expect(html).toContain('cursor-grab');
    expect(html).toContain('✕');
    expect(html).toContain('撤离干员');
  });

  it('PlayerHandDock: 支持竖屏 bottom 与横屏 side-rail 双模式渲染', () => {
    const ctrl = LocalGameController.create({
      decks: { player_a: PRESET_DECKS[0], player_b: PRESET_DECKS[1] },
      cards: DEMO_CARDS,
      seed: 202609,
    });
    ctrl.submitMulligan('player_a', []);
    ctrl.submitMulligan('player_b', []);
    const state = ctrl.getSnapshot().state;
    const actor = state.active_player_id;

    const sideRailHtml = renderToString(
      <PlayerHandDock
        state={state}
        bottomPlayer={actor}
        actor={actor}
        canAct
        isActionPhase
        hasPending={false}
        isHotseat={false}
        isMobile
        isLandscape
        layoutMode="side-rail"
        selection={null}
        draggingCardId={null}
        onHandCardClick={() => {}}
        onLongPressCard={() => {}}
        onHoverCard={() => {}}
        onDragStartCard={() => {}}
        onDragEndCard={() => {}}
        onEndActionPhase={() => {}}
      />,
    );
    expect(sideRailHtml).toContain('data-testid="player-hand-dock"');
    expect(sideRailHtml).toContain('grid-cols-2');
    expect(sideRailHtml).toContain('结束行动');

    const bottomHtml = renderToString(
      <PlayerHandDock
        state={state}
        bottomPlayer={actor}
        actor={actor}
        canAct
        isActionPhase
        hasPending={false}
        isHotseat={false}
        isMobile
        layoutMode="bottom"
        selection={null}
        draggingCardId={null}
        onHandCardClick={() => {}}
        onLongPressCard={() => {}}
        onHoverCard={() => {}}
        onDragStartCard={() => {}}
        onDragEndCard={() => {}}
        onEndActionPhase={() => {}}
      />,
    );
    expect(bottomHtml).toContain('data-testid="player-hand-dock"');
    expect(bottomHtml).toContain('结束行动');
  });

  it('UnitView 与 CardFrame: 正确支持紧凑尺寸变体 compact', () => {
    const ctrl = LocalGameController.create({
      decks: { player_a: PRESET_DECKS[0], player_b: PRESET_DECKS[1] },
      cards: DEMO_CARDS,
      seed: 202610,
    });
    ctrl.submitMulligan('player_a', []);
    ctrl.submitMulligan('player_b', []);
    const state = ctrl.getSnapshot().state;
    const actor = state.active_player_id;
    const unitId = state.players[actor].hand.find(
      (id) => state.card_definitions[state.card_instances[id].card_id]?.card_type === 'operator',
    )!;
    const unitInst = {
      ...state.card_instances[unitId],
      zone: 'board' as const,
      board_half: actor,
      lane: 'center' as const,
      position: 'front' as const,
      operator_combat: {
        current_hp: 8,
        current_atk_modifiers: [],
        current_sp: 1,
        shield: 0,
        statuses: [],
        equipment_ids: [],
      },
    };

    const compactUnitHtml = renderToString(
      <UnitView
        state={{ ...state, card_instances: { ...state.card_instances, [unitId]: unitInst } }}
        instance={unitInst}
        highlight="none"
        compact
      />,
    );
    expect(compactUnitHtml).toContain('h-[54px]');

    const compactCardHtml = renderToString(
      <CardFrame
        cardId={'OP-VAN-001' as CardId}
        definition={{
          card_id: 'OP-VAN-001' as CardId,
          card_name_zh: '芬',
          card_type: 'operator',
          cost: 2,
          rarity: 3,
          atk: 3,
          hp: 12,
        }}
        variant="compact"
      />,
    );
    expect(compactCardHtml).toContain('h-[106px]');
  });
});
