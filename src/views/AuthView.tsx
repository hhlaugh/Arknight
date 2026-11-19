import React, { useState } from 'react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import {
  listLoginableAccounts,
  loginAccount,
  quickLoginAccount,
  registerAccount,
} from '../data/auth-store';
import { playTacticalSfx, unlockBgmPlayback, useBgmStatus } from '../audio/bgmPlayer';
import { updateAppSettings, useAppSettings } from '../data/app-settings';
import tacticalCommandBackdrop from '../assets/images/tactical_command_backdrop_1795044168530.jpg';

interface AuthViewProps {
  readonly onAuthenticated: (username: string) => void;
  readonly onOpenSettings: () => void;
}

type AuthMode = 'login' | 'register';

export function AuthView({ onAuthenticated, onOpenSettings }: AuthViewProps) {
  const settings = useAppSettings();
  const bgm = useBgmStatus();

  const [mode, setMode] = useState<AuthMode>('login');
  const [accounts] = useState(() => listLoginableAccounts());
  const [username, setUsername] = useState(() => accounts[0]?.name ?? '指挥官');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedAccount = accounts.find((acc) => acc.name === username.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    void unlockBgmPlayback();

    if (mode === 'login') {
      const result = loginAccount(username, password);
      if (!result.ok) {
        playTacticalSfx('alert');
        setError(result.error ?? '登录失败');
        return;
      }
      playTacticalSfx('confirm');
      onAuthenticated(username.trim());
      return;
    }

    const result = registerAccount(username, password, confirmPassword);
    if (!result.ok) {
      playTacticalSfx('alert');
      setError(result.error ?? '注册失败');
      return;
    }
    playTacticalSfx('confirm');
    onAuthenticated(username.trim());
  };

  const handleQuickLogin = (accountName: string) => {
    setError(null);
    setInfo(null);
    void unlockBgmPlayback();
    const res = quickLoginAccount(accountName);
    if (!res.ok) {
      setMode('login');
      setUsername(accountName);
      setInfo(`账户「${accountName}」已设置密码，请输入密码完成验证。`);
      playTacticalSfx('click');
      return;
    }
    playTacticalSfx('confirm');
    onAuthenticated(accountName);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#12161b] text-[#e8e9e6] flex flex-col justify-between p-4 sm:p-6 overflow-hidden select-none">
      {/* 罗德岛指挥中枢底图 + 塔形三角形官方 Logo 背景层 */}
      <div
        data-testid="auth-rhodes-tower-backdrop"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* 商业级指挥舰桥氛围底图 */}
        <img
          src={tacticalCommandBackdrop}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-[0.22] scale-105"
        />
        {/* 对角微弱重复暗纹 */}
        <div
          className="absolute -inset-24 -rotate-12 opacity-[0.04]"
          style={{
            backgroundImage: "url('./assets/arknights/logos/rhodes_island_light.png')",
            backgroundRepeat: 'repeat',
            backgroundSize: '156px 156px',
          }}
        />
        {/* 居中巨型罗德岛制药塔形三角形徽章 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="./assets/arknights/logos/rhodes_island_dark.png"
            alt="罗德岛制药塔形标识"
            referrerPolicy="no-referrer"
            className="w-[460px] h-[460px] sm:w-[620px] sm:h-[620px] object-contain opacity-[0.26] drop-shadow-[0_0_48px_rgba(0,0,0,0.9)]"
          />
        </div>
        {/* 边缘暗角渐变提高表单可读性 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(16,20,26,0.28) 0%, rgba(11,14,18,0.84) 76%, rgba(9,11,15,0.96) 100%)',
          }}
        />
      </div>

      {/* 顶部 PRTS 导航条：BGM 音乐状态与全局设置按钮 */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <img
            src="./assets/arknights/logos/prts_badge.svg"
            alt="PRTS"
            referrerPolicy="no-referrer"
            className="w-9 h-9 object-contain border border-[#3e4954] bg-black"
          />
          <div>
            <div className="text-xs font-black tracking-widest text-slate-100 uppercase">
              PRTS · 罗德岛身份认证终端
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              RHODES ISLAND PHARMACEUTICALS INC.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (settings.muted) {
                updateAppSettings({ muted: false });
              }
              void unlockBgmPlayback();
              playTacticalSfx('click');
            }}
            className="px-2.5 py-1.5 border border-[#3a4551] bg-[#161c23]/90 hover:border-amber-400 text-[11px] font-mono text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="点击播放或切换背景音乐状态"
          >
            <span>{settings.muted ? '🔇' : '♪'}</span>
            <span className="text-amber-300 font-bold">{bgm.track.title}</span>
            {bgm.blockedByAutoplay && !settings.muted && (
              <span className="text-[10px] text-sky-300">· 点击开启声音</span>
            )}
          </button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              playTacticalSfx('click');
              onOpenSettings();
            }}
            aria-label="打开系统设置"
            className="font-mono"
          >
            ⚙ 设置
          </Button>
        </div>
      </header>

      {/* 中央登录 / 注册控制台卡片 */}
      <main className="relative z-10 w-full max-w-md mx-auto my-6">
        <Panel
          variant="glass"
          cornerCut="lg"
          scanlines
          grid
          className="border-[#546372] bg-[#141920]/90 backdrop-blur-sm shadow-[0_24px_64px_rgba(0,0,0,0.8)]"
        >
          {/* 标题与模式切换栏 */}
          <div className="px-5 pt-5 pb-4 border-b border-[#2e3842] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-mono tracking-widest text-[#e5a52b] uppercase">
                  NEURAL AUTHENTICATION
                </div>
                <h1 className="text-xl font-black text-white tracking-wide m-0 mt-0.5">
                  舟塔自走牌 · 终端登录
                </h1>
              </div>
              <img
                src="./assets/arknights/logos/prts_diamond.png"
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="w-10 h-10 object-contain opacity-80"
              />
            </div>

            <div className="grid grid-cols-2 border border-[#323d48] bg-[#111519] p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                  playTacticalSfx('click');
                }}
                aria-pressed={mode === 'login'}
                className={`py-2 text-xs font-bold tracking-wider transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#e5a52b] text-[#111418]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                登录账户
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setUsername('');
                  setPassword('');
                  setConfirmPassword('');
                  setError(null);
                  setInfo(null);
                  playTacticalSfx('click');
                }}
                aria-pressed={mode === 'register'}
                className={`py-2 text-xs font-bold tracking-wider transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#e5a52b] text-[#111418]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                注册新档案
              </button>
            </div>
          </div>

          {/* 表单体 */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="auth-username"
                className="block text-[11px] font-mono font-bold text-slate-200"
              >
                指挥官代号 / 用户名
              </label>
              <input
                id="auth-username"
                type="text"
                maxLength={24}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  mode === 'register'
                    ? '输入新指挥官名称（1~24 字符）'
                    : '输入指挥官账户名（例如：指挥官）'
                }
                className="w-full bg-[#101419] border border-[#3a4552] px-3 py-2.5 text-sm text-white font-mono focus:border-[#e5a52b] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-password"
                  className="block text-[11px] font-mono font-bold text-slate-200"
                >
                  {mode === 'login' && selectedAccount && !selectedAccount.hasPassword
                    ? '设置或输入密码（首次登录本地账户可选填）'
                    : '接入密码'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-[10px] font-mono text-slate-400 hover:text-amber-300 cursor-pointer"
                >
                  {showPassword ? '隐藏密码' : '显示密码'}
                </button>
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === 'register'
                    ? '设置至少 4 位登录密码'
                    : selectedAccount && !selectedAccount.hasPassword
                      ? '留空可直接登入，或输入 4 位以上绑定密码'
                      : '请输入登录密码'
                }
                className="w-full bg-[#101419] border border-[#3a4552] px-3 py-2.5 text-sm text-white font-mono focus:border-[#e5a52b] focus:outline-none"
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-[11px] font-mono font-bold text-slate-200"
                >
                  确认登录密码
                </label>
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入登录密码"
                  className="w-full bg-[#101419] border border-[#3a4552] px-3 py-2.5 text-sm text-white font-mono focus:border-[#e5a52b] focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 m-0">
                  注册成功后自动获赠初始编队（3★干员全量×2 + 6000 合成玉）。
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="px-3 py-2 bg-rose-950/80 border border-rose-500/70 text-rose-200 text-xs"
              >
                {error}
              </div>
            )}

            {info && (
              <div className="px-3 py-2 bg-sky-950/75 border border-sky-500/60 text-sky-200 text-xs">
                {info}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              cornerCut
              className="w-full min-h-[44px] font-black tracking-widest"
            >
              {mode === 'login' ? '接入罗德岛作战终端' : '注册并进入作战终端'}
            </Button>

            {/* 既有本地账户与免密测试账户快捷通道 */}
            {mode === 'login' && accounts.length > 0 && (
              <div className="pt-3 border-t border-[#2b343e] space-y-2">
                <div className="text-[10px] font-mono text-slate-400">
                  本机已存档指挥官账户（免密账户点击即可直连）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((acc) => (
                    <button
                      key={acc.name}
                      type="button"
                      onClick={() => {
                        if (acc.hasPassword) {
                          setUsername(acc.name);
                          setPassword('');
                          setInfo(`已选择「${acc.name}」，请输入密码登录。`);
                          playTacticalSfx('click');
                        } else {
                          handleQuickLogin(acc.name);
                        }
                      }}
                      className={`px-2 py-1 text-[11px] font-mono border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        username.trim() === acc.name
                          ? 'bg-[#28313c] border-[#e5a52b] text-white'
                          : 'bg-[#12171d] border-[#313b45] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {acc.isTest && (
                        <span className="text-[9px] font-black text-rose-300 bg-rose-950/80 border border-rose-500/60 px-1">
                          TEST
                        </span>
                      )}
                      <span>{acc.name}</span>
                      <span className="text-amber-300 tabular-nums">◆{acc.originite}</span>
                      <span className="text-[10px] text-slate-400">
                        {acc.hasPassword ? '🔒' : '→'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </Panel>
      </main>

      {/* 底部说明 */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
        <span>本地凭证加密保存 · 多指挥官独立藏品与自定义卡组</span>
        <span>RHODES ISLAND TACTICAL CARD TERMINAL</span>
      </footer>
    </div>
  );
}
