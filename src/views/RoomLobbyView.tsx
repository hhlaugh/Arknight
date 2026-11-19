import React, { useEffect, useState } from 'react';
import type { OnlineMatchController, OnlineMatchSnapshot } from '../client/onlineMatchController';
import { getAllAvailableDecks } from '../client/gameData';
import { getActiveAccountName, getDeckMode } from '../data/player-collection';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ScenicBackdrop, ScenicBannerLayer } from '../components/ui/ScenicBackdrop';

interface RoomLobbyViewProps {
  readonly controller: OnlineMatchController;
  readonly snapshot: OnlineMatchSnapshot;
  readonly onBackToTitle: () => void;
}

export function RoomLobbyView({ controller, snapshot, onBackToTitle }: RoomLobbyViewProps) {
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (snapshot.errorMessage || snapshot.roomCode) {
      setIsJoining(false);
      setIsCreating(false);
    }
  }, [snapshot.errorMessage, snapshot.roomCode]);

  const roomState = snapshot.roomState;
  const isHost = snapshot.seat === 'host';
  const isGuest = snapshot.seat === 'guest';
  const inRoom = Boolean(snapshot.roomCode);

  const myReady = isHost ? Boolean(roomState?.host.ready) : Boolean(roomState?.guest?.ready);

  const copyCode = async () => {
    if (!snapshot.roomCode) return;
    try {
      await navigator.clipboard?.writeText(snapshot.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      controller.setError(`自动复制受限，请手动复制房间码：${snapshot.roomCode}`);
    }
  };

  const handleSelectDeck = (deckId: string) => {
    controller.selectDeck(deckId);
  };

  const toggleReady = () => {
    controller.setReady(!myReady);
  };

  const handleStart = () => {
    controller.startMatch();
  };

  const handleLeave = () => {
    controller.leaveRoom();
  };

  const handleCreate = () => {
    setIsCreating(true);
    controller.createRoom();
    window.setTimeout(() => setIsCreating(false), 8000);
  };

  const handleJoin = () => {
    const code = inputCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length !== 8) {
      controller.setError(`房间码必须为 8 位字符（当前已输入 ${code.length} 位）。`);
      return;
    }
    controller.clearError();
    setIsJoining(true);
    controller.joinRoom(code);
    window.setTimeout(() => setIsJoining(false), 7000);
  };

  // 1. 未进入房间视图：创建房间 或 输入房间码加入
  if (!inRoom) {
    return (
      <div className="relative min-h-screen w-full bg-[#12161b] text-[#e8e9e6] flex flex-col items-center justify-center p-3 sm:p-6 select-none overflow-hidden">
        <ScenicBackdrop
          scene="lungmen-night"
          fade="diagonal-tr"
          opacityClassName="opacity-[0.44]"
          tint="radial-gradient(circle at 78% 22%, rgba(56,189,248,0.16) 0%, transparent 58%)"
        />
        <Panel
          variant="raised"
          cornerCut="lg"
          scanlines
          className="relative z-10 w-full max-w-4xl border border-[#52606d] bg-[#161b22]/92 backdrop-blur-sm shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
        >
          {/* Terminal Header */}
          <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a] border-b border-[#363f45] overflow-hidden">
            <ScenicBannerLayer
              scene="lungmen-night"
              fade="right"
              opacityClassName="opacity-42"
              tint="radial-gradient(circle at 80% 45%, rgba(56,189,248,0.16) 0%, transparent 58%)"
            />
            <div className="relative z-10 flex items-center gap-3">
              <span className="w-2 h-5 bg-[#e5a52b]" />
              <div>
                <h1 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                  好友联机对战 · P2P RTC
                </h1>
                <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                  WEBRTC DIRECT LINK · HOST AUTHORITATIVE
                </span>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-2">
              <Badge variant="neutral">账户 {getActiveAccountName()}</Badge>
              <Badge variant="ally">免服直连</Badge>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-2.5 bg-[#1a2026] border-b border-[#2e3740] text-xs text-emerald-300 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 shrink-0" />
            <span>房主创建房间后分享 8 位房间码，好友输入即可跨设备直接对战。</span>
          </div>

          {snapshot.closedReason && (
            <div className="mx-4 sm:mx-5 mt-3 px-3 py-2 bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs">
              <strong>前次房间已关闭：</strong>
              {snapshot.closedReason === 'HOST_LEFT'
                ? '房主已主动解散房间。'
                : snapshot.closedReason === 'HOST_TIMEOUT'
                  ? '房主断线超时，房间已自动释放。'
                  : snapshot.closedReason === 'EXPIRED'
                    ? '房间长期无操作已过期。'
                    : snapshot.closedReason}
            </div>
          )}

          {snapshot.errorMessage && (
            <div className="mx-4 sm:mx-5 mt-3 px-3 py-2 bg-rose-950/80 border border-rose-500 text-rose-200 text-xs flex items-center justify-between gap-2">
              <span>⚠️ {snapshot.errorMessage}</span>
              <Button variant="ghost" size="sm" onClick={() => controller.clearError()}>
                知道了
              </Button>
            </div>
          )}

          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-stretch bg-gradient-to-b from-[#1b2025] to-[#14181c]">
            <div className="relative overflow-hidden p-4 sm:p-5 bg-[#181d22] border border-[#323d46] flex flex-col justify-between gap-4">
              <ScenicBannerLayer
                scene="rhodes-exterior"
                fade="right"
                opacityClassName="opacity-36"
                tint="radial-gradient(circle at 78% 42%, rgba(229,165,43,0.14) 0%, transparent 60%)"
              />
              <div className="relative z-10 space-y-1.5">
                <span className="text-[10px] font-mono text-[#e5a52b] font-bold">ACTION · HOST</span>
                <h2 className="text-base font-bold text-white m-0">创建新房间</h2>
                <p className="text-xs text-slate-300 leading-relaxed m-0">
                  作为房主生成 8 位房间码，邀请好友加入同一战局。
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                cornerCut
                loading={isCreating}
                onClick={handleCreate}
                className="relative z-10 w-full font-bold"
              >
                {isCreating ? '正在创建…' : '创建房间'}
              </Button>
            </div>

            <div className="flex items-center justify-center text-xs font-mono font-bold text-slate-500 uppercase">
              OR
            </div>

            <div className="relative overflow-hidden p-4 sm:p-5 bg-[#181d22] border border-[#323d46] flex flex-col justify-between gap-4">
              <ScenicBannerLayer
                scene="lungmen-night"
                fade="right"
                opacityClassName="opacity-36"
                tint="radial-gradient(circle at 78% 42%, rgba(56,189,248,0.16) 0%, transparent 60%)"
              />
              <div className="relative z-10 space-y-1.5">
                <span className="text-[10px] font-mono text-sky-400 font-bold">ACTION · GUEST</span>
                <h2 className="text-base font-bold text-white m-0">输入房间码加入</h2>
                <p className="text-xs text-slate-300 leading-relaxed m-0">
                  输入好友分享的 8 位房间码连接对局。
                </p>
              </div>
              <div className="relative z-10 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  aria-label="8 位房间码"
                  placeholder="例如 ABCD2345"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isJoining) {
                      handleJoin();
                    }
                  }}
                  className="flex-1 min-w-0 bg-[#111519]/90 border border-[#3e4a54] px-3 py-2 text-sm font-mono font-bold tracking-widest text-center text-white uppercase focus:border-amber-400 focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="md"
                  cornerCut
                  loading={isJoining}
                  onClick={handleJoin}
                  className="font-bold shrink-0"
                >
                  {isJoining ? '加入中…' : '加入'}
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-3.5 bg-[#121518] border-t border-[#313b43] flex items-center justify-between">
            <Button variant="ghost" size="md" onClick={onBackToTitle}>
              ◀ 返回标题页
            </Button>
            <span className="text-[10px] font-mono text-slate-500">WEBRTC · P2P_DATA_CHANNEL</span>
          </div>
        </Panel>
      </div>
    );
  }

  // 2. 房间大厅视图
  const allReady = Boolean(roomState?.host.ready && roomState?.guest?.ready);
  const guestJoined = Boolean(roomState?.guest);
  const decks = getAllAvailableDecks(getDeckMode());

  return (
    <div className="relative min-h-screen w-full bg-[#12161b] text-[#e8e9e6] flex flex-col items-center justify-center p-3 sm:p-6 select-none overflow-hidden">
      <ScenicBackdrop
        scene="lungmen-night"
        fade="diagonal-tr"
        opacityClassName="opacity-[0.44]"
        tint="radial-gradient(circle at 78% 22%, rgba(56,189,248,0.16) 0%, transparent 58%)"
      />
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="relative z-10 w-full max-w-4xl border border-[#52606d] bg-[#161b22]/92 backdrop-blur-sm shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
      >
        <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a] border-b border-[#363f45] overflow-hidden">
          <ScenicBannerLayer
            scene="lungmen-night"
            fade="right"
            opacityClassName="opacity-42"
            tint="radial-gradient(circle at 80% 45%, rgba(56,189,248,0.16) 0%, transparent 58%)"
          />
          <div className="relative z-10 flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <h1 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
              好友对战大厅 · ROOM LOBBY
            </h1>
          </div>
          <div className="relative z-10">
            <Badge variant="ally">🌐 P2P 直连</Badge>
          </div>
        </div>

        {snapshot.errorMessage && (
          <div className="mx-4 sm:mx-5 mt-3 px-3 py-2 bg-rose-950/80 border border-rose-500 text-rose-200 text-xs flex items-center justify-between gap-2">
            <span>⚠️ {snapshot.errorMessage}</span>
            <Button variant="ghost" size="sm" onClick={() => controller.clearError()}>
              知道了
            </Button>
          </div>
        )}

        {/* 房间码与复制区 */}
        <div className="relative overflow-hidden px-4 sm:px-5 py-3 bg-[#1a2026] border-b border-[#2e3740] flex flex-wrap items-center justify-between gap-3">
          <ScenicBannerLayer scene="rhodes-bridge" fade="right" opacityClassName="opacity-30" />
          <div className="relative z-10 flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono text-slate-300">房间码:</span>
            <span className="text-xl sm:text-2xl font-mono font-black tracking-[0.2em] text-sky-300 bg-[#111519]/90 px-3 py-1 border border-sky-500/40">
              {snapshot.roomCode}
            </span>
            <Button variant="secondary" size="sm" onClick={copyCode}>
              {copied ? '✅ 已复制' : '📋 复制房间码'}
            </Button>
          </div>
          <span className="relative z-10 text-[11px] text-slate-300">将房间码发给好友，对方输入即可加入</span>
        </div>

        {/* 双方玩家座位卡片 */}
        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gradient-to-b from-[#1b2025] to-[#14181c]">
          {/* 房主座位 */}
          <div className={`relative overflow-hidden p-4 bg-[#181d22] border space-y-3 ${isHost ? 'border-[#e5a52b] ring-1 ring-[#e5a52b]/30' : 'border-[#323d46]'}`}>
            <ScenicBannerLayer scene="rhodes-command" fade="right" opacityClassName="opacity-34" />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-white">
                {isHost ? '👤 你（房主 · 玩家 A）' : '👑 房主（玩家 A）'}
              </span>
              <span className={`text-[11px] font-mono px-1.5 py-0.5 border ${roomState?.host.connected ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50' : 'bg-rose-950/70 text-rose-300 border-rose-500/50'}`}>
                {roomState?.host.connected ? '● 在线' : '○ 离线'}
              </span>
            </div>

            <div className="relative z-10 space-y-1">
              <label className="block text-[11px] font-mono text-slate-300">选择出战卡组：</label>
              {isHost ? (
                <select
                  value={roomState?.host.deckId ?? decks[0]?.deck_id}
                  disabled={myReady}
                  onChange={(e) => handleSelectDeck(e.target.value)}
                  className="w-full bg-[#111519]/90 border border-[#3e4a54] px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none disabled:opacity-60"
                >
                  {decks.map((d) => (
                    <option key={d.deck_id} value={d.deck_id}>
                      {d.deck_name_zh}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-2.5 py-2 bg-[#111519]/90 border border-[#2a333c] text-xs font-bold text-slate-200">
                  {decks.find((d) => d.deck_id === roomState?.host.deckId)?.deck_name_zh ?? '尚未选定'}
                </div>
              )}
            </div>

            <div className="relative z-10">
              <Badge variant={roomState?.host.ready ? 'status' : 'neutral'}>
                {roomState?.host.ready ? '✅ 已准备' : '⏳ 未准备'}
              </Badge>
            </div>
          </div>

          {/* 访客座位 */}
          <div className={`relative overflow-hidden p-4 bg-[#181d22] border space-y-3 ${isGuest ? 'border-[#e5a52b] ring-1 ring-[#e5a52b]/30' : 'border-[#323d46]'}`}>
            <ScenicBannerLayer scene="lungmen-night" fade="right" opacityClassName="opacity-34" />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-white">
                {isGuest ? '👤 你（访客 · 玩家 B）' : '👥 访客（玩家 B）'}
              </span>
              {guestJoined && (
                <span className={`text-[11px] font-mono px-1.5 py-0.5 border ${roomState?.guest?.connected ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50' : 'bg-rose-950/70 text-rose-300 border-rose-500/50'}`}>
                  {roomState?.guest?.connected ? '● 在线' : '○ 离线'}
                </span>
              )}
            </div>

            {guestJoined ? (
              <>
                <div className="relative z-10 space-y-1">
                  <label className="block text-[11px] font-mono text-slate-300">选择出战卡组：</label>
                  {isGuest ? (
                    <select
                      value={roomState?.guest?.deckId ?? decks[1]?.deck_id ?? decks[0]?.deck_id}
                      disabled={myReady}
                      onChange={(e) => handleSelectDeck(e.target.value)}
                      className="w-full bg-[#111519]/90 border border-[#3e4a54] px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none disabled:opacity-60"
                    >
                      {decks.map((d) => (
                        <option key={d.deck_id} value={d.deck_id}>
                          {d.deck_name_zh}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-2.5 py-2 bg-[#111519]/90 border border-[#2a333c] text-xs font-bold text-slate-200">
                      {decks.find((d) => d.deck_id === roomState?.guest?.deckId)?.deck_name_zh ?? '尚未选定'}
                    </div>
                  )}
                </div>

                <div className="relative z-10">
                  <Badge variant={roomState?.guest?.ready ? 'status' : 'neutral'}>
                    {roomState?.guest?.ready ? '✅ 已准备' : '⏳ 未准备'}
                  </Badge>
                </div>
              </>
            ) : (
              <div className="relative z-10 min-h-[96px] flex flex-col items-center justify-center gap-1.5 text-slate-300 text-xs border border-dashed border-[#323d46] bg-[#13171b]/85">
                <span className="text-lg">⏳</span>
                <span>等待好友输入房间码加入…</span>
              </div>
            )}
          </div>
        </div>

        {/* 控制操作栏 */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#121518] border-t border-[#313b43] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {!guestJoined
              ? '访客加入前无法准备；双方均准备后由房主点击开始对局。'
              : !allReady
                ? '双方都点击“准备”后，房主即可开启对局。'
                : '双方已准备就绪，可以开始对局。'}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="md" onClick={handleLeave}>
              离开房间
            </Button>

            <Button
              variant={myReady ? 'secondary' : 'primary'}
              size="md"
              cornerCut
              onClick={toggleReady}
              disabled={!guestJoined}
            >
              {myReady ? '取消准备' : '点击准备'}
            </Button>

            {isHost && (
              <Button
                variant="primary"
                size="md"
                cornerCut
                disabled={!allReady}
                onClick={handleStart}
                className="font-bold"
              >
                {allReady ? '开始对局 ▶' : '等待双方准备…'}
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
