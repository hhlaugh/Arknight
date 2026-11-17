import { useEffect, useState } from 'react';

export interface ViewportInfo {
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean; // < 1024px (Mobile & Tablet)
  readonly isPhone: boolean; // < 640px (Small Phone)
  readonly isLandscape: boolean;
  readonly isShortViewport: boolean; // < 720px tall
  readonly isCompactLandscape: boolean; // Landscape with short height (< 540px, e.g. rotated phone)
}

function readViewport(): ViewportInfo {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 800,
      isMobile: false,
      isPhone: false,
      isLandscape: true,
      isShortViewport: false,
      isCompactLandscape: false,
    };
  }
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  const isLandscape = width > height;
  return {
    width,
    height,
    isMobile: width < 1024,
    isPhone: width < 640,
    isLandscape,
    isShortViewport: height < 720,
    isCompactLandscape: isLandscape && height < 540,
  };
}

/**
 * 响应式视口检测 Hook
 * 实时追踪屏幕宽高、横竖屏与超矮视口状态，支撑手机竖屏/横屏/平板/桌面多比例适配
 */
export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => readViewport());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const next = readViewport();
      setInfo((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.isMobile === next.isMobile &&
        prev.isPhone === next.isPhone &&
        prev.isLandscape === next.isLandscape &&
        prev.isShortViewport === next.isShortViewport &&
        prev.isCompactLandscape === next.isCompactLandscape
          ? prev
          : next,
      );
    };

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return info;
}

export function useIsMobile(): boolean {
  return useViewport().isMobile;
}
