import React, { useEffect, useRef } from 'react';

interface DynamicBattlefieldBackdropProps {
  /** Arknights 主题战场底图 URL（已静态导入或相对路径资源） */
  readonly backdropUrl?: string;
  /** 关闭动效（用户设置关闭或处于弱动效模式时暂停 canvas 与 CSS 位移） */
  readonly disableMotion?: boolean;
}

export type BattlefieldParticleKind = 'snowflake' | 'debris' | 'ember' | 'light_mote';

interface AmbientParticle {
  kind: BattlefieldParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  twinkleSpeed: number;
  rotation: number;
  rotSpeed: number;
  swayAmp: number;
  hasHalo: boolean;
  tone: 'amber' | 'cyan' | 'frost' | 'slate';
}

const PARTICLE_COUNT = 72;

function createParticles(width: number, height: number): AmbientParticle[] {
  const safeW = Math.max(width, 320);
  const safeH = Math.max(height, 240);
  const particles: AmbientParticle[] = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // 确定性伪随机分布，避免首次渲染与重置闪烁剧烈变化
    const seedA = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const seedB = Math.sin((i + 1) * 78.233) * 24634.6345;
    const seedC = Math.sin((i + 1) * 45.164) * 19283.7123;
    const seedD = Math.sin((i + 1) * 93.719) * 31572.4193;
    const rA = seedA - Math.floor(seedA);
    const rB = seedB - Math.floor(seedB);
    const rC = seedC - Math.floor(seedC);
    const rD = seedD - Math.floor(seedD);

    // 多样化粒子种类轮转：漂浮雪花、掉落碎屑、上浮源石余烬、光影散景颗粒
    const kindRoll = i % 10;
    const kind: BattlefieldParticleKind =
      kindRoll < 3
        ? 'snowflake'
        : kindRoll < 5
          ? 'debris'
          : kindRoll < 8
            ? 'ember'
            : 'light_mote';

    if (kind === 'snowflake') {
      particles.push({
        kind,
        x: rA * safeW,
        y: rB * safeH,
        vx: -8 + rC * 16,
        vy: 10 + rD * 14, // 轻柔飘落
        size: 2.0 + rC * 2.2,
        alpha: 0.28 + rB * 0.28,
        phase: rA * Math.PI * 2,
        twinkleSpeed: 1.1 + rD * 1.3,
        rotation: rC * Math.PI,
        rotSpeed: (rD - 0.5) * 0.9,
        swayAmp: 12 + rC * 10,
        hasHalo: i % 4 === 0,
        tone: 'frost',
      });
    } else if (kind === 'debris') {
      particles.push({
        kind,
        x: rA * safeW,
        y: rB * safeH,
        vx: (rC - 0.5) * 14,
        vy: 18 + rD * 22, // 较重战尘碎屑向下翻滚掉落
        size: 1.6 + rC * 2.1,
        alpha: 0.22 + rB * 0.26,
        phase: rA * Math.PI * 2,
        twinkleSpeed: 0.8 + rD * 1.1,
        rotation: rC * Math.PI * 2,
        rotSpeed: (rD - 0.5) * 3.4,
        swayAmp: 4 + rC * 6,
        hasHalo: false,
        tone: i % 3 === 0 ? 'amber' : 'slate',
      });
    } else if (kind === 'ember') {
      const isHeroSpark = i % 5 === 0;
      particles.push({
        kind,
        x: rA * safeW,
        y: rB * safeH,
        vx: (rC - 0.38) * 16,
        vy: -(11 + rD * 17), // 热流带动源石火花向上飘升
        size: isHeroSpark ? 2.2 + rC * 1.1 : 1.3 + rC * 0.9,
        alpha: isHeroSpark ? 0.54 + rB * 0.24 : 0.34 + rB * 0.28,
        phase: rA * Math.PI * 2,
        twinkleSpeed: 1.8 + rD * 2.2,
        rotation: Math.PI / 4,
        rotSpeed: (rC - 0.5) * 0.6,
        swayAmp: 8 + rD * 7,
        hasHalo: true,
        tone: 'amber',
      });
    } else {
      // Arknights 战斗场景风格光影颗粒（散景光斑）
      particles.push({
        kind,
        x: rA * safeW,
        y: rB * safeH,
        vx: (rC - 0.5) * 10,
        vy: (rD - 0.52) * 8, // 缓慢悬浮游弋
        size: 2.6 + rC * 2.6,
        alpha: 0.26 + rB * 0.26,
        phase: rA * Math.PI * 2,
        twinkleSpeed: 1.2 + rD * 1.6,
        rotation: 0,
        rotSpeed: 0,
        swayAmp: 10 + rC * 10,
        hasHalo: true,
        tone: i % 2 === 0 ? 'cyan' : 'amber',
      });
    }
  }
  return particles;
}

function particleRgb(tone: AmbientParticle['tone']): string {
  switch (tone) {
    case 'amber':
      return '245, 178, 52';
    case 'cyan':
      return '56, 189, 248';
    case 'frost':
      return '224, 242, 254';
    case 'slate':
      return '148, 163, 184';
  }
}

