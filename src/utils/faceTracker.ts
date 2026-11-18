import { CropFrameConfig } from '../types/camera';

export interface DetectedFaceBox {
  // Normalized [0..1] in source video coordinates
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface FaceDetectionResult {
  faces: DetectedFaceBox[];
  engine: 'native-face-detector' | 'chroma-subject-tracker';
}

interface NativeFaceDetectorLike {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<
    Array<{
      boundingBox: DOMRectReadOnly;
    }>
  >;
}

let cachedNativeDetector: NativeFaceDetectorLike | null | undefined = undefined;

function getNativeFaceDetector(): NativeFaceDetectorLike | null {
  if (cachedNativeDetector !== undefined) return cachedNativeDetector;
  const Ctor = (
    window as unknown as {
      FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetectorLike;
    }
  ).FaceDetector;

  if (typeof Ctor === 'function') {
    try {
      cachedNativeDetector = new Ctor({ fastMode: true, maxDetectedFaces: 4 });
      return cachedNativeDetector;
    } catch {
      cachedNativeDetector = null;
      return null;
    }
  }
  cachedNativeDetector = null;
  return null;
}

export function isNativeFaceDetectorSupported(): boolean {
  return getNativeFaceDetector() !== null;
}

const TRACK_W = 160;
const TRACK_H = 90;
let trackCanvas: HTMLCanvasElement | null = null;

/**
 * Self-contained on-device fallback tracker when browser does not expose window.FaceDetector.
 * Uses YCbCr skin-chroma segmentation + spatial grid clustering to find foreground face/head regions.
 */
function detectFacesFallback(videoEl: HTMLVideoElement): DetectedFaceBox[] {
  if (!trackCanvas) {
    trackCanvas = document.createElement('canvas');
    trackCanvas.width = TRACK_W;
    trackCanvas.height = TRACK_H;
  }
  const ctx = trackCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(videoEl, 0, 0, TRACK_W, TRACK_H);
  const { data } = ctx.getImageData(0, 0, TRACK_W, TRACK_H);

  // Build binary mask on an 8x8 cell grid (20 x 11 cells) for fast noise-resistant clustering
  const COLS = 20;
  const ROWS = 11;
  const cellW = TRACK_W / COLS;
  const cellH = TRACK_H / ROWS;
  const cellHits = new Uint16Array(COLS * ROWS);

  for (let y = 0; y < TRACK_H; y++) {
    const row = Math.min(ROWS - 1, Math.floor(y / cellH));
    for (let x = 0; x < TRACK_W; x++) {
      const idx = (y * TRACK_W + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Rec.601 YCbCr skin-tone chrominance envelope
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkinTone = luma > 55 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 176;
      if (isSkinTone) {
        const col = Math.min(COLS - 1, Math.floor(x / cellW));
        cellHits[row * COLS + col]++;
      }
    }
  }

  const minHitsPerCell = Math.floor((cellW * cellH) * 0.28);
  const activeMask = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < cellHits.length; i++) {
    if (cellHits[i] >= minHitsPerCell) activeMask[i] = 1;
  }

  // Connected-components BFS to extract distinct subject/face bounding boxes
  const visited = new Uint8Array(COLS * ROWS);
  const boxes: DetectedFaceBox[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const startIdx = r * COLS + c;
      if (!activeMask[startIdx] || visited[startIdx]) continue;

      const queue = [startIdx];
      visited[startIdx] = 1;
      let minC = c;
      let maxC = c;
      let minR = r;
      let maxR = r;
      let count = 0;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cr = Math.floor(cur / COLS);
        const cc = cur % COLS;
        count++;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;

        const neighbors = [
          cr > 0 ? (cr - 1) * COLS + cc : -1,
          cr < ROWS - 1 ? (cr + 1) * COLS + cc : -1,
          cc > 0 ? cr * COLS + (cc - 1) : -1,
          cc < COLS - 1 ? cr * COLS + (cc + 1) : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && activeMask[n] && !visited[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      // Filter tiny noise blobs and overly wide wall bands
      const boxW = (maxC - minC + 1) / COLS;
      const boxH = (maxR - minR + 1) / ROWS;
      const area = boxW * boxH;
      if (count >= 2 && area >= 0.012 && area <= 0.55 && boxW / boxH <= 2.2) {
        const x = minC / COLS;
        const y = minR / ROWS;
        boxes.push({
          x,
          y,
          width: boxW,
          height: boxH,
          cx: x + boxW / 2,
          cy: y + boxH / 2,
        });
      }
    }
  }

  // Return largest clusters first (up to 3 faces)
  boxes.sort((a, b) => b.width * b.height - a.width * a.height);
  return boxes.slice(0, 3);
}

export async function detectFacesInVideo(videoEl: HTMLVideoElement): Promise<FaceDetectionResult> {
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    return { faces: [], engine: 'chroma-subject-tracker' };
  }

  const nativeDetector = getNativeFaceDetector();
  if (nativeDetector) {
    try {
      const detected = await nativeDetector.detect(videoEl);
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const faces: DetectedFaceBox[] = detected
        .map((d) => {
          const x = Math.max(0, Math.min(1, d.boundingBox.x / vw));
          const y = Math.max(0, Math.min(1, d.boundingBox.y / vh));
          const width = Math.max(0.02, Math.min(1 - x, d.boundingBox.width / vw));
          const height = Math.max(0.02, Math.min(1 - y, d.boundingBox.height / vh));
          return {
            x,
            y,
            width,
            height,
            cx: x + width / 2,
            cy: y + height / 2,
          };
        })
        .slice(0, 4);
      return { faces, engine: 'native-face-detector' };
    } catch {
      // Fallback if native FaceDetector throws on current frame/platform
    }
  }

  return {
    faces: detectFacesFallback(videoEl),
    engine: 'chroma-subject-tracker',
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function solvePanForTarget(
  srcW: number,
  srcH: number,
  targetAspect: number,
  zoom: number,
  targetCx: number,
  targetCy: number
): { panX: number; panY: number } {
  const srcAspect = srcW / srcH;
  const baseW = srcAspect > targetAspect ? srcH * targetAspect : srcW;
  const baseH = srcAspect > targetAspect ? srcH : srcW / targetAspect;

  const sw = baseW / zoom;
  const sh = baseH / zoom;

  const slackNormX = Math.max(0, (srcW - sw) / srcW);
  const slackNormY = Math.max(0, (srcH - sh) / srcH);

  const panX = slackNormX > 0.002 ? clamp((targetCx - 0.5) / (slackNormX / 2), -1, 1) : 0;
  const panY = slackNormY > 0.002 ? clamp((targetCy - 0.5) / (slackNormY / 2), -1, 1) : 0;

  return { panX, panY };
}

/**
 * Computes ideal portrait (9:16) and landscape (16:9) CropFrameConfigs to keep
 * all detected faces cleanly centered and appropriately scaled in both aspect ratios.
 */
export function computeDualAutoFraming(
  faces: DetectedFaceBox[],
  srcW: number,
  srcH: number
): { portraitTarget: CropFrameConfig; landscapeTarget: CropFrameConfig } | null {
  if (faces.length === 0 || srcW <= 0 || srcH <= 0) return null;

  // Union bounding box across detected faces
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const f of faces) {
    if (f.x < minX) minX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.x + f.width > maxX) maxX = f.x + f.width;
    if (f.y + f.height > maxY) maxY = f.y + f.height;
  }

  const unionW = Math.max(0.06, maxX - minX);
  const unionH = Math.max(0.06, maxY - minY);
  const targetCx = minX + unionW / 2;
  // Bias vertical target slightly below face center to leave natural headroom above eyes
  const targetCy = clamp(minY + unionH * 0.58, 0.15, 0.85);

  const srcAspect = srcW / srcH;

  // 1. Portrait (9:16) ideal zoom
  const portraitAspect = 9 / 16;
  const pBaseW = srcAspect > portraitAspect ? srcH * portraitAspect : srcW;
  const pBaseH = srcAspect > portraitAspect ? srcH : srcW / portraitAspect;
  const pMaxZoomByHeight = (0.30 * (srcH / pBaseH)) / unionH;
  const pMaxZoomByWidth = (0.68 * (pBaseW / srcW)) / unionW;
  const portraitZoom = clamp(Math.min(pMaxZoomByHeight, pMaxZoomByWidth), 1.0, 2.2);
  const portraitPan = solvePanForTarget(srcW, srcH, portraitAspect, portraitZoom, targetCx, targetCy);

  // 2. Landscape (16:9) ideal zoom
  const landscapeAspect = 16 / 9;
  const lBaseW = srcAspect > landscapeAspect ? srcH * landscapeAspect : srcW;
  const lBaseH = srcAspect > landscapeAspect ? srcH : srcW / landscapeAspect;
  const lMaxZoomByHeight = (0.32 * (srcH / lBaseH)) / unionH;
  const lMaxZoomByWidth = (0.60 * (lBaseW / srcW)) / unionW;
  const landscapeZoom = clamp(Math.min(lMaxZoomByHeight, lMaxZoomByWidth), 1.0, 2.0);
  const landscapePan = solvePanForTarget(
    srcW,
    srcH,
    landscapeAspect,
    landscapeZoom,
    targetCx,
    targetCy
  );

  return {
    portraitTarget: {
      panX: portraitPan.panX,
      panY: portraitPan.panY,
      zoom: Number(portraitZoom.toFixed(3)),
    },
    landscapeTarget: {
      panX: landscapePan.panX,
      panY: landscapePan.panY,
      zoom: Number(landscapeZoom.toFixed(3)),
    },
  };
}

export function smoothStepFrame(
  current: CropFrameConfig,
  target: CropFrameConfig,
  alpha = 0.18
): CropFrameConfig {
  const dx = target.panX - current.panX;
  const dy = target.panY - current.panY;
  const dz = target.zoom - current.zoom;

  // Deadband prevents micro-hunting when subject is stationary
  const nextPanX = Math.abs(dx) < 0.012 ? current.panX : current.panX + dx * alpha;
  const nextPanY = Math.abs(dy) < 0.012 ? current.panY : current.panY + dy * alpha;
  const nextZoom = Math.abs(dz) < 0.015 ? current.zoom : current.zoom + dz * alpha;

  return {
    panX: clamp(nextPanX, -1, 1),
    panY: clamp(nextPanY, -1, 1),
    zoom: clamp(nextZoom, 1, 3),
  };
}
