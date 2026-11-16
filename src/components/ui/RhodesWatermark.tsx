import React from 'react';

/**
 * 主界面全屏罗德岛 & PRTS 官方纹章暗纹背景层：
 * - 采用真实官方罗德岛制药（Rhodes Island）白盾纹章平铺斜向暗纹
 * - 左上角罗德岛制药暗色主纹章 + 右下角 PRTS 菱形终端徽记平衡构图
 */
export function RhodesWatermarkBackdrop() {
  return (
    <div
      data-testid="rhodes-watermark"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
    >
      {/* 平铺斜向真实罗德岛徽章暗纹 */}
      <div
        className="absolute -inset-28 -rotate-12 opacity-[0.075]"
        style={{
          backgroundImage: "url('./assets/arknights/logos/rhodes_island_light.png')",
          backgroundRepeat: 'repeat',
          backgroundSize: '148px 148px',
        }}
      />

      {/* 左上与右下大型官方主纹章水印 */}
      <img
        src="./assets/arknights/logos/rhodes_island_dark.png"
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="absolute -left-16 -top-16 w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] object-contain opacity-[0.16] -rotate-12"
      />
      <img
        src="./assets/arknights/logos/prts_diamond.png"
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="absolute -right-14 -bottom-16 w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] object-contain opacity-[0.11] rotate-6"
      />
    </div>
  );
}
