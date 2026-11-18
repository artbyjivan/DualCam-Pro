import { CropFrameConfig, FramingRect, VideoTrackFile } from '../types/camera';

export function computeCropRect(
  srcW: number,
  srcH: number,
  targetAspect: number,
  frame: CropFrameConfig
): FramingRect {
  if (srcW <= 0 || srcH <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0, normX: 0, normY: 0, normW: 1, normH: 1 };
  }
  const srcAspect = srcW / srcH;
  let baseW: number;
  let baseH: number;

  if (srcAspect > targetAspect) {
    baseH = srcH;
    baseW = srcH * targetAspect;
  } else {
    baseW = srcW;
    baseH = srcW / targetAspect;
  }

  const zoom = Math.max(1, Math.min(3, frame.zoom || 1));
  const sw = baseW / zoom;
  const sh = baseH / zoom;

  const slackX = Math.max(0, srcW - sw);
  const slackY = Math.max(0, srcH - sh);

  const clampedPanX = Math.max(-1, Math.min(1, frame.panX || 0));
  const clampedPanY = Math.max(-1, Math.min(1, frame.panY || 0));

  const sx = (slackX / 2) * (1 + clampedPanX);
  const sy = (slackY / 2) * (1 + clampedPanY);

  return {
    sx,
    sy,
    sw,
    sh,
    normX: sx / srcW,
    normY: sy / srcH,
    normW: sw / srcW,
    normH: sh / srcH,
  };
}

export interface CalibrationGeneratorHandle {
  canvas: HTMLCanvasElement;
  stream: MediaStream;
  stop: () => void;
}

/**
 * Generates a live 1920x1080 moving optical test feed ONLY when no physical camera
 * is attached or browser permissions prevent camera access, allowing full verification
 * of the dual-canvas simultaneous 9:16 & 16:9 recording pipeline.
 */
export function createCalibrationFeedGenerator(): CalibrationGeneratorHandle {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;

  let rafId = 0;
  const startTime = performance.now();

  const render = () => {
    const t = (performance.now() - startTime) / 1000;

    // Deep optical slate gradient
    const bg = ctx.createLinearGradient(0, 0, 1920, 1080);
    bg.addColorStop(0, '#111318');
    bg.addColorStop(0.5, '#191d26');
    bg.addColorStop(1, '#0e1015');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1920, 1080);

    // Subtle calibration grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1920; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1080);
      ctx.stroke();
    }
    for (let y = 0; y <= 1080; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1920, y);
      ctx.stroke();
    }

    // Moving subject A (left/center-left kinetic target for portrait framing tests)
    const ax = 640 + Math.sin(t * 1.1) * 180;
    const ay = 540 + Math.cos(t * 0.85) * 160;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax, ay, 88, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SUBJECT A', ax, ay + 8);

    // Moving subject B (right-side kinetic target for independent framing tests)
    const bx = 1280 + Math.cos(t * 0.9) * 180;
    const by = 540 + Math.sin(t * 1.2) * 150;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fill();
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('SUBJECT B', bx, by + 8);

    // Center focus Siemens star
    ctx.save();
    ctx.translate(960, 540);
    ctx.rotate(t * 0.35);
    for (let i = 0; i < 24; i++) {
      ctx.rotate((Math.PI * 2) / 24);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 140, 0, (Math.PI * 2) / 24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Live frame clock overlay
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 26px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`OPTICAL CALIBRATION FEED  ${t.toFixed(2)}s`, 48, 64);

    rafId = requestAnimationFrame(render);
  };

  render();
  const stream = canvas.captureStream(30);
  return {
    canvas,
    stream,
    stop: () => cancelAnimationFrame(rafId),
  };
}

export interface AudioChannelLevels {
  master: number;
  primary: number;
  secondary: number;
}

export interface AudioSyncPipeline {
  analyser: AnalyserNode | null;
  getLevel: () => number;
  getChannelLevels: () => AudioChannelLevels;
  getTrackForStreamA: () => MediaStreamTrack | null;
  getTrackForStreamB: () => MediaStreamTrack | null;
  setMuted: (muted: boolean) => void;
  setMixGains: (primaryGain: number, secondaryGain: number) => void;
  cleanup: () => void;
}

function readPeakLevel(analyser: AnalyserNode | null, buffer: Uint8Array<ArrayBuffer>): number {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const val = Math.abs((buffer[i] - 128) / 128);
    if (val > peak) peak = val;
  }
  return Math.min(1, peak * 2.4);
}

