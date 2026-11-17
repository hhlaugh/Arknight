import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LocalGameController } from './client/localGameController';
import type { LocalGameSetup } from './client/localGameController';
import { OnlineMatchController, type OnlineMatchSnapshot } from './client/onlineMatchController';
import { BotPlayer, botMulliganChoice } from './ai/botPlayer';
import { enumerateLegalActions } from './game/legal-actions';
import { DEMO_CARDS, getAllAvailableDecks } from './client/gameData';
import { AuthView } from './views/AuthView';
import { StartView } from './views/StartView';
import { DeckSelectView } from './views/DeckSelectView';
import { DeckEditorView } from './views/DeckEditorView';
import { CardLibraryView } from './views/CardLibraryView';
import { MulliganView } from './views/MulliganView';
import { BattleView } from './views/BattleView';
import { SettlementView } from './views/SettlementView';
import { RecruitmentView } from './views/RecruitmentView';
import { RoomLobbyView } from './views/RoomLobbyView';
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import { SettingsModal } from './components/ui/SettingsModal';
import { awardBattleReward, getActiveAccountName, getDeckMode } from './data/player-collection';
import { getAuthSession, isAuthenticated, logoutAccount } from './data/auth-store';
import { useAppSettings } from './data/app-settings';
import { playTacticalSfx, setBgmScene, type BgmScene } from './audio/bgmPlayer';
import type { CardInstanceId, DeckDefinition, PlayerId } from './game/types';

type Screen = 'auth' | 'title' | 'deckSelect' | 'game' | 'online' | 'deckEditor' | 'library' | 'recruitment';
type Mode = 'hotseat' | 'vs-bot' | 'online';

interface BattleReward {
  readonly originite: number;
  readonly accountName: string;
}


function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => (isAuthenticated() ? 'title' : 'auth'));
  const [mode, setMode] = useState<Mode>('hotseat');
  const [controller, setController] = useState<LocalGameController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onlineController = useMemo(() => new OnlineMatchController(), []);
  const onlineSnapshot = useSyncExternalStore(onlineController.subscribe, onlineController.getSnapshot);
  const appSettings = useAppSettings();

  const isInBattleScene =
    screen === 'game' ||
    ((mode === 'online' || screen === 'online') && onlineSnapshot.inGame);
  const bgmScene: BgmScene =
    screen === 'auth' ? 'auth' : isInBattleScene ? 'battle' : 'lobby';

  useEffect(() => {
    setBgmScene(bgmScene);
  }, [bgmScene]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.scanlineFx = appSettings.scanlineFxEnabled ? 'on' : 'off';
    document.documentElement.dataset.combatVfx = appSettings.combatVfxEnabled ? 'on' : 'off';
  }, [appSettings.scanlineFxEnabled, appSettings.combatVfxEnabled]);

  const handleOpenSettings = () => {
    playTacticalSfx('click');
    setSettingsOpen(true);
  };

  const handleLogout = () => {
    onlineController.leaveRoom();
    setController(null);
    setMode('hotseat');
    logoutAccount();
    setScreen('auth');
  };

  const activeSession = screen !== 'auth' ? getAuthSession() : null;

  let content: React.ReactNode;

  if (screen === 'auth') {
    content = (
      <AuthView
        onAuthenticated={() => setScreen('title')}
        onOpenSettings={handleOpenSettings}
      />
    );
  } else if (screen === 'library') {
    content = (
      <CardLibraryView
        onBack={() => setScreen('title')}
        onOpenDeckEditor={() => setScreen('deckEditor')}
      />
    );
  } else if (screen === 'recruitment') {
    content = (
      <RecruitmentView
        onBack={() => setScreen('title')}
        onOpenDeckEditor={() => setScreen('deckEditor')}
      />
    );
  } else if (screen === 'deckEditor') {
    content = <DeckEditorView onBack={() => setScreen('title')} />;
  } else if (screen === 'title') {
    content = (
      <StartView
        onHotseat={() => {
          setMode('hotseat');
          setScreen('deckSelect');
        }}
        onVsBot={() => {
          setMode('vs-bot');
          setScreen('deckSelect');
        }}
        onOnline={() => {
          setMode('online');
          setScreen('online');
        }}
        onDeckEditor={() => {
          setScreen('deckEditor');
        }}
        onLibrary={() => {
          setScreen('library');
        }}
        onRecruitment={() => {
          setScreen('recruitment');
        }}
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
      />
    );
  } else if (mode === 'online' || screen === 'online') {
    content = (
      <OnlineScreen
        controller={onlineController}
        snapshot={onlineSnapshot}
        onOpenSettings={handleOpenSettings}
        onExit={() => {
          onlineController.leaveRoom();
          setScreen('title');
        }}
      />
    );
  } else if (screen === 'deckSelect' || !controller) {
    content = (
      <DeckSelectView
        mode={mode}
        onCancel={() => setScreen('title')}
        onOpenDeckEditor={() => setScreen('deckEditor')}
        onStart={(setup: LocalGameSetup) => {
          setController(LocalGameController.create(setup));
          setScreen('game');
        }}
      />
    );
  } else {
    content = (
      <GameScreen
        controller={controller}
        mode={mode}
        botSeat="player_b"
        onOpenSettings={handleOpenSettings}
        onExit={() => {
          setController(null);
          setScreen('title');
        }}
        onRestart={() => setController(LocalGameController.create({ ...controller.getSetup(), seed: randomSeed() }))}
      />
    );
  }

  return (
    <>
      {content}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activeUsername={screen !== 'auth' ? getActiveAccountName() : activeSession?.username ?? null}
        onLogout={screen !== 'auth' ? handleLogout : undefined}
      />
    </>
  );
}

