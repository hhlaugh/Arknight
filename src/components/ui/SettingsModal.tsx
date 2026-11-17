import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  resetAppSettings,
  updateAppSettings,
  useAppSettings,
} from '../../data/app-settings';
import {
  playTacticalSfx,
  unlockBgmPlayback,
  useBgmStatus,
} from '../../audio/bgmPlayer';
import type { AnimationSpeedMode } from '../battle/combatPresentation';

interface SettingsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activeUsername?: string | null;
  readonly onLogout?: () => void;
}

const SPEED_OPTIONS: readonly { readonly mode: AnimationSpeedMode; readonly label: string; readonly hint: string }[] = [
  { mode: 'slow', label: '0.5x 慢速', hint: '推荐' },
  { mode: 'normal', label: '1x 标准', hint: '' },
  { mode: 'fast', label: '2x 加速', hint: '' },
  { mode: 'off', label: '关闭', hint: '' },
];

export function SettingsModal({
  isOpen,
  onClose,
  activeUsername = null,
  onLogout,
}: SettingsModalProps) {
  const settings = useAppSettings();
  const bgm = useBgmStatus();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="系统设置"
      codeName="SYS.SETTINGS"
      size="md"
      footer={
        <div className="w-full flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetAppSettings();
              playTacticalSfx('confirm');
            }}
          >
            恢复默认设置
          </Button>
          <Button
            variant="primary"
            size="sm"
            cornerCut
            onClick={() => {
              playTacticalSfx('confirm');
              onClose();
            }}
          >
            完成并关闭
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-xs">
        {/* 1. 音频与背景音乐 */}
        <section className="space-y-3 border border-[#323d48] bg-[#161b20] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#2a333d]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-[#e5a52b]" />
              <h4 className="font-bold text-slate-100 tracking-wider uppercase m-0">
                音频与背景音乐 (AUDIO)
              </h4>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextMuted = !settings.muted;
                updateAppSettings({ muted: nextMuted });
                if (!nextMuted) {
                  void unlockBgmPlayback();
                  playTacticalSfx('click');
                }
              }}
              aria-pressed={settings.muted}
              className={`px-2.5 py-1 border font-mono font-bold text-[11px] transition-colors cursor-pointer ${
                settings.muted
                  ? 'bg-rose-950/70 border-rose-500/70 text-rose-200'
                  : 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
              }`}
            >
              {settings.muted ? '🔇 已静音（点击恢复）' : '🔊 声音开启'}
            </button>
          </div>

          {/* 当前场景曲目状态 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 bg-[#111519] border border-[#28313b]">
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-slate-400">当前场景 BGM</div>
              <div className="text-xs font-bold text-amber-300 truncate">
                ♪ {bgm.track.title}
                <span className="ml-2 text-[10px] font-normal text-slate-400">
                  {bgm.track.subtitle}
                </span>
              </div>
            </div>
            {bgm.blockedByAutoplay && !settings.muted ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void unlockBgmPlayback()}
              >
                ▶ 播放音乐
              </Button>
            ) : (
              <span className="text-[10px] font-mono text-slate-400">
                {settings.muted ? '静音中' : bgm.playing ? '播放中' : '待命中'}
              </span>
            )}
          </div>

          {/* 主音量 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <label htmlFor="setting-master-volume" className="text-slate-200 font-bold">
                主音量 (Master)
              </label>
              <span className="text-amber-300 tabular-nums">{settings.masterVolume}%</span>
            </div>
            <input
              id="setting-master-volume"
              type="range"
              min={0}
              max={100}
              value={settings.masterVolume}
              onChange={(e) =>
                updateAppSettings({ masterVolume: Number(e.target.value), muted: false })
              }
              className="w-full accent-[#e5a52b] cursor-pointer"
            />
          </div>

          {/* 背景音乐 BGM 音量 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <label htmlFor="setting-bgm-volume" className="text-slate-200 font-bold">
                背景音乐 (BGM)
              </label>
              <span className="text-sky-300 tabular-nums">{settings.bgmVolume}%</span>
            </div>
            <input
              id="setting-bgm-volume"
              type="range"
              min={0}
              max={100}
              value={settings.bgmVolume}
              onChange={(e) =>
                updateAppSettings({ bgmVolume: Number(e.target.value), muted: false })
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          {/* 音效 SFX 音量 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <label htmlFor="setting-sfx-volume" className="text-slate-200 font-bold">
                系统与交互音效 (SFX)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playTacticalSfx('confirm')}
                  className="px-1.5 py-0.5 border border-[#3d4a57] bg-[#1b2229] hover:border-amber-400 text-slate-200 text-[10px] font-mono cursor-pointer"
                >
                  试听音效
                </button>
                <span className="text-emerald-300 tabular-nums">{settings.sfxVolume}%</span>
              </div>
            </div>
            <input
              id="setting-sfx-volume"
              type="range"
              min={0}
              max={100}
              value={settings.sfxVolume}
              onChange={(e) =>
                updateAppSettings({ sfxVolume: Number(e.target.value), muted: false })
              }
              className="w-full accent-emerald-400 cursor-pointer"
            />
          </div>
        </section>

        {/* 2. 战斗演出与视觉特效 */}
        <section className="space-y-3 border border-[#323d48] bg-[#161b20] p-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-[#2a333d]">
            <span className="w-1.5 h-3.5 bg-sky-400" />
            <h4 className="font-bold text-slate-100 tracking-wider uppercase m-0">
              特效与战斗演出 (EFFECTS)
            </h4>
          </div>

          {/* 动画倍速 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-200 font-bold">战斗动画与轨迹演出速度</span>
              <span className="text-[10px] font-mono text-slate-400">
                实时同步战斗界面倍率
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SPEED_OPTIONS.map((opt) => {
                const active = settings.animSpeedMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      updateAppSettings({ animSpeedMode: opt.mode });
                      playTacticalSfx('click');
                    }}
                    className={`px-2 py-2 border font-mono font-bold text-[11px] transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 border-[#e5a52b] text-amber-200 ring-1 ring-[#e5a52b]/40'
                        : 'bg-[#12161b] border-[#313b45] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="ml-1 text-[9px] text-amber-400">({opt.hint})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 战斗攻击路径与粒子冲击特效 */}
          <div className="flex items-center justify-between gap-3 px-2.5 py-2 bg-[#111519] border border-[#28313b]">
            <div>
              <div className="font-bold text-slate-200">战斗攻击路径与冲击特效</div>
              <div className="text-[11px] text-slate-400">
                显示航道攻击矢量轨迹、准星锁定、受击闪光与部署光柱
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.combatVfxEnabled}
              onClick={() => {
                updateAppSettings({ combatVfxEnabled: !settings.combatVfxEnabled });
                playTacticalSfx('click');
              }}
              className={`shrink-0 px-3 py-1.5 border font-mono font-bold text-[11px] cursor-pointer transition-colors ${
                settings.combatVfxEnabled
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-[#1a1f26] border-[#3a4552] text-slate-400'
              }`}
            >
              {settings.combatVfxEnabled ? '已开启' : '已关闭'}
            </button>
          </div>

          {/* 终端扫描线与网格装饰 */}
          <div className="flex items-center justify-between gap-3 px-2.5 py-2 bg-[#111519] border border-[#28313b]">
            <div>
              <div className="font-bold text-slate-200">PRTS 终端扫描线与网格光效</div>
              <div className="text-[11px] text-slate-400">
                控制界面扫描线纹理、战术方格与高阶背景光晕
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.scanlineFxEnabled}
              onClick={() => {
                updateAppSettings({ scanlineFxEnabled: !settings.scanlineFxEnabled });
                playTacticalSfx('click');
              }}
              className={`shrink-0 px-3 py-1.5 border font-mono font-bold text-[11px] cursor-pointer transition-colors ${
                settings.scanlineFxEnabled
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-[#1a1f26] border-[#3a4552] text-slate-400'
              }`}
            >
              {settings.scanlineFxEnabled ? '已开启' : '已关闭'}
            </button>
          </div>
        </section>

        {/* 3. 当前登录账户操作 */}
        {activeUsername && onLogout && (
          <section className="flex items-center justify-between gap-3 border border-[#323d48] bg-[#161b20] p-3.5">
            <div>
              <div className="text-[10px] font-mono text-slate-400">当前接入指挥官</div>
              <div className="text-xs font-bold text-white">{activeUsername}</div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                playTacticalSfx('alert');
                onClose();
                onLogout();
              }}
            >
              退出登录并返回登录界面
            </Button>
          </section>
        )}
      </div>
    </Modal>
  );
}