export function createAudioSyncPipeline(
  primaryStream: MediaStream | null,
  secondaryStream: MediaStream | null = null,
  initialGains: { primary: number; secondary: number } = { primary: 1, secondary: 1 }
): AudioSyncPipeline {
  const primaryTracks = primaryStream?.getAudioTracks() ?? [];
  const secondaryTracks = secondaryStream?.getAudioTracks() ?? [];

  if (primaryTracks.length === 0 && secondaryTracks.length === 0) {
    return {
      analyser: null,
      getLevel: () => 0,
      getChannelLevels: () => ({ master: 0, primary: 0, secondary: 0 }),
      getTrackForStreamA: () => null,
      getTrackForStreamB: () => null,
      setMuted: () => {},
      setMixGains: () => {},
      cleanup: () => {},
    };
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Soft limiter protects the summed mix when both phone + external mics are active
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-3, ctx.currentTime);
    limiter.knee.setValueAtTime(12, ctx.currentTime);
    limiter.ratio.setValueAtTime(6, ctx.currentTime);
    limiter.attack.setValueAtTime(0.003, ctx.currentTime);
    limiter.release.setValueAtTime(0.15, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;

    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 256;

    const destA = ctx.createMediaStreamDestination();
    const destB = ctx.createMediaStreamDestination();

    let primarySource: MediaStreamAudioSourceNode | null = null;
    let primaryGainNode: GainNode | null = null;
    let primaryAnalyser: AnalyserNode | null = null;
    if (primaryTracks.length > 0) {
      primarySource = ctx.createMediaStreamSource(new MediaStream([primaryTracks[0]]));
      primaryGainNode = ctx.createGain();
      primaryGainNode.gain.value = initialGains.primary;
      primaryAnalyser = ctx.createAnalyser();
      primaryAnalyser.fftSize = 256;
      primarySource.connect(primaryGainNode);
      primaryGainNode.connect(primaryAnalyser);
      primaryGainNode.connect(limiter);
    }

    let secondarySource: MediaStreamAudioSourceNode | null = null;
    let secondaryGainNode: GainNode | null = null;
    let secondaryAnalyser: AnalyserNode | null = null;
    if (secondaryTracks.length > 0) {
      secondarySource = ctx.createMediaStreamSource(new MediaStream([secondaryTracks[0]]));
      secondaryGainNode = ctx.createGain();
      secondaryGainNode.gain.value = initialGains.secondary;
      secondaryAnalyser = ctx.createAnalyser();
      secondaryAnalyser.fftSize = 256;
      secondarySource.connect(secondaryGainNode);
      secondaryGainNode.connect(secondaryAnalyser);
      secondaryGainNode.connect(limiter);
    }

    limiter.connect(masterGain);
    masterGain.connect(masterAnalyser);
    masterGain.connect(destA);
    masterGain.connect(destB);

    const masterBuf = new Uint8Array(masterAnalyser.frequencyBinCount);
    const primaryBuf = new Uint8Array(primaryAnalyser?.frequencyBinCount ?? 128);
    const secondaryBuf = new Uint8Array(secondaryAnalyser?.frequencyBinCount ?? 128);

    return {
      analyser: masterAnalyser,
      getLevel: () => readPeakLevel(masterAnalyser, masterBuf),
      getChannelLevels: () => ({
        master: readPeakLevel(masterAnalyser, masterBuf),
        primary: readPeakLevel(primaryAnalyser, primaryBuf),
        secondary: readPeakLevel(secondaryAnalyser, secondaryBuf),
      }),
      getTrackForStreamA: () => destA.stream.getAudioTracks()[0] ?? null,
      getTrackForStreamB: () => destB.stream.getAudioTracks()[0] ?? null,
      setMuted: (muted: boolean) => {
        masterGain.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      },
      setMixGains: (pGain: number, sGain: number) => {
        if (primaryGainNode) {
          primaryGainNode.gain.setValueAtTime(Math.max(0, Math.min(2, pGain)), ctx.currentTime);
        }
        if (secondaryGainNode) {
          secondaryGainNode.gain.setValueAtTime(Math.max(0, Math.min(2, sGain)), ctx.currentTime);
        }
      },
      cleanup: () => {
        try {
          primarySource?.disconnect();
          primaryGainNode?.disconnect();
          primaryAnalyser?.disconnect();
          secondarySource?.disconnect();
          secondaryGainNode?.disconnect();
          secondaryAnalyser?.disconnect();
          limiter.disconnect();
          masterGain.disconnect();
          ctx.close();
        } catch {
          // Ignore cleanup errors
        }
      },
    };
  } catch {
    const fallbackTrack = primaryTracks[0] ?? secondaryTracks[0];
    return {
      analyser: null,
      getLevel: () => 0,
      getChannelLevels: () => ({ master: 0, primary: 0, secondary: 0 }),
      getTrackForStreamA: () => fallbackTrack?.clone() ?? null,
      getTrackForStreamB: () => fallbackTrack?.clone() ?? null,
      setMuted: (muted: boolean) => {
        [...primaryTracks, ...secondaryTracks].forEach((t) => {
          t.enabled = !muted;
        });
      },
      setMixGains: () => {},
      cleanup: () => {},
    };
  }
}