interface GameScreenProps {
  readonly controller: LocalGameController;
  readonly mode: Mode;
  readonly botSeat: PlayerId;
  readonly onOpenSettings: () => void;
  readonly onExit: () => void;
  readonly onRestart: () => void;
}

function GameScreen({ controller, mode, botSeat, onOpenSettings, onExit, onRestart }: GameScreenProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const state = snapshot.state;
  const [reward, setReward] = useState<BattleReward | null>(null);
  const rewardGrantedRef = useRef(false);
  const bot = useMemo(
    () => (mode === 'vs-bot' ? new BotPlayer({ player: botSeat, log: (message) => console.info(message) }) : null),
    [mode, botSeat, controller],
  );

  // 新对局重置奖励发放标记（再来一局 = 新 controller 实例）。
  useEffect(() => {
    rewardGrantedRef.current = false;
    setReward(null);
  }, [controller]);

  // 对局结束发放合成玉（每局一次）：vs-bot 按玩家 A（人类）胜负；热座非平局按胜档计入活跃账户。
  useEffect(() => {
    if (state.phase !== 'finished' || rewardGrantedRef.current) return;
    rewardGrantedRef.current = true;
    const result: 'win' | 'lose' | 'draw' =
      mode === 'vs-bot'
        ? state.winner === 'player_a'
          ? 'win'
          : state.winner === 'draw'
            ? 'draw'
            : 'lose'
        : state.winner === 'draw'
          ? 'draw'
          : 'win';
    const originite = awardBattleReward(result);
    setReward({ originite, accountName: getActiveAccountName() });
  }, [state.phase, state.winner, mode]);

  // 机器人自动起手换牌。
  useEffect(() => {
    if (!bot || state.phase !== 'mulligan' || state.mulligan_completed[botSeat]) return;
    const nextPlayer: PlayerId = state.mulligan_completed.player_a ? 'player_b' : 'player_a';
    if (nextPlayer !== botSeat) return;
    const timer = window.setTimeout(() => {
      controller.submitMulligan(botSeat, botMulliganChoice(controller.getSnapshot().state, botSeat));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [bot, botSeat, controller, state]);

  // 机器人行动驱动：到达机器人决策点（行动阶段 / 回合开始支援选择）时自动出招。
  useEffect(() => {
    if (!bot) return;
    const current = snapshot.state;
    const botToAct =
      current.active_player_id === botSeat &&
      current.phase !== 'finished' &&
      current.phase !== 'mulligan' &&
      (current.phase === 'action' || (current.phase === 'turn_start' && current.turn_start_prepared && current.pending_effect_choices.length > 0));
    if (!botToAct) return;
    const timer = window.setTimeout(() => {
      const decisionState = controller.getSnapshot().state;
      try {
        const action = bot.decide(decisionState);
        const result = controller.dispatch(botSeat, action);
        if (!result.ok) {
          bot.noteFallback(`动作被拒绝：${result.reason ?? '未知原因'}`);
          console.warn(`机器人动作被引擎拒绝（${result.reason}），回退到首个合法动作。`);
          const fallback = enumerateLegalActions(decisionState, botSeat)[0];
          if (fallback) controller.dispatch(botSeat, fallback);
        }
      } catch (error) {
        console.error('机器人决策异常：', error);
        bot.noteFallback('决策异常');
        const fallback = enumerateLegalActions(decisionState, botSeat)[0];
        if (fallback) controller.dispatch(botSeat, fallback);
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [bot, botSeat, controller, snapshot]);

  if (state.phase === 'mulligan') {
    const nextPlayer: PlayerId = state.mulligan_completed.player_a ? 'player_b' : 'player_a';
    if (bot && nextPlayer === botSeat) {
      return (
        <MulliganView
          key={`waiting-${botSeat}`}
          state={state}
          playerId={botSeat}
          deckName={controller.getSetup().decks[botSeat].deck_name_zh}
          waitingForOpponent
          onConfirm={() => ({ ok: true })}
          onLeave={onExit}
        />
      );
    }
    return (
      <MulliganView
        key={nextPlayer}
        state={state}
        playerId={nextPlayer}
        deckName={controller.getSetup().decks[nextPlayer].deck_name_zh}
        onConfirm={(selected: readonly CardInstanceId[]) => controller.submitMulligan(nextPlayer, selected)}
        onLeave={onExit}
      />
    );
  }

  if (state.phase === 'finished') {
    return (
      <SettlementView
        snapshot={snapshot}
        setup={controller.getSetup()}
        modeLabel={mode === 'vs-bot' ? '模式：单人对战（机器人 · 普通难度）' : '模式：本地热座（双人）'}
        reward={reward}
        onRestart={onRestart}
        onExit={onExit}
      />
    );
  }

  return (
    <BattleView
      snapshot={snapshot}
      controller={controller}
      humanPlayer={mode === 'vs-bot' ? (botSeat === 'player_b' ? 'player_a' : 'player_b') : null}
      onExit={onExit}
      onOpenSettings={onOpenSettings}
    />
  );
}

interface OnlineScreenProps {
  readonly controller: OnlineMatchController;
  readonly snapshot: OnlineMatchSnapshot;
  readonly onOpenSettings: () => void;
  readonly onExit: () => void;
}

function OnlineScreen({ controller, snapshot, onOpenSettings, onExit }: OnlineScreenProps) {
  const [reward, setReward] = useState<BattleReward | null>(null);
  const rewardRoomRef = useRef<string | null>(null);
  const mySeat: PlayerId = snapshot.seat === 'host' ? 'player_a' : 'player_b';

  // P2P 对局结束按本地席位结果发放合成玉（每个房间只发一次）。
  useEffect(() => {
    if (!snapshot.inGame || !snapshot.gameSnapshot) return;
    if (snapshot.gameSnapshot.state.phase !== 'finished') return;
    const roomKey = snapshot.roomCode ?? 'unknown-room';
    if (rewardRoomRef.current === roomKey) return;
    rewardRoomRef.current = roomKey;
    const winner = snapshot.gameSnapshot.state.winner;
    const result: 'win' | 'lose' | 'draw' = winner === 'draw' ? 'draw' : winner === mySeat ? 'win' : 'lose';
    const originite = awardBattleReward(result);
    setReward({ originite, accountName: getActiveAccountName() });
  }, [snapshot, mySeat]);

  // If not yet in game, show room lobby
  if (!snapshot.inGame || !snapshot.gameSnapshot) {
    return <RoomLobbyView controller={controller} snapshot={snapshot} onBackToTitle={onExit} />;
  }

  const gameSnapshot = snapshot.gameSnapshot;
  const state = gameSnapshot.state;

  const allDecks = getAllAvailableDecks(getDeckMode());
  const deckA: DeckDefinition = allDecks.find((d) => d.deck_id === snapshot.hostDeckId) ?? allDecks[0]!;
  const deckB: DeckDefinition = allDecks.find((d) => d.deck_id === snapshot.guestDeckId) ?? allDecks[1] ?? deckA;

  const setup: LocalGameSetup = {
    decks: { player_a: deckA, player_b: deckB },
    cards: DEMO_CARDS,
    seed: 0,
  };

  if (state.phase === 'mulligan') {
    const myDone = state.mulligan_completed[mySeat];
    if (myDone) {
      return (
        <MulliganView
          key={`waiting-${mySeat}`}
          state={state}
          playerId={mySeat}
          deckName={mySeat === 'player_a' ? deckA.deck_name_zh : deckB.deck_name_zh}
          waitingForOpponent
          onConfirm={() => ({ ok: true })}
          onLeave={() => {
            controller.leaveRoom();
            onExit();
          }}
        />
      );
    }
    return (
      <MulliganView
        key={mySeat}
        state={state}
        playerId={mySeat}
        deckName={mySeat === 'player_a' ? deckA.deck_name_zh : deckB.deck_name_zh}
        onConfirm={(selected: readonly CardInstanceId[]) => controller.submitMulligan(selected)}
        onLeave={() => {
          controller.leaveRoom();
          onExit();
        }}
      />
    );
  }

  if (state.phase === 'finished') {
    return (
      <SettlementView
        snapshot={gameSnapshot}
        setup={setup}
        modeLabel={`模式：好友联机对战（房间码：${snapshot.roomCode} · 你执${mySeat === 'player_a' ? '玩家 A' : '玩家 B'}）`}
        reward={reward}
        onRestart={() => controller.leaveRoom()}
        onExit={() => {
          controller.leaveRoom();
          onExit();
        }}
      />
    );
  }

  return (
    <>
      <BattleView
        snapshot={gameSnapshot}
        onDispatch={(action) => controller.dispatchAction(action)}
        humanPlayer={mySeat}
        onExit={() => {
          controller.leaveRoom();
          onExit();
        }}
        onOpenSettings={onOpenSettings}
        networkStatus={{
          isOnline: true,
          roomCode: snapshot.roomCode ?? '',
          seat: snapshot.seat ?? 'host',
          opponentConnected: snapshot.opponentConnected,
          pausedForGuest: snapshot.pausedForGuest,
          onLeaveRoom: () => {
            controller.leaveRoom();
            onExit();
          },
        }}
      />

      <Modal
        isOpen={Boolean(snapshot.closedReason)}
        onClose={() => {
          controller.leaveRoom();
          onExit();
        }}
        title="对局已中断"
        codeName="NET.CLOSE"
        size="sm"
        footer={
          <Button
            variant="primary"
            size="md"
            cornerCut
            onClick={() => {
              controller.leaveRoom();
              onExit();
            }}
          >
            返回标题页
          </Button>
        }
      >
        <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
          <p className="m-0">
            {snapshot.closedReason === 'HOST_LEFT'
              ? '房主已主动退出房间。'
              : snapshot.closedReason === 'HOST_TIMEOUT'
                ? '房主断线超时，对局已释放。'
                : snapshot.closedReason === 'GUEST_LEFT'
                  ? '访客已主动放弃对局。'
                  : snapshot.closedReason === 'GUEST_TIMEOUT'
                    ? '访客断线超时未恢复。'
                    : `房间已关闭：${snapshot.closedReason}`}
          </p>
          <p className="m-0 text-slate-400">对局已结束，请返回标题页。</p>
        </div>
      </Modal>
    </>
  );
}

export default App;
