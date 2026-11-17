import React, { useRef, useState } from 'react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { RhodesWatermarkBackdrop } from '../components/ui/RhodesWatermark';
import {
  createAccount,
  exportAccountsJson,
  getActiveAccountName,
  getActiveCollection,
  importAccountsJson,
  listAccounts,
  setActiveAccount,
} from '../data/player-collection';
import type { AccountSummary } from '../data/player-collection';
import { DEMO_CARDS } from '../client/gameData';

interface StartViewProps {
  readonly onHotseat: () => void;
  readonly onVsBot: () => void;
  readonly onOnline: () => void;
  readonly onDeckEditor: () => void;
  readonly onLibrary?: () => void;
  readonly onRecruitment: () => void;
  readonly onOpenSettings?: () => void;
  readonly onLogout?: () => void;
}

export function StartView({
  onHotseat,
  onVsBot,
  onOnline,
  onDeckEditor,
  onLibrary,
  onRecruitment,
  onOpenSettings,
  onLogout,
}: StartViewProps) {
  const [accounts, setAccounts] = useState<AccountSummary[]>(() => listAccounts());
  const [activeName, setActiveNameState] = useState(() => getActiveAccountName());
  const [collection, setCollection] = useState(() => getActiveCollection());
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ownedSpeciesCount = DEMO_CARDS.filter((c) => (collection.owned[c.card_id] ?? 0) > 0).length;

  const refreshAccounts = () => {
    setAccounts(listAccounts());
    setActiveNameState(getActiveAccountName());
    setCollection(getActiveCollection());
  };

  const handleSwitch = (name: string) => {
    setActiveAccount(name);
    setNotice(`已切换到账户「${name}」`);
    refreshAccounts();
  };

  const handleCreate = () => {
    const result = createAccount(newName);
    if (!result.ok) {
      setNotice(result.error ?? '创建失败');
      return;
    }
    setNotice(`账户「${newName.trim()}」已创建并激活（初始：3★×2 + 6000 合成玉）`);
    setNewName('');
    refreshAccounts();
  };

  const handleExport = () => {
    try {
      const blob = new Blob([exportAccountsJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'arknight_accounts_backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('存档已导出（全部账户，可放 OneDrive 跨设备搬运）');
    } catch {
      setNotice('导出失败：浏览器拒绝了下载。');
    }
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importAccountsJson(String(reader.result));
      setNotice(result.ok ? `存档已导入（${result.accountCount} 个账户）` : result.error ?? '导入失败');
      refreshAccounts();
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  return (
    <div className="relative min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none overflow-hidden">
      <RhodesWatermarkBackdrop />
      {/* Central Terminal Console Panel */}
      <Panel
        variant="dark"
        cornerCut="lg"
        scanlines
        grid
        className="relative z-10 w-full max-w-4xl border border-[#4a555b] bg-[#191d22]/86 shadow-2xl overflow-hidden"
      >
        {/* Top Operational Status Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-[#14171a]/92 border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <img
              src="./assets/arknights/logos/prts_badge.svg"
              alt="PRTS Logo"
              referrerPolicy="no-referrer"
              className="w-10 h-10 shrink-0 object-contain border border-[#4a555b] bg-black"
            />
            <div>
              <h1 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                PRTS · 战术作战终端
              </h1>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                RHODES ISLAND PHARMACEUTICALS INC.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] font-mono tabular-nums">
            <span className="text-slate-300">
              账户 <strong className="text-white">{activeName}</strong>
            </span>
            <span className="text-amber-300 font-bold">◆ {collection.currency.originite}</span>
            <span className="text-slate-400">
              收录 {ownedSpeciesCount}/{DEMO_CARDS.length}
            </span>
            <Badge variant="rarity" value={6}>v0.8 规则</Badge>
            {onOpenSettings && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenSettings}
                aria-label="打开系统设置"
                className="text-[11px] font-mono px-2.5 py-1"
              >
                ⚙ 设置
              </Button>
            )}
            {onLogout && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                aria-label="退出登录"
                className="text-[11px] font-mono px-2 py-1 text-slate-300 border border-[#3a4552] hover:border-rose-400 hover:text-rose-200"
              >
                退出登录
              </Button>
            )}
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-b from-[#1b2025]/82 to-[#14181c]/88 border-b border-[#2d353b] overflow-hidden">
          <img
            src="./assets/arknights/logos/rhodes_island_dark.png"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="pointer-events-none select-none absolute right-6 md:right-60 top-1/2 -translate-y-1/2 w-56 h-56 object-contain opacity-[0.22]"
          />
          <div className="relative z-10 flex-1 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#e5a52b] tracking-wider uppercase">
              <span>RHODES ISLAND OPERATIONAL CARD GAME</span>
              <span>·</span>
              <span>72 OPERATORS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide m-0">
              舟塔自走牌
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              全量收录 72 位罗德岛干员，支持专属技能、阻挡线争夺、技力回转、费用调度与干员再部署战术。
            </p>
          </div>

          {/* Quick Deck Builder & Archive Launcher */}
          <div className="w-full md:w-auto shrink-0 flex flex-col sm:flex-row md:flex-col gap-2 items-center">
            <Button
              variant="primary"
              size="lg"
              cornerCut
              onClick={onRecruitment}
              className="w-full md:w-60 font-bold tracking-wide"
            >
              ◆ 干员寻访 (Gacha)
            </Button>
            <Button
              variant="outline"
              size="md"
              cornerCut
              onClick={onDeckEditor}
              className="w-full md:w-60 font-bold tracking-wide"
            >
              🎴 卡组构筑器 (Deck Builder)
            </Button>
            {onLibrary && (
              <Button
                variant="secondary"
                size="md"
                cornerCut
                onClick={onLibrary}
                className="w-full md:w-60 font-medium"
              >
                📖 罗德岛干员图鉴 (Archive)
              </Button>
            )}
            <span className="text-[10px] text-slate-400 font-mono text-center">
              寻访收录 · 收录/自由双构筑模式 · 官方预设
            </span>
          </div>
        </div>

        {/* Tactical Battle Modes Selection Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Mode 1: VS Bot */}
          <div
            onClick={onVsBot}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-[#e5a52b] transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#e5a52b] font-bold">MODE 01</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">AI SIM</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-[#e5a52b] transition-colors m-0">
                单人对战（vs 机器人）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                执玩家 A 对阵规则引擎本地 AI。AI 严格遵守全部卡牌部署与攻防规则。
              </p>
            </div>
            <Button variant="primary" size="sm" cornerCut className="w-full">
              进入作战
            </Button>
          </div>

          {/* Mode 2: Hotseat */}
          <div
            onClick={onHotseat}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-sky-400 transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-sky-400 font-bold">MODE 02</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">LOCAL</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors m-0">
                本地热座（双人同屏）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                双人同屏轮流出牌与攻防推演，完整经历选牌、调度与三路对推。
              </p>
            </div>
            <Button variant="secondary" size="sm" cornerCut className="w-full hover:border-sky-400">
              同屏对战
            </Button>
          </div>

          {/* Mode 3: Online Room */}
          <div
            onClick={onOnline}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-rose-400 transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-rose-400 font-bold">MODE 03</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">P2P RTC</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors m-0">
                好友对战（P2P 联机）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                基于 WebRTC 直连，生成房间码即可跨设备实时联机对决，无需第三方中继。
              </p>
            </div>
            <Button variant="secondary" size="sm" cornerCut className="w-full hover:border-rose-400">
              联机大厅
            </Button>
          </div>
        </div>

        {/* Commander Accounts & Save Backup */}
        <div className="px-6 py-4 bg-[#14171a] border-t border-[#2d353b] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">
              指挥官账户 · 存档保存在本机浏览器（导出 JSON 可跨设备搬运）
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                导出存档
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                导入存档
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {accounts.map((account) => (
              <button
                key={account.name}
                type="button"
                onClick={() => handleSwitch(account.name)}
                className={`px-2 py-1 text-[11px] font-mono border transition-colors flex items-center gap-1.5 ${
                  account.name === activeName
                    ? 'bg-[#29323d] border-[#e5a52b] text-white ring-1 ring-[#e5a52b]/40'
                    : 'bg-[#181d22] border-[#313b43] text-slate-300 hover:border-[#4b5a66]'
                }`}
              >
                {account.isTest && (
                  <span className="text-[8px] font-black text-rose-300 bg-rose-950/80 border border-rose-500/60 px-1">TEST</span>
                )}
                <span>{account.name}</span>
                <span className="text-amber-300">◆{account.originite}</span>
                {account.name === activeName && <span className="text-[#e5a52b]">✓</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newName}
              maxLength={24}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder="新账户名（初始：3★×2 + 6000 合成玉）"
              className="flex-1 min-w-[180px] sm:max-w-xs bg-[#1b2127] border border-[#3c4750] px-2.5 py-1 text-xs text-slate-200 font-mono focus:border-amber-400 focus:outline-none"
            />
            <Button variant="secondary" size="sm" onClick={handleCreate}>
              新建账户
            </Button>
            {notice && <span className="text-[10px] font-mono text-emerald-300">{notice}</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#121518] border-t border-[#2d353b] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
          <span>本地浏览器存档 · 支持多账户切换与 JSON 导出备份</span>
          <span>RHODES ISLAND TACTICAL CARD GAME</span>
        </div>
      </Panel>
    </div>
  );
}