export interface DualRecordingSession {
  mode: 'dual' | 'portrait' | 'landscape';
  pause: () => void;
  resume: () => void;
  stop: () => Promise<{
    portraitVideo?: VideoTrackFile;
    landscapeVideo?: VideoTrackFile;
    singleVideo?: VideoTrackFile;
    durationMs: number;
  }>;
}

export interface StartRecordingParams {
  mode: 'dual' | 'portrait' | 'landscape';
  videoEl: HTMLVideoElement;
  portraitDims: { width: number; height: number };
  landscapeDims: { width: number; height: number };
  fps: number;
  mimeType: string;
  extension: 'mp4' | 'webm';
  getPortraitFrame: () => CropFrameConfig;
  getLandscapeFrame: () => CropFrameConfig;
  audioPipeline: AudioSyncPipeline;
  includeAudio: boolean;
  mirrorHorizontal?: boolean;
  onDualPreviewFrame?: (
    portraitCanvas: HTMLCanvasElement | null,
    landscapeCanvas: HTMLCanvasElement | null
  ) => void;
}

function createMediaRecorderSafe(stream: MediaStream, mimeType: string, bitrate: number): MediaRecorder {
  const opts: MediaRecorderOptions = { videoBitsPerSecond: bitrate };
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    opts.mimeType = mimeType;
  }
  return new MediaRecorder(stream, opts);
}

