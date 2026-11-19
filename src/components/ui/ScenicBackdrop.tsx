import React from 'react';

export type ScenicSceneId =
  | 'rhodes-exterior'
  | 'rhodes-bridge'
  | 'rhodes-command'
  | 'terra-landscape'
  | 'lungmen-night'
  | 'snowfield';

export type ScenicFadeDirection = 'left' | 'right' | 'top' | 'diagonal-tr' | 'radial';

export interface ScenicSceneMeta {
  readonly src: string;
  readonly label: string;
  readonly defaultFilter?: string;
}

export const SCENIC_SCENES: Record<ScenicSceneId, ScenicSceneMeta> = {
  'rhodes-exterior': {
    src: './assets/arknights/backgrounds/bg_rhodes_exterior.png',
    label: '罗德岛舰体外部晨景',
    defaultFilter: 'brightness(0.88) contrast(1.06)',
  },
  'rhodes-bridge': {
    src: './assets/arknights/backgrounds/bg_rhodes_bridge.png',
    label: '罗德岛舰桥观景走廊',
    defaultFilter: 'brightness(0.84) contrast(1.06)',
  },
  'rhodes-command': {
    src: './assets/arknights/backgrounds/bg_rhodes_command.png',
    label: '罗德岛战术指挥中枢',
    defaultFilter: 'brightness(0.92) contrast(1.08)',
  },
  'terra-landscape': {
    src: './assets/arknights/backgrounds/bg_terra_landscape.png',
    label: '泰拉山岳水墨远景',
    defaultFilter: 'brightness(0.58) contrast(1.12) saturate(0.85)',
  },
  'lungmen-night': {
    src: './assets/arknights/backgrounds/bg_lungmen_night.png',
    label: '龙门不夜城天际线',
    defaultFilter: 'brightness(0.86) contrast(1.08)',
  },
  snowfield: {
    src: './assets/arknights/backgrounds/bg_snowfield.png',
    label: '极地雪原前哨风光',
    defaultFilter: 'brightness(0.68) contrast(1.08) saturate(0.9)',
  },
};

function getFadeMask(fade: ScenicFadeDirection): string {
  switch (fade) {
    case 'right':
      return 'linear-gradient(96deg, rgba(0,0,0,0.06) 8%, rgba(0,0,0,0.42) 44%, rgba(0,0,0,0.92) 78%, rgba(0,0,0,1) 100%)';
    case 'left':
      return 'linear-gradient(264deg, rgba(0,0,0,0.06) 8%, rgba(0,0,0,0.42) 44%, rgba(0,0,0,0.92) 78%, rgba(0,0,0,1) 100%)';
    case 'top':
      return 'linear-gradient(180deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.68) 46%, rgba(0,0,0,0.14) 84%, rgba(0,0,0,0.02) 100%)';
    case 'diagonal-tr':
      return 'linear-gradient(218deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.72) 42%, rgba(0,0,0,0.18) 76%, rgba(0,0,0,0.04) 100%)';
    case 'radial':
    default:
      return 'radial-gradient(ellipse at 65% 32%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.52) 55%, rgba(0,0,0,0.08) 100%)';
  }
}

function getOverlayScrim(fade: ScenicFadeDirection, baseColor: string, tint?: string): string {
  const accentLayer = tint ? `${tint}, ` : '';
  switch (fade) {
    case 'right':
      return `${accentLayer}linear-gradient(96deg, ${baseColor}f5 0%, ${baseColor}d1 38%, ${baseColor}7a 74%, ${baseColor}9e 100%), linear-gradient(180deg, ${baseColor}47 0%, transparent 45%, ${baseColor}e6 100%)`;
    case 'left':
      return `${accentLayer}linear-gradient(264deg, ${baseColor}f5 0%, ${baseColor}d1 38%, ${baseColor}7a 74%, ${baseColor}9e 100%), linear-gradient(180deg, ${baseColor}47 0%, transparent 45%, ${baseColor}e6 100%)`;
    case 'top':
      return `${accentLayer}linear-gradient(180deg, ${baseColor}52 0%, ${baseColor}99 48%, ${baseColor}f2 88%, ${baseColor} 100%)`;
    case 'diagonal-tr':
      return `${accentLayer}linear-gradient(38deg, ${baseColor}fa 12%, ${baseColor}d6 48%, ${baseColor}5e 86%, ${baseColor}7a 100%)`;
    case 'radial':
    default:
      return `${accentLayer}radial-gradient(circle at 60% 35%, ${baseColor}4d 0%, ${baseColor}cc 68%, ${baseColor}fa 100%)`;
  }
}

interface ScenicBackdropProps {
  readonly scene: ScenicSceneId;
  readonly fade?: ScenicFadeDirection;
  readonly fixed?: boolean;
  readonly opacityClassName?: string;
  readonly baseColor?: string;
  readonly tint?: string;
  readonly className?: string;
}

/**
 * 半边淡出官方风景氛围背景层：
 * 将明日方舟官方场景原画与终端深色底板通过方向性渐变遮罩（mask + scrim）平滑衔接，
 * 在保留半侧原画辨识度的同时保证前景文本与表单的 WCAG AA 对比度。
 */
export function ScenicBackdrop({
  scene,
  fade = 'diagonal-tr',
  fixed = false,
  opacityClassName = 'opacity-[0.38]',
  baseColor = '#12161b',
  tint,
  className = '',
}: ScenicBackdropProps) {
  const meta = SCENIC_SCENES[scene];
  const maskImage = getFadeMask(fade);
  const scrimBackground = getOverlayScrim(fade, baseColor, tint);

  return (
    <div
      data-testid="scenic-backdrop"
      data-scene={scene}
      aria-hidden="true"
      className={`pointer-events-none ${fixed ? 'fixed' : 'absolute'} inset-0 overflow-hidden z-0 select-none ${className}`}
    >
      <img
        src={meta.src}
        alt=""
        referrerPolicy="no-referrer"
        className={`w-full h-full object-cover scale-[1.03] transition-opacity duration-500 ${opacityClassName}`}
        style={{
          filter: meta.defaultFilter,
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: scrimBackground }}
      />
    </div>
  );
}

interface ScenicBannerLayerProps {
  readonly scene: ScenicSceneId;
  readonly fade?: ScenicFadeDirection;
  readonly opacityClassName?: string;
  readonly tint?: string;
  readonly className?: string;
}

/**
 * 面板内部（Hero 区 / 页眉区）专用的半淡出官方风景层：
 * 类似结算界面的右侧半透明插画融入手感，让左侧文字区域保持高对比暗底，右侧自然透出官方风景。
 */
export function ScenicBannerLayer({
  scene,
  fade = 'right',
  opacityClassName = 'opacity-45',
  tint = 'radial-gradient(circle at 78% 42%, rgba(56,189,248,0.14) 0%, transparent 62%)',
  className = '',
}: ScenicBannerLayerProps) {
  const meta = SCENIC_SCENES[scene];
  const maskImage = getFadeMask(fade);
  const scrimBackground = getOverlayScrim(fade, '#131820', tint);

  return (
    <div
      data-testid="scenic-banner-layer"
      data-scene={scene}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none z-0 ${className}`}
    >
      <img
        src={meta.src}
        alt=""
        referrerPolicy="no-referrer"
        className={`w-full h-full object-cover ${opacityClassName}`}
        style={{
          filter: meta.defaultFilter,
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: scrimBackground }}
      />
    </div>
  );
}
