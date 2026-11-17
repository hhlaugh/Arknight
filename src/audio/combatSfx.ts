import { computeEffectiveSfxVolume, getSfxAudioContext } from './bgmPlayer';

export type CombatSfxKind =
  | 'draw'
  | 'select'
  | 'deploy'
  | 'deploy_elite'
  | 'skill'
  | 'strike_melee'
  | 'strike_ranged'
  | 'hit'
  | 'shield'
  | 'heal'
  | 'sp'
  | 'defeat'
  | 'withdraw'
  | 'base_hit'
  | 'turn_ally'
  | 'turn_enemy'
  | 'victory'
  | 'defeat_match';

export interface CombatAudioCue {
  readonly kind: CombatSfxKind;
  readonly delayMs?: number;
}

let cachedNoiseBuffer: AudioBuffer | null = null;
let cachedLimiter: { ctx: AudioContext; node: DynamicsCompressorNode } | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.35);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

function getOutputNode(ctx: AudioContext): AudioNode {
  if (cachedLimiter && cachedLimiter.ctx === ctx) {
    return cachedLimiter.node;
  }
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-12, ctx.currentTime);
  compressor.knee.setValueAtTime(12, ctx.currentTime);
  compressor.ratio.setValueAtTime(6, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);
  compressor.connect(ctx.destination);
  cachedLimiter = { ctx, node: compressor };
  return compressor;
}

function playTone(
  ctx: AudioContext,
  out: AudioNode,
  opts: {
    type: OscillatorType;
    startFreq: number;
    endFreq?: number;
    startTime: number;
    duration: number;
    gain: number;
    attack?: number;
    filterType?: BiquadFilterType;
    filterStartFreq?: number;
    filterEndFreq?: number;
    filterQ?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = opts.type;

  const t0 = opts.startTime;
  const attack = opts.attack ?? 0.005;
  const tEnd = t0 + opts.duration;

  osc.frequency.setValueAtTime(Math.max(20, opts.startFreq), t0);
  if (opts.endFreq !== undefined && opts.endFreq !== opts.startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), tEnd);
  }

  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  if (opts.filterType) {
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.frequency.setValueAtTime(opts.filterStartFreq ?? 1200, t0);
    if (opts.filterEndFreq !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.filterEndFreq), tEnd);
    }
    if (opts.filterQ !== undefined) {
      filter.Q.setValueAtTime(opts.filterQ, t0);
    }
    osc.connect(filter);
    filter.connect(gainNode);
  } else {
    osc.connect(gainNode);
  }

  gainNode.connect(out);
  osc.start(t0);
  osc.stop(tEnd + 0.015);
}

function playNoise(
  ctx: AudioContext,
  out: AudioNode,
  opts: {
    startTime: number;
    duration: number;
    gain: number;
    filterType: BiquadFilterType;
    filterStartFreq: number;
    filterEndFreq?: number;
    filterQ?: number;
    attack?: number;
  },
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType;
  const t0 = opts.startTime;
  const tEnd = t0 + opts.duration;
  filter.frequency.setValueAtTime(Math.max(40, opts.filterStartFreq), t0);
  if (opts.filterEndFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.filterEndFreq), tEnd);
  }
  if (opts.filterQ !== undefined) {
    filter.Q.setValueAtTime(opts.filterQ, t0);
  }

  const gainNode = ctx.createGain();
  const attack = opts.attack ?? 0.004;
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  src.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(out);
  src.start(t0);
  src.stop(tEnd + 0.015);
}