/**
 * BattleView 商业级动态 Arknights 战场氛围背景层：
 * 1. 底层 Arknights 装甲战场底图配合 CSS 合成层轻微缓动呼吸（anim-arena-drift）
 * 2. 反向缓慢漂移的罗德岛塔形暗纹（anim-emblem-drift）与基座对比度压暗遮罩
 * 3. 双层径向渐变（Radial Gradient）聚光灯照明遮罩，通过 CSS 动画缓慢漂移（anim-spotlight-drift）
 * 4. CSS 动画天气遮罩层（anim-weather-haze / anim-weather-shimmer）：轻微模糊滤镜随时间摆动，模拟烟雾与热浪扭曲
 * 5. Canvas 多样化战场粒子系统：漂浮雪花、掉落碎屑、上浮源石余烬与 Arknights 光影散景颗粒
 */
export function DynamicBattlefieldBackdrop({
  backdropUrl,
  disableMotion = false,
}: DynamicBattlefieldBackdropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const motionOff = disableMotion || prefersReducedMotion;

    let width = Math.max(container.clientWidth, 320);
    let height = Math.max(container.clientHeight, 240);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = createParticles(width, height);

    const resizeCanvas = () => {
      if (!container || !canvas) return;
      width = Math.max(container.clientWidth, 320);
      height = Math.max(container.clientHeight, 240);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(width, height);
    };

    resizeCanvas();

    const drawFrame = (elapsedSec: number, dtSec: number) => {
      ctx.clearRect(0, 0, width, height);

      // 1. 缓慢移动的 PRTS 战术坐标网格与微弱扫描光带
      const gridShiftX = motionOff ? 0 : (elapsedSec * 9) % 96;
      const gridShiftY = motionOff ? 0 : (elapsedSec * 5) % 96;
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.042)';
      ctx.lineWidth = 1;
      for (let gx = -96 + gridShiftX; gx < width + 96; gx += 96) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = -96 + gridShiftY; gy < height + 96; gy += 96) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      if (!motionOff) {
        const sweepY = ((elapsedSec * 28) % (height + 160)) - 80;
        const grad = ctx.createLinearGradient(0, sweepY - 54, 0, sweepY + 54);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.06)');
        grad.addColorStop(1, 'rgba(229, 165, 43, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, sweepY - 54, width, 108);
      }
      ctx.restore();

      // 2. 多样化战场粒子效果：漂浮雪花、掉落碎屑、源石余烬与光影颗粒
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        if (!motionOff && dtSec > 0) {
          p.x += (p.vx + Math.sin(elapsedSec * 0.9 + p.phase) * p.swayAmp) * dtSec;
          p.y += p.vy * dtSec;
          p.rotation += p.rotSpeed * dtSec;

          // 按粒子重力方向平滑循环边界
          if (p.vy >= 0 && p.y > height + 18) {
            p.y = -14;
            p.x = (((p.x + width * 0.29) % width) + width) % width;
          } else if (p.vy < 0 && p.y < -18) {
            p.y = height + 14;
            p.x = (((p.x + width * 0.37) % width) + width) % width;
          }
          if (p.x < -18) p.x = width + 14;
          if (p.x > width + 18) p.x = -14;
        }

        const yNorm = Math.max(0, Math.min(1, p.y / height));
        const edgeFade = Math.min(yNorm / 0.14, (1 - yNorm) / 0.14, 1);
        const pulse = motionOff
          ? 0.9
          : 0.65 + 0.35 * Math.sin(elapsedSec * p.twinkleSpeed + p.phase);
        const alpha = p.alpha * pulse * edgeFade;
        if (alpha <= 0.01) continue;

        const rgb = particleRgb(p.tone);

        if (p.hasHalo) {
          const haloRadius = p.kind === 'light_mote' ? p.size * 3.8 : p.size * 4.2;
          const haloGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloRadius);
          haloGrad.addColorStop(
            0,
            `rgba(${rgb}, ${(alpha * (p.kind === 'light_mote' ? 0.55 : 0.4)).toFixed(3)})`,
          );
          haloGrad.addColorStop(0.55, `rgba(${rgb}, ${(alpha * 0.15).toFixed(3)})`);
          haloGrad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, haloRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (p.kind === 'snowflake') {
          // 六角雪花结晶（Arknights 切尔诺伯格寒夜风雪质感）
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, p.size * 0.28);
          ctx.lineCap = 'round';
          for (let arm = 0; arm < 3; arm++) {
            const ang = (arm * Math.PI) / 3;
            const dx = Math.cos(ang) * p.size;
            const dy = Math.sin(ang) * p.size;
            ctx.beginPath();
            ctx.moveTo(-dx, -dy);
            ctx.lineTo(dx, dy);
            ctx.stroke();
          }
          ctx.restore();
        } else if (p.kind === 'debris') {
          // 旋转掉落的战损不规则碎屑薄片
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.9, -p.size * 0.45);
          ctx.lineTo(p.size * 0.8, -p.size * 0.25);
          ctx.lineTo(p.size * 0.5, p.size * 0.55);
          ctx.lineTo(-p.size * 0.65, p.size * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (p.kind === 'ember') {
          // 源石菱形余烬火花
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          const s = p.size * 1.45;
          ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
          ctx.restore();
        } else {
          // Arknights 光影散景颗粒
          ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.72).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.68, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    drawFrame(0, 0);

    let rafId = 0;
    let lastTs = performance.now();
    const startTs = lastTs;

    const tick = (now: number) => {
      if (document.hidden) {
        lastTs = now;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - lastTs) / 1000, 0.05);
      const elapsed = (now - startTs) / 1000;
      lastTs = now;
      drawFrame(elapsed, dt);
      rafId = window.requestAnimationFrame(tick);
    };

    if (!motionOff) {
      rafId = window.requestAnimationFrame(tick);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', resizeCanvas);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [disableMotion]);

  return (
    <div
      ref={containerRef}
      data-testid="battlefield-backdrop"
      data-motion-disabled={disableMotion ? 'true' : 'false'}
      data-particle-kinds="snowflake,debris,ember,light_mote"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0a0d12]"
    >
      {/* 1. Arknights 装甲战场底图 + 轻微呼吸平移 CSS 动效 */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          referrerPolicy="no-referrer"
          className={`absolute inset-0 w-full h-full object-cover opacity-[0.46] will-change-transform ${
            disableMotion ? 'scale-[1.06]' : 'anim-arena-drift'
          }`}
        />
      )}

      {/* 2. 反向缓动罗德岛制药塔形徽章暗纹 */}
      <div
        className={`absolute -inset-8 flex items-center justify-center will-change-transform ${
          disableMotion ? '' : 'anim-emblem-drift'
        }`}
      >
        <img
          src="./assets/arknights/logos/rhodes_island_dark.png"
          alt=""
          referrerPolicy="no-referrer"
          className="w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] object-contain opacity-[0.065] select-none"
        />
      </div>

      {/* 3. 基础对比度压暗遮罩：稳固底层纹理对比，为聚光灯与前景卡牌留出明暗层次 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,13,18,0.44) 0%, rgba(10,13,18,0.8) 76%, rgba(7,9,13,0.94) 100%)',
        }}
      />

      {/* 4. 主战场径向渐变（Radial Gradient）聚光灯照明遮罩层：模拟战区顶光缓慢漂移 */}
      <div
        data-testid="battlefield-spotlight-mask"
        className={`absolute -inset-[28%] will-change-transform ${
          disableMotion ? 'opacity-80' : 'anim-spotlight-drift'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(255,224,154,0.22) 0%, rgba(229,165,43,0.12) 22%, rgba(56,189,248,0.06) 42%, rgba(9,12,17,0.45) 68%, rgba(6,8,12,0.78) 100%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* 5. 次级反向漂移 PRTS 青蓝探照聚光灯遮罩 */}
      <div
        data-testid="battlefield-spotlight-secondary"
        className={`absolute -inset-[25%] will-change-transform ${
          disableMotion ? 'opacity-55' : 'anim-spotlight-secondary'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 46% 38% at 50% 50%, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0.05) 45%, transparent 74%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* 6. 天气烟雾与热浪模糊遮罩层：通过 CSS 动画微幅摆动模糊滤镜，营造硝烟与大气热流 */}
      <div
        data-testid="battlefield-weather-haze"
        className={`absolute -inset-12 will-change-transform ${
          disableMotion ? 'opacity-30' : 'anim-weather-haze'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 68% 42% at 24% 34%, rgba(148,163,184,0.15) 0%, transparent 68%), radial-gradient(ellipse 64% 48% at 76% 68%, rgba(229,165,43,0.12) 0%, transparent 70%), linear-gradient(160deg, rgba(15,23,42,0) 20%, rgba(56,189,248,0.08) 50%, rgba(15,23,42,0) 80%)',
        }}
      />

      <div
        data-testid="battlefield-weather-shimmer"
        className={`absolute -inset-10 will-change-transform ${
          disableMotion ? 'opacity-20' : 'anim-weather-shimmer'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 52% 30% at 52% 58%, rgba(251,191,36,0.11) 0%, rgba(56,189,248,0.06) 45%, transparent 75%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* 7. PRTS 扫描纹理层（受系统设置扫描线开关控制） */}
      <div
        className="prts-scanlines absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)',
        }}
      />

      {/* 8. Canvas 实时多样化战场粒子层：雪花、战损碎屑、源石余烬与光影散景颗粒 */}
      <canvas
        ref={canvasRef}
        data-testid="battlefield-ambient-canvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full block"
      />

      {/* 9. 边缘暗角聚光收敛框：强化战区中心视觉焦点并保证外围文字对比度 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 48%, rgba(7,9,13,0.52) 86%, rgba(5,7,11,0.82) 100%)',
        }}
      />
    </div>
  );
}
