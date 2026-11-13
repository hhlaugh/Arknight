import React, { useEffect, useRef, useState } from 'react';

export interface HealthBarProps {
  readonly currentHp: number;
  readonly maxHp: number;
  readonly shield?: number;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly showNumbers?: boolean;
  readonly disableMotion?: boolean;
  readonly className?: string;
}

export function HealthBar({
  currentHp,
  maxHp,
  shield = 0,
  size = 'md',
  showNumbers = true,
  disableMotion = false,
  className = '',
}: HealthBarProps) {
  const safeMax = Math.max(1, maxHp);
  const hpPercent = Math.min(100, Math.max(0, (currentHp / safeMax) * 100));
  const shieldPercent = Math.min(100, (shield / safeMax) * 100);

  const [trailPercent, setTrailPercent] = useState<number>(hpPercent);
  const prevHpPercentRef = useRef<number>(hpPercent);

  useEffect(() => {
    const prev = prevHpPercentRef.current;
    prevHpPercentRef.current = hpPercent;

    if (disableMotion || hpPercent >= prev) {
      setTrailPercent(hpPercent);
      return;
    }

    // HP 下降时保留短暂残影条，随后平滑缩回当前比例
    setTrailPercent(prev);
    const timer = window.setTimeout(() => {
      setTrailPercent(hpPercent);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hpPercent, disableMotion]);

  // Health color status
  let hpColor = '#34d399'; // Emerald
  if (hpPercent <= 25) {
    hpColor = '#f87171'; // Red / critical
  } else if (hpPercent <= 50) {
    hpColor = '#fbbf24'; // Yellow / warning
  }

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  }[size];

  return (
    <div className={`w-full flex flex-col gap-0.5 select-none ${className}`}>
      {showNumbers && (
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums leading-none tracking-tight">
          <span className="text-slate-400 font-semibold">HP</span>
          <div className="flex items-center gap-1 font-bold">
            <span style={{ color: hpColor }}>{currentHp}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{maxHp}</span>
            {shield > 0 && (
              <span className="text-sky-400 text-[9px] bg-sky-950/80 px-1 py-0.2 border border-sky-500/40">
                +{shield}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Progress Track */}
      <div className={`relative w-full ${heightClasses} bg-slate-900 border border-slate-700/80 overflow-hidden`}>
        {/* Base Grid / Tick marks */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none z-20"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255,255,255,0.4) 19px, rgba(255,255,255,0.4) 20px)',
          }}
        />

        {/* Delayed Damage Trail Fill */}
        {trailPercent > hpPercent && (
          <div
            className={`absolute inset-y-0 left-0 bg-amber-200/80 z-0 ${
              disableMotion ? '' : 'transition-all duration-500 ease-out'
            }`}
            style={{ width: `${trailPercent}%` }}
          />
        )}

        {/* Current HP Fill */}
        <div
          className={`relative z-10 h-full ${disableMotion ? '' : 'transition-all duration-300 ease-out'}`}
          style={{
            width: `${hpPercent}%`,
            backgroundColor: hpColor,
          }}
        />

        {/* Shield Overlay Fill */}
        {shield > 0 && (
          <div
            className={`absolute top-0 bottom-0 bg-sky-400/75 border-r border-sky-200 z-30 ${
              disableMotion ? '' : 'transition-all duration-300 ease-out'
            }`}
            style={{
              left: `${Math.min(100, hpPercent)}%`,
              width: `${Math.min(100 - hpPercent, shieldPercent)}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
