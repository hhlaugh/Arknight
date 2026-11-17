import { useSyncExternalStore } from 'react';
import {
  DEFAULT_ANIMATION_SPEED_MODE,
  type AnimationSpeedMode,
} from '../components/battle/combatPresentation';

export const APP_SETTINGS_STORAGE_KEY = 'arknight_settings_v1';
const LEGACY_ANIM_SPEED_KEY = 'ark_tactical_anim_speed_v2';

export interface AppSettings {
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly sfxVolume: number;
  readonly muted: boolean;
  readonly animSpeedMode: AnimationSpeedMode;
  readonly combatVfxEnabled: boolean;
  readonly scanlineFxEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  masterVolume: 75,
  bgmVolume: 65,
  sfxVolume: 80,
  muted: false,
  animSpeedMode: DEFAULT_ANIMATION_SPEED_MODE,
  combatVfxEnabled: true,
  scanlineFxEnabled: true,
};

const listeners = new Set<() => void>();
let cachedSettings: AppSettings | null = null;

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isAnimSpeedMode(value: unknown): value is AnimationSpeedMode {
  return value === 'slow' || value === 'normal' || value === 'fast' || value === 'off';
}

function readLegacyAnimSpeed(): AnimationSpeedMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(LEGACY_ANIM_SPEED_KEY);
    return isAnimSpeedMode(val) ? val : null;
  } catch {
    return null;
  }
}

function loadSettingsFromStorage(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) {
      const legacySpeed = readLegacyAnimSpeed();
      return legacySpeed
        ? { ...DEFAULT_APP_SETTINGS, animSpeedMode: legacySpeed }
        : DEFAULT_APP_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APP_SETTINGS;
    return {
      masterVolume: clampVolume(parsed.masterVolume, DEFAULT_APP_SETTINGS.masterVolume),
      bgmVolume: clampVolume(parsed.bgmVolume, DEFAULT_APP_SETTINGS.bgmVolume),
      sfxVolume: clampVolume(parsed.sfxVolume, DEFAULT_APP_SETTINGS.sfxVolume),
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_APP_SETTINGS.muted,
      animSpeedMode: isAnimSpeedMode(parsed.animSpeedMode)
        ? parsed.animSpeedMode
        : DEFAULT_APP_SETTINGS.animSpeedMode,
      combatVfxEnabled:
        typeof parsed.combatVfxEnabled === 'boolean'
          ? parsed.combatVfxEnabled
          : DEFAULT_APP_SETTINGS.combatVfxEnabled,
      scanlineFxEnabled:
        typeof parsed.scanlineFxEnabled === 'boolean'
          ? parsed.scanlineFxEnabled
          : DEFAULT_APP_SETTINGS.scanlineFxEnabled,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

function persistSettings(next: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(LEGACY_ANIM_SPEED_KEY, next.animSpeedMode);
  } catch {
    // 忽略存储写入异常
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getAppSettings(): AppSettings {
  if (cachedSettings === null) {
    cachedSettings = loadSettingsFromStorage();
  }
  return cachedSettings;
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const next: AppSettings = {
    masterVolume:
      patch.masterVolume !== undefined
        ? clampVolume(patch.masterVolume, current.masterVolume)
        : current.masterVolume,
    bgmVolume:
      patch.bgmVolume !== undefined
        ? clampVolume(patch.bgmVolume, current.bgmVolume)
        : current.bgmVolume,
    sfxVolume:
      patch.sfxVolume !== undefined
        ? clampVolume(patch.sfxVolume, current.sfxVolume)
        : current.sfxVolume,
    muted: typeof patch.muted === 'boolean' ? patch.muted : current.muted,
    animSpeedMode: isAnimSpeedMode(patch.animSpeedMode)
      ? patch.animSpeedMode
      : current.animSpeedMode,
    combatVfxEnabled:
      typeof patch.combatVfxEnabled === 'boolean'
        ? patch.combatVfxEnabled
        : current.combatVfxEnabled,
    scanlineFxEnabled:
      typeof patch.scanlineFxEnabled === 'boolean'
        ? patch.scanlineFxEnabled
        : current.scanlineFxEnabled,
  };
  cachedSettings = next;
  persistSettings(next);
  notifyListeners();
  return next;
}

export function resetAppSettings(): AppSettings {
  cachedSettings = { ...DEFAULT_APP_SETTINGS };
  persistSettings(cachedSettings);
  notifyListeners();
  return cachedSettings;
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    () => DEFAULT_APP_SETTINGS,
  );
}
