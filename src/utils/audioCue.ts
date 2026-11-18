// Lightweight Web Audio API sound generator for tactile shutter clicks, timer beeps, and REC tones.

let sharedAudioCtx: AudioContext | null = null;

function getCueAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playTimerBeep(isFinal = false, muted = false): void {
  if (muted) return;
  const ctx = getCueAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 1180 : 780, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinal ? 0.16 : 0.09));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isFinal ? 0.17 : 0.1));
  } catch {
    // Ignore audio cue failures
  }
}

export function playShutterSound(muted = false): void {
  if (muted) return;
  const ctx = getCueAudioContext();
  if (!ctx) return;
  try {
    const bufferSize = Math.floor(ctx.sampleRate * 0.045);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (bufferSize * 0.28));
      data[i] = (Math.random() * 2 - 1) * env * 0.25;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 1.2;

    noise.connect(filter);
    filter.connect(ctx.destination);
    noise.start();
  } catch {
    // Ignore audio cue failures
  }
}

export function playRecordTone(type: 'start' | 'stop', muted = false): void {
  if (muted) return;
  const ctx = getCueAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const now = ctx.currentTime;
    if (type === 'start') {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.08);
    } else {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.1);
    }
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {
    // Ignore audio cue failures
  }
}
