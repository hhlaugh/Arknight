import { useSyncExternalStore } from 'react';
import { getAppSettings, subscribeAppSettings } from '../data/app-settings';

export type BgmScene = 'auth' | 'lobby' | 'battle';

export interface BgmTrackInfo {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly src: string;
}

export const BGM_SCENE_TRACKS: Record<BgmScene, BgmTrackInfo> = {
  auth: {
    id: 'm_sys_title',
    title: 'Rhodes Island',
    subtitle: '明日方舟默认标题主题曲',
    src: './assets/arknights/audio/m_sys_title.mp3',
  },
  lobby: {
    id: 'm_sys_void',
    title: '生命流 (Lifeflow)',
    subtitle: '明日方舟默认主界面主题曲',
    src: './assets/arknights/audio/m_sys_void.mp3',
  },
  battle: {
    id: 'm_bat_normal02',
    title: '行动#02 (Operation #02)',
    subtitle: '明日方舟默认作战主题曲',
    src: './assets/arknights/audio/m_bat_normal02.mp3',
  },
};

export interface BgmSnapshot {
  readonly scene: BgmScene;
  readonly track: BgmTrackInfo;
  readonly playing: boolean;
  readonly blockedByAutoplay: boolean;
}

const DEFAULT_SNAPSHOT: BgmSnapshot = {
  scene: 'auth',
  track: BGM_SCENE_TRACKS.auth,
  playing: false,
  blockedByAutoplay: false,
};

let currentScene: BgmScene = 'auth';
let isPlaying = false;
let isBlockedByAutoplay = false;
let activeAudio: HTMLAudioElement | null = null;
let activeSrc: string | null = null;
let sfxAudioContext: AudioContext | null = null;
let unlockBound = false;
let settingsSubscribed = false;
let snapshotCache: BgmSnapshot = DEFAULT_SNAPSHOT;

const listeners = new Set<() => void>();

function refreshSnapshotCache(): void {
  const track = BGM_SCENE_TRACKS[currentScene];
  if (
    snapshotCache.scene === currentScene &&
    snapshotCache.track.id === track.id &&
    snapshotCache.playing === isPlaying &&
    snapshotCache.blockedByAutoplay === isBlockedByAutoplay
  ) {
    return;
  }
  snapshotCache = {
    scene: currentScene,
    track,
    playing: isPlaying,
    blockedByAutoplay: isBlockedByAutoplay,
  };
  for (const listener of listeners) {
    listener();
  }
}

export function computeEffectiveBgmVolume(): number {
  const settings = getAppSettings();
  if (settings.muted) return 0;
  const master = Math.max(0, Math.min(1, settings.masterVolume / 100));
  const bgm = Math.max(0, Math.min(1, settings.bgmVolume / 100));
  return Math.max(0, Math.min(1, master * bgm * 0.55));
}

export function computeEffectiveSfxVolume(): number {
  const settings = getAppSettings();
  if (settings.muted) return 0;
  const master = Math.max(0, Math.min(1, settings.masterVolume / 100));
  const sfx = Math.max(0, Math.min(1, settings.sfxVolume / 100));
  return Math.max(0, Math.min(1, master * sfx * 0.45));
}

function applyVolumeToAudio(): void {
  if (!activeAudio) return;
  const vol = computeEffectiveBgmVolume();
  activeAudio.volume = vol;
  activeAudio.muted = vol === 0;
}

function ensureSettingsSubscription(): void {
  if (settingsSubscribed) return;
  settingsSubscribed = true;
  subscribeAppSettings(() => {
    applyVolumeToAudio();
    const vol = computeEffectiveBgmVolume();
    if (vol > 0 && activeAudio && activeAudio.paused && !isBlockedByAutoplay) {
      void tryPlayCurrentAudio();
    }
  });
}

function bindGlobalGestureUnlock(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const handleFirstGesture = () => {
    unlockBound = false;
    window.removeEventListener('pointerdown', handleFirstGesture, true);
    window.removeEventListener('keydown', handleFirstGesture, true);
    void unlockBgmPlayback();
  };

  window.addEventListener('pointerdown', handleFirstGesture, { capture: true, passive: true });
  window.addEventListener('keydown', handleFirstGesture, { capture: true, passive: true });
}

async function tryPlayCurrentAudio(): Promise<void> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  ensureSettingsSubscription();

  const track = BGM_SCENE_TRACKS[currentScene];
  if (!activeAudio || activeSrc !== track.src) {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = '';
      } catch {
        // 忽略清理异常
      }
    }
    const audio = new Audio(track.src);
    audio.loop = true;
    audio.preload = 'auto';
    audio.addEventListener('play', () => {
      isPlaying = true;
      isBlockedByAutoplay = false;
      refreshSnapshotCache();
    });
    audio.addEventListener('pause', () => {
      isPlaying = false;
      refreshSnapshotCache();
    });
    activeAudio = audio;
    activeSrc = track.src;
  }

  applyVolumeToAudio();
  if (computeEffectiveBgmVolume() === 0) {
    isPlaying = false;
    refreshSnapshotCache();
    return;
  }

  try {
    const playPromise = activeAudio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      await playPromise;
    }
    isPlaying = true;
    isBlockedByAutoplay = false;
    refreshSnapshotCache();
  } catch {
    isPlaying = false;
    isBlockedByAutoplay = true;
    bindGlobalGestureUnlock();
    refreshSnapshotCache();
  }
}

export function setBgmScene(scene: BgmScene): void {
  const prevScene = currentScene;
  currentScene = scene;
  refreshSnapshotCache();
  if (typeof window === 'undefined') return;
  ensureSettingsSubscription();
  if (prevScene !== scene || !activeAudio) {
    void tryPlayCurrentAudio();
  }
}

export async function unlockBgmPlayback(): Promise<void> {
  if (typeof window === 'undefined') return;
  isBlockedByAutoplay = false;
  await tryPlayCurrentAudio();
}

export function getBgmSnapshot(): BgmSnapshot {
  return snapshotCache;
}

export function subscribeBgm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBgmStatus(): BgmSnapshot {
  return useSyncExternalStore(subscribeBgm, getBgmSnapshot, () => DEFAULT_SNAPSHOT);
}

/**
 * 获取并按需唤醒全局共享的 SFX AudioContext（避免创建过多硬件音频节点）。
 */
export function getSfxAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    if (!sfxAudioContext) {
      sfxAudioContext = new AudioCtx();
    }
    if (sfxAudioContext.state === 'suspended') {
      void sfxAudioContext.resume();
    }
    return sfxAudioContext;
  } catch {
    return null;
  }
}

/**
 * 轻量 PRTS 战术终端合成音效（Web Audio API）：无需额外音效资源即可响应音量/静音调节。
 */
export function playTacticalSfx(kind: 'click' | 'confirm' | 'alert' = 'click'): void {
  const vol = computeEffectiveSfxVolume();
  if (vol <= 0) return;

  const ctx = getSfxAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === 'confirm') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.085);
      gain.gain.setValueAtTime(vol * 0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (kind === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
      gain.gain.setValueAtTime(vol * 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(840, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
      gain.gain.setValueAtTime(vol * 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    }
  } catch {
    // 忽略浏览器音频上下文限制异常
  }
}
