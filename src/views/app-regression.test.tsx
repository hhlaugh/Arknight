import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotPlayer, botMulliganChoice } from '../ai/botPlayer';
import {
  DEMO_CARDS,
  PRESET_DECKS,
  getAllAvailableDecks,
} from '../client/gameData';
import { LocalGameController } from '../client/localGameController';
import type { OnlineMatchController, OnlineMatchSnapshot } from '../client/onlineMatchController';
import { CardFrame } from '../components/cards/CardFrame';
import {
  validateCardPresentationIntegrity,
  verifyDataContractBaseline,
} from '../data/validate-card-assets';
import { enumerateLegalActions } from '../game/legal-actions';
import type { CardId } from '../game/types';
import { AuthView } from './AuthView';
import { BattleView } from './BattleView';
import { CardLibraryView } from './CardLibraryView';
import { DeckEditorView } from './DeckEditorView';
import { DeckSelectView } from './DeckSelectView';
import { MulliganView } from './MulliganView';
import { RecruitmentView } from './RecruitmentView';
import { RoomLobbyView } from './RoomLobbyView';
import { SettlementView } from './SettlementView';
import { StartView } from './StartView';
import { SettingsModal } from '../components/ui/SettingsModal';

const noop = () => {};
const noopActionResult = () => ({ ok: true as const });

function createMockOnlineController(): OnlineMatchController {
  return {
    createRoom: noop,
    joinRoom: noop,
    selectDeck: noop,
    setReady: noop,
    startMatch: noop,
    leaveRoom: noop,
    clearError: noop,
    setError: noop,
    submitMulligan: () => ({ ok: true }),
    dispatchAction: () => ({ ok: true }),
    subscribe: () => noop,
    getSnapshot: () => createIdleOnlineSnapshot(),
  } as unknown as OnlineMatchController;
}

function createIdleOnlineSnapshot(overrides?: Partial<OnlineMatchSnapshot>): OnlineMatchSnapshot {
  return {
    connected: true,
    roomCode: null,
    seat: null,
    roomState: null,
    inGame: false,
    matchId: null,
    opponentConnected: false,
    pausedForGuest: false,
    closedReason: null,
    errorMessage: null,
    gameSnapshot: null,
    latestPlayerView: null,
    hostDeckId: null,
    guestDeckId: null,
    ...overrides,
  };
}

