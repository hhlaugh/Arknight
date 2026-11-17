import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  resetAppSettings,
  updateAppSettings,
} from './app-settings';
import {
  getAuthSession,
  hasAccountPassword,
  isAuthenticated,
  loginAccount,
  logoutAccount,
  quickLoginAccount,
  registerAccount,
} from './auth-store';
import {
  BGM_SCENE_TRACKS,
  computeEffectiveBgmVolume,
  computeEffectiveSfxVolume,
  getBgmSnapshot,
  setBgmScene,
} from '../audio/bgmPlayer';

describe('系统设置与音频配置存储', () => {
  beforeEach(() => {
    resetAppSettings();
  });

  it('默认音量、慢速动效与视觉特效默认值符合预期', () => {
    const s = getAppSettings();
    expect(s).toEqual(DEFAULT_APP_SETTINGS);
    expect(s.animSpeedMode).toBe('slow');
    expect(s.combatVfxEnabled).toBe(true);
    expect(s.scanlineFxEnabled).toBe(true);
    expect(s.muted).toBe(false);
  });

  it('音量夹逼 0~100 并正确计算 BGM/SFX 有效输出及静音抑制', () => {
    updateAppSettings({ masterVolume: 150, bgmVolume: -10, sfxVolume: 50 });
    expect(getAppSettings().masterVolume).toBe(100);
    expect(getAppSettings().bgmVolume).toBe(0);
    expect(getAppSettings().sfxVolume).toBe(50);
    expect(computeEffectiveBgmVolume()).toBe(0);
    expect(computeEffectiveSfxVolume()).toBeGreaterThan(0);

    updateAppSettings({ bgmVolume: 80, muted: true });
    expect(computeEffectiveBgmVolume()).toBe(0);
    expect(computeEffectiveSfxVolume()).toBe(0);

    updateAppSettings({ muted: false });
    expect(computeEffectiveBgmVolume()).toBeGreaterThan(0);
  });

  it('BGM 场景切换分别对应登录/主界面/战斗默认明日方舟曲目', () => {
    expect(BGM_SCENE_TRACKS.auth.src).toContain('m_sys_title.mp3');
    expect(BGM_SCENE_TRACKS.lobby.src).toContain('m_sys_void.mp3');
    expect(BGM_SCENE_TRACKS.battle.src).toContain('m_bat_normal02.mp3');

    setBgmScene('auth');
    expect(getBgmSnapshot().track.id).toBe('m_sys_title');

    setBgmScene('lobby');
    expect(getBgmSnapshot().track.id).toBe('m_sys_void');

    setBgmScene('battle');
    expect(getBgmSnapshot().track.id).toBe('m_bat_normal02');
  });
});

describe('指挥官注册登录与会话存储', () => {
  beforeEach(() => {
    logoutAccount();
  });

  it('支持注册新账户并自动签发会话，拒绝重名、短密码与两次密码不一致', () => {
    expect(isAuthenticated()).toBe(false);

    const shortPw = registerAccount('博士Alpha', '123', '123');
    expect(shortPw.ok).toBe(false);

    const mismatch = registerAccount('博士Alpha', '1234', '5678');
    expect(mismatch.ok).toBe(false);

    const uniqueName = `博士-${Date.now().toString(36)}`;
    const ok = registerAccount(uniqueName, 'prts2026', 'prts2026');
    expect(ok.ok).toBe(true);
    expect(isAuthenticated()).toBe(true);
    expect(getAuthSession()?.username).toBe(uniqueName);
    expect(hasAccountPassword(uniqueName)).toBe(true);

    logoutAccount();
    expect(isAuthenticated()).toBe(false);

    const wrongPw = loginAccount(uniqueName, 'wrong-pass');
    expect(wrongPw.ok).toBe(false);

    const relogin = loginAccount(uniqueName, 'prts2026');
    expect(relogin.ok).toBe(true);
    expect(getAuthSession()?.username).toBe(uniqueName);
  });

  it('既有测试账户支持免密直连进入终端', () => {
    const res = quickLoginAccount('hhlaugh-1');
    expect(res.ok).toBe(true);
    expect(getAuthSession()?.username).toBe('hhlaugh-1');
  });
});
