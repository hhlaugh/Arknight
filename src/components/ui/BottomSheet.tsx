import React, { useEffect } from 'react';
import { Button } from './Button';
import { ScenicBannerLayer, type ScenicSceneId } from './ScenicBackdrop';

export interface BottomSheetProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: React.ReactNode;
  readonly codeName?: string;
  readonly headerScene?: ScenicSceneId;
  readonly children: React.ReactNode;
  readonly maxHeight?: string;
  readonly className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  codeName = 'SYS.DRAWER',
  headerScene = 'rhodes-command',
  children,
  maxHeight = 'max-h-[85dvh]',
  className = '',
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
      {/* Backdrop */}
      <div className="flex-1 min-h-0" onClick={onClose} aria-hidden="true" />

      {/* Sheet Content */}
      <div
        className={`w-full bg-[#1b2025] border-t-2 border-[#e5a52b] text-[#e8e9e6] shadow-2xl flex flex-col overflow-hidden ${maxHeight} ${className}`}
      >
        {/* Handle / Drag Bar */}
        <div className="w-full flex items-center justify-center pt-1.5 pb-1 cursor-grab shrink-0" onClick={onClose}>
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="relative flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 border-b border-[#313a42] bg-[#171a1d] shrink-0 overflow-hidden">
          <ScenicBannerLayer scene={headerScene} fade="right" opacityClassName="opacity-35" />
          <div className="relative z-10 flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-3.5 bg-[#e5a52b] shrink-0" />
            <span className="font-bold text-xs tracking-wider text-slate-100 uppercase truncate">{title}</span>
            {codeName && (
              <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase shrink-0 hidden sm:inline">
                // {codeName}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="relative z-10 px-2 py-0.5 text-xs text-slate-400 shrink-0">
            ✕
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 p-2.5 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