function scheduleCombatSfx(ctx: AudioContext, out: AudioNode, kind: CombatSfxKind, startTime: number, vol: number): void {
  switch (kind) {
    case 'select': {
      // PRTS 终端干脆数据锁定轻响
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 1280,
        endFreq: 1580,
        startTime,
        duration: 0.032,
        gain: vol * 0.16,
        attack: 0.002,
      });
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 2560,
        endFreq: 2200,
        startTime,
        duration: 0.02,
        gain: vol * 0.06,
        attack: 0.002,
      });
      break;
    }

    case 'draw': {
      // 抽卡滑入：高频滤噪划牌声 + 轻盈电子注册提示音
      playNoise(ctx, out, {
        startTime,
        duration: 0.075,
        gain: vol * 0.22,
        filterType: 'bandpass',
        filterStartFreq: 1100,
        filterEndFreq: 3800,
        filterQ: 2.0,
      });
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 1046.5,
        endFreq: 1396.9,
        startTime: startTime + 0.018,
        duration: 0.055,
        gain: vol * 0.16,
        attack: 0.003,
      });
      break;
    }

    case 'deploy':
    case 'deploy_elite': {
      // 明日方舟标志性部署落位：低频重踏 + 战术锁扣 + PRTS 双音确认（5/6星追加高频金辉和弦）
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 190,
        endFreq: 44,
        startTime,
        duration: 0.15,
        gain: vol * 0.45,
        attack: 0.003,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.07,
        gain: vol * 0.25,
        filterType: 'lowpass',
        filterStartFreq: 950,
        filterEndFreq: 160,
        filterQ: 1.2,
      });
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 880,
        endFreq: 880,
        startTime: startTime + 0.018,
        duration: 0.095,
        gain: vol * 0.15,
        attack: 0.003,
      });
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 1318.5,
        endFreq: 1318.5,
        startTime: startTime + 0.048,
        duration: 0.13,
        gain: vol * 0.17,
        attack: 0.004,
      });
      if (kind === 'deploy_elite') {
        playTone(ctx, out, {
          type: 'triangle',
          startFreq: 1760,
          endFreq: 1760,
          startTime: startTime + 0.072,
          duration: 0.2,
          gain: vol * 0.14,
          attack: 0.006,
        });
        playTone(ctx, out, {
          type: 'sine',
          startFreq: 2637,
          endFreq: 2637,
          startTime: startTime + 0.095,
          duration: 0.22,
          gain: vol * 0.1,
          attack: 0.008,
        });
      }
      break;
    }

    case 'skill': {
      // 主动技能开启：方舟风格上升四音阶电子共鸣 + 能量爬升扫频
      playTone(ctx, out, {
        type: 'sawtooth',
        startFreq: 310,
        endFreq: 1240,
        startTime,
        duration: 0.16,
        gain: vol * 0.11,
        attack: 0.008,
        filterType: 'bandpass',
        filterStartFreq: 520,
        filterEndFreq: 2800,
        filterQ: 2.2,
      });
      const notes = [587.33, 880.0, 1174.66, 1760.0];
      notes.forEach((freq, idx) => {
        playTone(ctx, out, {
          type: idx % 2 === 0 ? 'triangle' : 'sine',
          startFreq: freq,
          endFreq: freq,
          startTime: startTime + idx * 0.032,
          duration: 0.14 + idx * 0.025,
          gain: vol * 0.16,
          attack: 0.004,
        });
      });
      break;
    }

    case 'strike_melee': {
      // 近战突进：凌厉刀锋破风扫频 + 金属锋鸣瞬态
      playNoise(ctx, out, {
        startTime,
        duration: 0.11,
        gain: vol * 0.26,
        filterType: 'bandpass',
        filterStartFreq: 680,
        filterEndFreq: 2900,
        filterQ: 1.7,
      });
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 1120,
        endFreq: 340,
        startTime: startTime + 0.01,
        duration: 0.055,
        gain: vol * 0.16,
        attack: 0.002,
      });
      break;
    }

    case 'strike_ranged': {
      // 远程矢弹/法术弹道：高频精准出膛啸声
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 1720,
        endFreq: 410,
        startTime,
        duration: 0.085,
        gain: vol * 0.2,
        attack: 0.002,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.035,
        gain: vol * 0.16,
        filterType: 'highpass',
        filterStartFreq: 2400,
        filterQ: 1.4,
      });
      break;
    }

    case 'hit': {
      // 对撞伤害结算：厚重低频冲击 + 脆裂命中噪波
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 155,
        endFreq: 38,
        startTime,
        duration: 0.115,
        gain: vol * 0.46,
        attack: 0.002,
      });
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 260,
        endFreq: 80,
        startTime,
        duration: 0.07,
        gain: vol * 0.2,
        attack: 0.002,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.09,
        gain: vol * 0.28,
        filterType: 'lowpass',
        filterStartFreq: 2600,
        filterEndFreq: 240,
        filterQ: 1.1,
      });
      break;
    }

    case 'shield': {
      // 护盾格挡/吸收：金属折射共鸣
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 698.46,
        endFreq: 640,
        startTime,
        duration: 0.13,
        gain: vol * 0.18,
        attack: 0.002,
      });
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 1085,
        endFreq: 1020,
        startTime,
        duration: 0.15,
        gain: vol * 0.15,
        attack: 0.002,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.045,
        gain: vol * 0.15,
        filterType: 'bandpass',
        filterStartFreq: 2600,
        filterQ: 3.0,
      });
      break;
    }

    case 'heal': {
      // 治疗恢复：柔和罗德岛三和弦
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        playTone(ctx, out, {
          type: 'sine',
          startFreq: freq,
          endFreq: freq,
          startTime: startTime + idx * 0.038,
          duration: 0.16,
          gain: vol * 0.14,
          attack: 0.006,
        });
      });
      break;
    }

    case 'sp': {
      // 技力充能：清脆上升双音
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 987.77,
        endFreq: 1318.51,
        startTime,
        duration: 0.06,
        gain: vol * 0.14,
        attack: 0.003,
      });
      break;
    }

    case 'defeat': {
      // 干员退场：下沉战术离线衰减音
      playTone(ctx, out, {
        type: 'sawtooth',
        startFreq: 310,
        endFreq: 86,
        startTime,
        duration: 0.19,
        gain: vol * 0.2,
        attack: 0.004,
        filterType: 'lowpass',
        filterStartFreq: 760,
        filterEndFreq: 120,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.14,
        gain: vol * 0.16,
        filterType: 'bandpass',
        filterStartFreq: 900,
        filterEndFreq: 260,
        filterQ: 1.5,
      });
      break;
    }

    case 'withdraw': {
      // 主动撤离：上扬回收电子音
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 480,
        endFreq: 960,
        startTime,
        duration: 0.095,
        gain: vol * 0.17,
        attack: 0.004,
      });
      playNoise(ctx, out, {
        startTime,
        duration: 0.065,
        gain: vol * 0.14,
        filterType: 'bandpass',
        filterStartFreq: 1200,
        filterEndFreq: 2400,
        filterQ: 2.0,
      });
      break;
    }

    case 'base_hit': {
      // 基地防线受损：重击低音 + PRTS 警示双脉冲
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 120,
        endFreq: 36,
        startTime,
        duration: 0.2,
        gain: vol * 0.45,
        attack: 0.003,
      });
      playTone(ctx, out, {
        type: 'square',
        startFreq: 440,
        endFreq: 415,
        startTime: startTime + 0.02,
        duration: 0.075,
        gain: vol * 0.13,
        attack: 0.003,
        filterType: 'lowpass',
        filterStartFreq: 980,
      });
      playTone(ctx, out, {
        type: 'square',
        startFreq: 349.23,
        endFreq: 330,
        startTime: startTime + 0.105,
        duration: 0.09,
        gain: vol * 0.13,
        attack: 0.003,
        filterType: 'lowpass',
        filterStartFreq: 900,
      });
      break;
    }

    case 'turn_ally': {
      // 我方回合切换：明亮战术就绪双音
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 587.33,
        endFreq: 587.33,
        startTime,
        duration: 0.07,
        gain: vol * 0.15,
        attack: 0.003,
      });
      playTone(ctx, out, {
        type: 'triangle',
        startFreq: 880,
        endFreq: 880,
        startTime: startTime + 0.055,
        duration: 0.12,
        gain: vol * 0.17,
        attack: 0.004,
      });
      break;
    }

    case 'turn_enemy': {
      // 敌方回合切换：低沉稳重过渡音
      playTone(ctx, out, {
        type: 'sine',
        startFreq: 440,
        endFreq: 349.23,
        startTime,
        duration: 0.13,
        gain: vol * 0.13,
        attack: 0.005,
      });
      break;
    }

    case 'victory': {
      // 战斗胜利三连音
      [587.33, 739.99, 880.0, 1174.66].forEach((freq, idx) => {
        playTone(ctx, out, {
          type: 'triangle',
          startFreq: freq,
          endFreq: freq,
          startTime: startTime + idx * 0.075,
          duration: 0.24,
          gain: vol * 0.18,
          attack: 0.006,
        });
      });
      break;
    }

    case 'defeat_match': {
      // 战斗失利低沉提示音
      [392.0, 349.23, 293.66].forEach((freq, idx) => {
        playTone(ctx, out, {
          type: 'sine',
          startFreq: freq,
          endFreq: freq * 0.96,
          startTime: startTime + idx * 0.1,
          duration: 0.24,
          gain: vol * 0.16,
          attack: 0.008,
        });
      });
      break;
    }
  }
}