export function startSynchronizedRecording(params: StartRecordingParams): DualRecordingSession {
  const {
    mode,
    videoEl,
    portraitDims,
    landscapeDims,
    fps,
    mimeType,
    extension,
    getPortraitFrame,
    getLandscapeFrame,
    audioPipeline,
    includeAudio,
    mirrorHorizontal = false,
  } = params;

  const needPortrait = mode === 'dual' || mode === 'portrait';
  const needLandscape = mode === 'dual' || mode === 'landscape';

  const portraitCanvas = needPortrait ? document.createElement('canvas') : null;
  if (portraitCanvas) {
    portraitCanvas.width = portraitDims.width;
    portraitCanvas.height = portraitDims.height;
  }
  const portraitCtx = portraitCanvas?.getContext('2d', { alpha: false }) ?? null;

  const landscapeCanvas = needLandscape ? document.createElement('canvas') : null;
  if (landscapeCanvas) {
    landscapeCanvas.width = landscapeDims.width;
    landscapeCanvas.height = landscapeDims.height;
  }
  const landscapeCtx = landscapeCanvas?.getContext('2d', { alpha: false }) ?? null;

  let active = true;
  let paused = false;
  let rafId = 0;

  const drawFrame = () => {
    if (!active) return;
    if (!paused && videoEl.readyState >= 2) {
      const srcW = videoEl.videoWidth;
      const srcH = videoEl.videoHeight;

      if (portraitCtx && portraitCanvas && srcW > 0 && srcH > 0) {
        const rect = computeCropRect(srcW, srcH, 9 / 16, getPortraitFrame());
        portraitCtx.save();
        if (mirrorHorizontal) {
          portraitCtx.translate(portraitCanvas.width, 0);
          portraitCtx.scale(-1, 1);
        }
        portraitCtx.drawImage(
          videoEl,
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          0,
          0,
          portraitCanvas.width,
          portraitCanvas.height
        );
        portraitCtx.restore();
      }

      if (landscapeCtx && landscapeCanvas && srcW > 0 && srcH > 0) {
        const rect = computeCropRect(srcW, srcH, 16 / 9, getLandscapeFrame());
        landscapeCtx.save();
        if (mirrorHorizontal) {
          landscapeCtx.translate(landscapeCanvas.width, 0);
          landscapeCtx.scale(-1, 1);
        }
        landscapeCtx.drawImage(
          videoEl,
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          0,
          0,
          landscapeCanvas.width,
          landscapeCanvas.height
        );
        landscapeCtx.restore();
      }
    }
    rafId = requestAnimationFrame(drawFrame);
  };

  // Draw initial frame before starting streams so recorders never start with blank buffer
  drawFrame();

  const bitrate = portraitDims.width >= 2160 || landscapeDims.width >= 3840 ? 18_000_000 : 8_000_000;

  let portraitRecorder: MediaRecorder | null = null;
  let landscapeRecorder: MediaRecorder | null = null;
  const portraitChunks: BlobPart[] = [];
  const landscapeChunks: BlobPart[] = [];

  if (portraitCanvas) {
    const pStream = portraitCanvas.captureStream(fps);
    if (includeAudio) {
      const aTrack = audioPipeline.getTrackForStreamA();
      if (aTrack) pStream.addTrack(aTrack);
    }
    portraitRecorder = createMediaRecorderSafe(pStream, mimeType, bitrate);
    portraitRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) portraitChunks.push(e.data);
    };
  }

  if (landscapeCanvas) {
    const lStream = landscapeCanvas.captureStream(fps);
    if (includeAudio) {
      const bTrack = audioPipeline.getTrackForStreamB();
      if (bTrack) lStream.addTrack(bTrack);
    }
    landscapeRecorder = createMediaRecorderSafe(lStream, mimeType, bitrate);
    landscapeRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) landscapeChunks.push(e.data);
    };
  }

  // Synchronized start in the exact same execution tick
  const startedAt = performance.now();
  let pausedAt = 0;
  let totalPausedMs = 0;

  if (portraitRecorder && landscapeRecorder) {
    portraitRecorder.start(250);
    landscapeRecorder.start(250);
  } else if (portraitRecorder) {
    portraitRecorder.start(250);
  } else if (landscapeRecorder) {
    landscapeRecorder.start(250);
  }

  const timestampTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    mode,
    pause: () => {
      if (paused) return;
      paused = true;
      pausedAt = performance.now();
      try {
        if (portraitRecorder?.state === 'recording') portraitRecorder.pause();
        if (landscapeRecorder?.state === 'recording') landscapeRecorder.pause();
      } catch {
        // Fallback if browser denies pause
      }
    },
    resume: () => {
      if (!paused) return;
      paused = false;
      totalPausedMs += performance.now() - pausedAt;
      try {
        if (portraitRecorder?.state === 'paused') portraitRecorder.resume();
        if (landscapeRecorder?.state === 'paused') landscapeRecorder.resume();
      } catch {
        // Ignore resume error
      }
    },
    stop: async () => {
      if (paused) {
        totalPausedMs += performance.now() - pausedAt;
      }
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt - totalPausedMs));
      active = false;
      cancelAnimationFrame(rafId);

      const waitStop = (rec: MediaRecorder | null, chunks: BlobPart[]) =>
        new Promise<Blob | null>((resolve) => {
          if (!rec || rec.state === 'inactive') {
            resolve(chunks.length ? new Blob(chunks, { type: mimeType || 'video/webm' }) : null);
            return;
          }
          rec.onstop = () => {
            resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }));
          };
          rec.stop();
        });

      const [pBlob, lBlob] = await Promise.all([
        waitStop(portraitRecorder, portraitChunks),
        waitStop(landscapeRecorder, landscapeChunks),
      ]);

      const portraitVideo: VideoTrackFile | undefined = pBlob
        ? {
            blob: pBlob,
            filename: `DualCam_${timestampTag}_Portrait_9x16.${extension}`,
            mimeType: pBlob.type,
            width: portraitDims.width,
            height: portraitDims.height,
            aspectRatio: '9:16',
            sizeBytes: pBlob.size,
          }
        : undefined;

      const landscapeVideo: VideoTrackFile | undefined = lBlob
        ? {
            blob: lBlob,
            filename: `DualCam_${timestampTag}_Landscape_16x9.${extension}`,
            mimeType: lBlob.type,
            width: landscapeDims.width,
            height: landscapeDims.height,
            aspectRatio: '16:9',
            sizeBytes: lBlob.size,
          }
        : undefined;

      if (mode === 'dual') {
        return { portraitVideo, landscapeVideo, durationMs };
      }
      return {
        singleVideo: mode === 'portrait' ? portraitVideo : landscapeVideo,
        durationMs,
      };
    },
  };
}
