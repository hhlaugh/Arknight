import React, { useEffect, useState } from 'react';
import type { CardId } from '../../game/types';
import { getCardPresentation, resolveAssetUrl, type CardPresentation } from '../../data/card-presentation';
import { CLASS_COLOR, CLASS_LABEL } from '../../client/gameData';
import { RARITY_THEMES } from '../ui/tokens';

export type PortraitVariant = 'portrait' | 'avatar' | 'mini';

interface OperatorPortraitProps {
  readonly cardId: CardId;
  readonly presentation?: CardPresentation;
  readonly variant?: PortraitVariant;
  readonly className?: string;
  readonly alt?: string;
}

/**
 * 职业专属几何战术标志（SVG）
 */
export function ProfessionIcon({ profession, color }: { readonly profession: string; readonly color: string }) {
  switch (profession) {
    case 'vanguard': // 先锋：冲锋双三角
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M4 12l8-8v16L4 12z" fill={color} fillOpacity="0.25" />
          <path d="M12 12l8-8v16l-8-8z" fill={color} fillOpacity="0.5" />
        </svg>
      );
    case 'guard': // 近卫：利刃对剑
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M6 19L19 6M19 6v7M19 6h-7" />
          <path d="M5 5l4 4M15 15l4 4" strokeOpacity="0.5" />
        </svg>
      );
    case 'defender': // 重装：棱面坚盾
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 3l8 4v6c0 5-4 8-8 9-4-1-8-4-8-9V7l8-4z" fill={color} fillOpacity="0.25" />
          <path d="M12 7v10M8 10h8" />
        </svg>
      );
    case 'sniper': // 狙击：精准准星
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="7" strokeDasharray="3 2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
    case 'caster': // 术师：源石能量多面体
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 2l7 5v10l-7 5-7-5V7l7-5z" fill={color} fillOpacity="0.2" />
          <circle cx="12" cy="12" r="3" fill={color} />
        </svg>
      );
    case 'medic': // 医疗：战术双环十字
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="4" width="4" height="16" rx="1" fill={color} />
          <rect x="4" y="10" width="16" height="4" rx="1" fill={color} />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </svg>
      );
    case 'supporter': // 辅助：折射增幅棱镜
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <polygon points="12 3 21 19 3 19" fill={color} fillOpacity="0.25" />
          <polygon points="12 8 17 17 7 17" strokeDasharray="2 1" />
        </svg>
      );
    case 'specialist': // 特种：多功能战术刺标
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 2l3 7h7l-6 4 3 8-7-5-7 5 3-8-6-4h7l3-7z" fill={color} fillOpacity="0.25" />
        </svg>
      );
    case 'tactic': // 战术：指挥指令符
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    default: // 支援 / 其他
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
  }
}

/**
 * 罗德岛战术终端卡牌立绘 / 头像渲染组件
 *
 * 核心设计：
 * 1. 从 CardPresentation 加载对应素材（portrait / avatar），并在切换 cardId 时重置错误状态。
 * 2. 若图片不存在（404）或加载错误，优雅降级为具有明日方舟战术风格的 SVG 剪影占位。
 * 3. 完整展示角色中文名、英文代号、职业战术图标与稀有度视觉氛围，绝不导致崩溃或闪烁。
 */
export function OperatorPortrait({
  cardId,
  presentation,
  variant = 'portrait',
  className = '',
  alt,
}: OperatorPortraitProps) {
  const p = presentation ?? getCardPresentation(cardId);
  const assetUrl = resolveAssetUrl(
    variant === 'avatar' || variant === 'mini' ? p.assets.avatar : p.assets.portrait,
  );
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [assetUrl]);

  const classColor = CLASS_COLOR[p.profession] ?? '#94a3b8';
  const classLabelZh = CLASS_LABEL[p.profession] ?? p.profession;
  const rarityTheme = RARITY_THEMES[p.rarity as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];

  if (assetUrl && !imgFailed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={assetUrl}
          alt={alt ?? `${p.codeNameZh} (${p.codeNameEn})`}
          className="w-full h-full"
          style={{
            objectFit: variant === 'avatar' || variant === 'mini' ? 'cover' : (p.display.portraitFit ?? 'contain'),
            objectPosition:
              variant === 'avatar' || variant === 'mini'
                ? 'center 20%'
                : (p.display.objectPosition ?? p.display.portraitPosition ?? 'center 20%'),
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  // --- 终端剪影兜底 (Tactical Terminal Silhouette Fallback) ---
  if (variant === 'mini') {
    return (
      <div
        className={`relative flex items-center justify-center bg-[#131820] border border-slate-700/70 overflow-hidden ${className}`}
        style={{ borderLeftColor: classColor, borderLeftWidth: 3 }}
        aria-label={alt ?? p.codeNameZh}
      >
        <div className="w-4 h-4 opacity-90">
          <ProfessionIcon profession={p.profession} color={classColor} />
        </div>
      </div>
    );
  }

  if (variant === 'avatar') {
    return (
      <div
        className={`relative flex flex-col items-center justify-center bg-gradient-to-b from-[#1e2631] to-[#0f1318] border border-slate-700/80 overflow-hidden select-none ${className}`}
        aria-label={alt ?? p.codeNameZh}
      >
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px)',
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: classColor }} />
        <div className="w-4/6 h-4/6 z-10 opacity-90 flex items-center justify-center">
          <ProfessionIcon profession={p.profession} color={classColor} />
        </div>
      </div>
    );
  }

  // 默认 vertical portrait 战术剪影表现
  return (
    <div
      className={`relative flex flex-col items-center justify-between p-2.5 bg-gradient-to-b from-[#1a2029] via-[#131820] to-[#0c1015] overflow-hidden select-none ${className}`}
      aria-label={alt ?? `${p.codeNameZh} (${p.codeNameEn})`}
    >
      {/* 稀有度微光与战术网格 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 42%, ${rarityTheme.glow} 0%, transparent 62%),
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 16px 16px, 16px 16px',
        }}
      />

      {/* 背景倾斜战术纹理 */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 11px)',
        }}
      />

      {/* 中央罗德岛六边形战术徽章 */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center px-2">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <polygon
              points="50 4, 90 27, 90 73, 50 96, 10 73, 10 27"
              fill="none"
              stroke={rarityTheme.color}
              strokeOpacity="0.4"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <polygon
              points="50 14, 81 32, 81 68, 50 86, 19 68, 19 32"
              fill={classColor}
              fillOpacity="0.1"
              stroke={classColor}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center p-5">
            <ProfessionIcon profession={p.profession} color={classColor} />
          </div>
        </div>

        <div className="mt-1 text-[10px] font-mono tracking-widest uppercase text-slate-400">
          {classLabelZh} · {p.codeNameEn}
        </div>
      </div>

      {/* 底部轻微编号水印 */}
      <div className="relative z-10 w-full flex items-center justify-between text-[9px] font-mono text-slate-500/90 border-t border-slate-800/70 pt-1">
        <span className="truncate">{p.operatorId}</span>
        <span>{p.rarity}★</span>
      </div>
    </div>
  );
}
