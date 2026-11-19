import React from 'react';

export type OrundumIconSize = 'xs' | 'sm' | 'md' | 'lg';

interface OrundumIconProps {
  readonly size?: OrundumIconSize;
  readonly className?: string;
}

const SIZE_CLASSES: Record<OrundumIconSize, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

/**
 * 明日方舟官方合成玉（Orundum / DIAMOND_SHD）实物素材图标
 * 替代字符占位，支持随字号自适应并附带轻微晶石投影
 */
export function OrundumIcon({ size = 'sm', className = '' }: OrundumIconProps) {
  return (
    <img
      src="./assets/arknights/items/orundum.png"
      alt="合成玉"
      referrerPolicy="no-referrer"
      data-testid="orundum-icon"
      className={`inline-block shrink-0 object-contain align-middle select-none drop-shadow-[0_0_6px_rgba(244,63,94,0.45)] ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}