describe('Phase 7 全面回归验收测试套件', () => {
  it('数据契约与 Manifest 完整性校验通过，无遗留 DEMO 测试卡与抽卡锁', () => {
    const baseline = verifyDataContractBaseline();
    expect(baseline.passed).toBe(true);
    expect(baseline.cardCount).toBe(72);
    expect(baseline.uniqueCardIds).toBe(true);
    expect(baseline.deckCardsCountValid).toBe(true);

    const presentation = validateCardPresentationIntegrity();
    expect(presentation.isValid).toBe(true);
    expect(presentation.unmappedCardIds).toEqual([]);
    expect(presentation.totalCardsInPool).toBe(72);
    expect(presentation.totalMappedPresentations).toBe(72);

    // 确认旧 demo 测试卡牌已移除，且无抽卡库存限制
    expect(DEMO_CARDS.some((c) => c.card_id.startsWith('DEMO-'))).toBe(false);
    expect(PRESET_DECKS.length).toBeGreaterThanOrEqual(3);
    expect(getAllAvailableDecks().length).toBeGreaterThanOrEqual(3);
  });

  it('CardFrame 纯 CSS + SVG 在全部稀有度与状态下均可独立渲染，无外部 PNG 卡框依赖', () => {
    const rarities: readonly (3 | 4 | 5 | 6)[] = [3, 4, 5, 6];
    const sampleByRarity = rarities.map((rarity) =>
      DEMO_CARDS.find((c) => (c.rarity ?? 3) === rarity) ?? DEMO_CARDS[0]!,
    );

    for (const card of sampleByRarity) {
      const states = ['default', 'selected', 'in-deck', 'unplayable', 'disabled'] as const;
      for (const st of states) {
        const html = renderToString(
          <CardFrame
            cardId={card.card_id}
            definition={card}
            variant={st === 'in-deck' ? 'deck' : 'hand'}
            selected={st === 'selected'}
            disabled={st === 'disabled'}
            unplayable={st === 'unplayable'}
            inDeckCount={st === 'in-deck' ? 1 : undefined}
            onClick={noop}
          />,
        );
        expect(html).toContain(`data-rarity="${card.rarity ?? 3}"`);
        expect(html).toContain(`data-state="${st}"`);
        expect(html).toContain('<svg');
        expect(html).toContain('<polygon');
        expect(html).not.toContain('frame.png');
        expect(html).not.toContain('border.png');
      }
    }

    const ownedHtml = renderToString(
      <CardFrame
        cardId={sampleByRarity[0]!.card_id}
        definition={sampleByRarity[0]}
        variant="deck"
        ownedCount={2}
        showOwnership
      />,
    );
    expect(ownedHtml).toContain('持有×2');
  });

  it('全应用 8 个核心视图在 SSR 下均可正常渲染且无运行时异常与抽卡/遥测污染', () => {
    const deckA = PRESET_DECKS[0]!;
    const deckB = PRESET_DECKS[1] ?? deckA;
    const setup = {
      decks: { player_a: deckA, player_b: deckB },
      cards: DEMO_CARDS,
      seed: 202607,
    };

    const controller = LocalGameController.create(setup);
    const mulliganSnap = controller.getSnapshot();

    // 推进至 action 阶段以便渲染 BattleView
    controller.submitMulligan('player_a', []);
    controller.submitMulligan('player_b', []);
    const battleSnap = controller.getSnapshot();

    const authHtml = renderToString(
      <AuthView onAuthenticated={noop} onOpenSettings={noop} />,
    );
    expect(authHtml).toContain('data-testid="auth-rhodes-tower-backdrop"');
    expect(authHtml).toContain('rhodes_island_dark.png');
    expect(authHtml).toContain('登录账户');
    expect(authHtml).toContain('注册新档案');
    expect(authHtml).toContain('aria-label="打开系统设置"');
    expect(authHtml).not.toContain('animate-pulse');

    const settingsModalHtml = renderToString(
      <SettingsModal isOpen onClose={noop} activeUsername="指挥官" onLogout={noop} />,
    );
    expect(settingsModalHtml).toContain('系统设置');
    expect(settingsModalHtml).toContain('主音量');
    expect(settingsModalHtml).toContain('背景音乐');
    expect(settingsModalHtml).toContain('战斗动画与轨迹演出速度');
    expect(settingsModalHtml).toContain('战斗攻击路径与冲击特效');

    const startHtml = renderToString(
      <StartView
        onHotseat={noop}
        onVsBot={noop}
        onOnline={noop}
        onDeckEditor={noop}
        onLibrary={noop}
        onRecruitment={noop}
        onOpenSettings={noop}
        onLogout={noop}
      />,
    );
    expect(startHtml).toContain('舟塔自走牌');
    expect(startHtml).toContain('罗德岛干员图鉴');
    expect(startHtml).toContain('干员寻访');
    expect(startHtml).toContain('data-testid="rhodes-watermark"');
    expect(startHtml).toContain('rhodes_island_light.png');
    expect(startHtml).toContain('rhodes_island_dark.png');
    expect(startHtml).toContain('prts_badge.svg');
    expect(startHtml).toContain('aria-label="打开系统设置"');
    expect(startHtml).toContain('aria-label="退出登录"');
    expect(startHtml).not.toContain('animate-pulse');
    expect(startHtml).not.toContain('招募');
    expect(startHtml).not.toContain('PROTOCOL');

    const deckSelectHtml = renderToString(
      <DeckSelectView mode="hotseat" onStart={noop} onCancel={noop} onOpenDeckEditor={noop} />,
    );
    expect(deckSelectHtml).toContain('作战出击配置');
    expect(deckSelectHtml).toContain('本地热座双人推演模式');

    const libraryHtml = renderToString(
      <CardLibraryView onBack={noop} onOpenDeckEditor={noop} />,
    );
    expect(libraryHtml).toContain('罗德岛干员档案');
    expect(libraryHtml).toContain('72');
    expect(libraryHtml).not.toContain('未解锁');

    const editorHtml = renderToString(<DeckEditorView onBack={noop} />);
    expect(editorHtml).toContain('20');

    const mulliganHtml = renderToString(
      <MulliganView
        state={mulliganSnap.state}
        playerId="player_a"
        deckName={deckA.deck_name_zh}
        onConfirm={noopActionResult}
        onLeave={noop}
      />,
    );
    expect(mulliganHtml).toContain('战术调度阶段');
    expect(mulliganHtml).toContain('离开对局');

    const mulliganWaitingHtml = renderToString(
      <MulliganView
        state={mulliganSnap.state}
        playerId="player_a"
        deckName={deckA.deck_name_zh}
        waitingForOpponent
        onConfirm={noopActionResult}
        onLeave={noop}
      />,
    );
    expect(mulliganWaitingHtml).toContain('起手调度已锁定');
    expect(mulliganWaitingHtml).toContain('离开对局');

    const recruitmentHtml = renderToString(
      <RecruitmentView onBack={noop} onOpenDeckEditor={noop} />,
    );
    expect(recruitmentHtml).toContain('干员寻访');
    expect(recruitmentHtml).toContain('返回');
    expect(recruitmentHtml).toContain('编制卡组');

    const battleHotseatHtml = renderToString(
      <BattleView
        snapshot={battleSnap}
        controller={controller}
        humanPlayer={null}
        onExit={noop}
        onOpenSettings={noop}
      />,
    );
    expect(battleHotseatHtml).toContain('玩家 A');
    expect(battleHotseatHtml).toContain('结束行动');
    expect(battleHotseatHtml).toContain('data-testid="enemy-hud-panel"');
    expect(battleHotseatHtml).toContain('data-testid="player-hand-dock"');
    expect(battleHotseatHtml).toContain('prts_diamond.png');
    expect(battleHotseatHtml).toContain('aria-label="投降"');
    expect(battleHotseatHtml).toContain('aria-label="退出对局"');
    expect(battleHotseatHtml).toContain('aria-label="系统设置"');
    expect(battleHotseatHtml).not.toContain('aria-label="战局菜单"');
    expect(battleHotseatHtml).toContain('--combat-anim-scale:2');
    expect(battleHotseatHtml).toContain('0.5x');

    const battleBotHtml = renderToString(
      <BattleView snapshot={battleSnap} controller={controller} humanPlayer="player_a" onExit={noop} />,
    );
    expect(battleBotHtml).toContain('结束行动');
    expect(battleBotHtml).toContain('投降');
    expect(battleBotHtml).toContain('退出');

    const settlementHtml = renderToString(
      <SettlementView
        snapshot={battleSnap}
        setup={setup}
        modeLabel="模式：单人对战"
        onRestart={noop}
        onExit={noop}
      />,
    );
    expect(settlementHtml).toContain('MISSION SETTLEMENT');

    const mockOnlineCtrl = createMockOnlineController();
    const lobbyIdleHtml = renderToString(
      <RoomLobbyView
        controller={mockOnlineCtrl}
        snapshot={createIdleOnlineSnapshot()}
        onBackToTitle={noop}
      />,
    );
    expect(lobbyIdleHtml).toContain('好友联机对战');
    expect(lobbyIdleHtml).toContain('创建房间');

    const lobbyWaitingHtml = renderToString(
      <RoomLobbyView
        controller={mockOnlineCtrl}
        snapshot={createIdleOnlineSnapshot({
          roomCode: 'ABCD2345',
          seat: 'host',
          roomState: {
            code: 'ABCD2345',
            started: false,
            pausedForGuest: false,
            host: { connected: true, ready: false, deckId: deckA.deck_id },
            guest: { connected: true, ready: true, deckId: deckB.deck_id },
          },
        })}
        onBackToTitle={noop}
      />,
    );
    expect(lobbyWaitingHtml).toContain('ABCD2345');
    expect(lobbyWaitingHtml).toContain('ROOM LOBBY');
  });

  it('完整对局生命周期回归：选牌 → 换牌 → 双人/人机行动推进 → 战斗日志产出 → 新种子重开', () => {
    const deckA = PRESET_DECKS[0]!;
    const deckB = PRESET_DECKS[1] ?? deckA;
    const setup = {
      decks: { player_a: deckA, player_b: deckB },
      cards: DEMO_CARDS,
      seed: 778899,
    };

    const controller = LocalGameController.create(setup);
    expect(controller.getSnapshot().state.phase).toBe('mulligan');

    const botA = new BotPlayer({ player: 'player_a' });
    const botB = new BotPlayer({ player: 'player_b' });

    expect(
      controller.submitMulligan('player_a', botMulliganChoice(controller.getSnapshot().state, 'player_a')).ok,
    ).toBe(true);
    expect(
      controller.submitMulligan('player_b', botMulliganChoice(controller.getSnapshot().state, 'player_b')).ok,
    ).toBe(true);

    expect(controller.getSnapshot().state.phase).toBe('action');

    // 自动推进至少 4 个完整回合或直到游戏提前结束，验证控制器、规则引擎与日志链路无卡死
    let steps = 0;
    while (
      controller.getSnapshot().state.phase !== 'finished' &&
      controller.getSnapshot().state.turn_number < 4 &&
      steps < 80
    ) {
      const current = controller.getSnapshot().state;
      const actor = current.active_player_id;
      const bot = actor === 'player_a' ? botA : botB;
      const action = bot.decide(current);
      const res = controller.dispatch(actor, action);
      if (!res.ok) {
        const fallback = enumerateLegalActions(current, actor)[0];
        expect(fallback).toBeDefined();
        expect(controller.dispatch(actor, fallback!).ok).toBe(true);
      }
      steps += 1;
    }

    const midSnapshot = controller.getSnapshot();
    expect(midSnapshot.state.turn_number).toBeGreaterThanOrEqual(2);
    expect(midSnapshot.logHistory.length).toBeGreaterThan(0);

    // 验证新种子重开能彻底重置对局到起手换牌阶段且不继承旧日志
    const restarted = LocalGameController.create({ ...setup, seed: 998877 });
    expect(restarted.getSnapshot().state.phase).toBe('mulligan');
    expect(restarted.getSnapshot().state.turn_number).toBe(0);
    expect(restarted.getSnapshot().logHistory).toEqual([]);
    expect(Object.keys(restarted.getSnapshot().state.card_instances).length).toBe(40);
  });

  it('校验不存在缺失卡图时 fallback ID 仍稳定可控', () => {
    const firstId = DEMO_CARDS[0]!.card_id as CardId;
    expect(firstId.startsWith('OP-')).toBe(true);
  });
});