/**
 * 播放单条明日方舟 PRTS 战术战斗音效（自动读取系统总音量/SFX音量/静音配置）。
 */
export function playCombatSfx(kind: CombatSfxKind, delayMs = 0): void {
  const vol = computeEffectiveSfxVolume();
  if (vol <= 0) return;

  const ctx = getSfxAudioContext();
  if (!ctx) return;

  try {
    const out = getOutputNode(ctx);
    const startTime = ctx.currentTime + Math.max(0, delayMs) / 1000;
    scheduleCombatSfx(ctx, out, kind, startTime, vol);
  } catch {
    // 忽略浏览器音频硬件或权限异常
  }
}

/**
 * 批量调度一个演出节拍内的音效队列（利用 Web Audio 原生时间戳精确对齐节奏）。
 */
export function playCombatAudioCues(cues: readonly CombatAudioCue[] | undefined): void {
  if (!cues || cues.length === 0) return;
  const vol = computeEffectiveSfxVolume();
  if (vol <= 0) return;

  const ctx = getSfxAudioContext();
  if (!ctx) return;

  try {
    const out = getOutputNode(ctx);
    const baseTime = ctx.currentTime;
    for (const cue of cues) {
      const startTime = baseTime + Math.max(0, cue.delayMs ?? 0) / 1000;
      scheduleCombatSfx(ctx, out, cue.kind, startTime, vol);
    }
  } catch {
    // 忽略浏览器音频异常
  }
}
