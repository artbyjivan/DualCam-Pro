import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Move, RefreshCw, ScanFace, ShieldAlert } from 'lucide-react';
import {
  CameraMode,
  CropFrameConfig,
  GridOverlayType,
  HardwareCapabilities,
  PermissionStatusState,
  PhotoAspectRatio,
} from '../types/camera';
import { computeCropRect } from '../utils/dualRecorderEngine';
import { DetectedFaceBox } from '../utils/faceTracker';
import { LuminanceHistogram } from './LuminanceHistogram';

interface ViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mode: CameraMode;
  streamActive: boolean;
  permissionState: PermissionStatusState;
  errorMessage: string | null;
  isCalibrationFeed: boolean;
  mirrorPreview: boolean;
  gridType: GridOverlayType;
  photoAspect: PhotoAspectRatio;
  portraitFrame: CropFrameConfig;
  landscapeFrame: CropFrameConfig;
  activeDualTarget: 'portrait' | 'landscape';
  onSelectDualTarget: (target: 'portrait' | 'landscape') => void;
  onUpdatePortraitFrame: (updater: (prev: CropFrameConfig) => CropFrameConfig) => void;
  onUpdateLandscapeFrame: (updater: (prev: CropFrameConfig) => CropFrameConfig) => void;
  capabilities: HardwareCapabilities;
  zoomValue: number;
  onZoomChange: (nextZoom: number) => void;
  onTapFocus: (normX: number, normY: number) => Promise<{ supported: boolean; message: string }>;
  onRequestCamera: () => void;
  onLaunchCalibration: () => void;
  countdownSeconds: number | null;
  isRecording: boolean;
  isPaused: boolean;
  recordingDurationMs: number;
  timelapseFramesCount: number;
  showDualPip: boolean;
  onToggleDualPip: () => void;
  showHistogram: boolean;
  autoFrameFaces: boolean;
  onToggleAutoFrame: () => void;
  detectedFaces: DetectedFaceBox[];
}

function formatTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const Viewfinder: React.FC<ViewfinderProps> = ({
  videoRef,
  mode,
  streamActive,
  permissionState,
  errorMessage,
  isCalibrationFeed,
  mirrorPreview,
  gridType,
  photoAspect,
  portraitFrame,
  landscapeFrame,
  activeDualTarget,
  onSelectDualTarget,
  onUpdatePortraitFrame,
  onUpdateLandscapeFrame,
  capabilities,
  zoomValue,
  onZoomChange,
  onTapFocus,
  onRequestCamera,
  onLaunchCalibration,
  countdownSeconds,
  isRecording,
  isPaused,
  recordingDurationMs,
  timelapseFramesCount,
  showDualPip,
  onToggleDualPip,
  showHistogram,
  autoFrameFaces,
  onToggleAutoFrame,
  detectedFaces,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sensorDims, setSensorDims] = useState({ w: 1920, h: 1080 });
  const [focusReticle, setFocusReticle] = useState<{
    x: number;
    y: number;
    label: string;
    supported: boolean;
  } | null>(null);

  const dragStateRef = useRef<{
    active: boolean;
    target: 'portrait' | 'landscape';
    startX: number;
    startY: number;
    moved: boolean;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  const pinchStateRef = useRef<{
    active: boolean;
    initialDist: number;
    initialZoom: number;
  }>({ active: false, initialDist: 0, initialZoom: 1 });

  // Sync actual video dimensions as metadata arrives
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const syncDims = () => {
      if (vid.videoWidth > 0 && vid.videoHeight > 0) {
        setSensorDims({ w: vid.videoWidth, h: vid.videoHeight });
      }
    };
    vid.addEventListener('loadedmetadata', syncDims);
    vid.addEventListener('resize', syncDims);
    syncDims();
    return () => {
      vid.removeEventListener('loadedmetadata', syncDims);
      vid.removeEventListener('resize', syncDims);
    };
  }, [videoRef, streamActive]);

  const portraitRect = computeCropRect(sensorDims.w, sensorDims.h, 9 / 16, portraitFrame);
  const landscapeRect = computeCropRect(sensorDims.w, sensorDims.h, 16 / 9, landscapeFrame);

  const singleTargetAspect =
    mode === 'portrait'
      ? 9 / 16
      : mode === 'landscape'
      ? 16 / 9
      : mode === 'photo' || mode === 'burst' || mode === 'portrait-photo'
      ? photoAspect === '9:16'
        ? 9 / 16
        : photoAspect === '16:9'
        ? 16 / 9
        : photoAspect === '1:1'
        ? 1
        : 4 / 3
      : 16 / 9;

  const singleRect =
    mode === 'portrait'
      ? portraitRect
      : mode === 'landscape'
      ? landscapeRect
      : computeCropRect(sensorDims.w, sensorDims.h, singleTargetAspect, { panX: 0, panY: 0, zoom: 1 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!streamActive || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const normX = (e.clientX - box.left) / box.width;
      const normY = (e.clientY - box.top) / box.height;

      const target = mode === 'portrait' ? 'portrait' : mode === 'landscape' ? 'landscape' : activeDualTarget;
      const frame = target === 'portrait' ? portraitFrame : landscapeFrame;

      dragStateRef.current = {
        active: true,
        target,
        startX: normX,
        startY: normY,
        moved: false,
        initialPanX: frame.panX,
        initialPanY: frame.panY,
      };
    },
    [streamActive, mode, activeDualTarget, portraitFrame, landscapeFrame]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current?.active || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const normX = (e.clientX - box.left) / box.width;
      const normY = (e.clientY - box.top) / box.height;

      const dx = normX - dragStateRef.current.startX;
      const dy = normY - dragStateRef.current.startY;
      if (Math.abs(dx) > 0.008 || Math.abs(dy) > 0.008) {
        dragStateRef.current.moved = true;
      }
      if (!dragStateRef.current.moved) return;

      const canPan = mode === 'dual' || mode === 'portrait' || mode === 'landscape';
      if (!canPan) return;

      const sensitivity = 2.2;
      const signedDx = mirrorPreview ? -dx : dx;
      const nextPanX = Math.max(-1, Math.min(1, dragStateRef.current.initialPanX + signedDx * sensitivity));
      const nextPanY = Math.max(-1, Math.min(1, dragStateRef.current.initialPanY + dy * sensitivity));

      if (dragStateRef.current.target === 'portrait') {
        onUpdatePortraitFrame((prev) => ({ ...prev, panX: nextPanX, panY: nextPanY }));
      } else {
        onUpdateLandscapeFrame((prev) => ({ ...prev, panX: nextPanX, panY: nextPanY }));
      }
    },
    [mode, mirrorPreview, onUpdatePortraitFrame, onUpdateLandscapeFrame]
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      const wasMoved = dragStateRef.current?.moved ?? false;
      dragStateRef.current = null;
      if (wasMoved || !streamActive || !containerRef.current) return;

      const box = containerRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - box.left) / box.width) * 100;
      const yPct = ((e.clientY - box.top) / box.height) * 100;
      const normX = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - box.top) / box.height));

      const res = await onTapFocus(normX, normY);
      setFocusReticle({
        x: xPct,
        y: yPct,
        label: res.message,
        supported: res.supported,
      });
    },
    [streamActive, onTapFocus]
  );

  useEffect(() => {
    if (!focusReticle) return;
    const t = setTimeout(() => setFocusReticle(null), 1800);
    return () => clearTimeout(t);
  }, [focusReticle]);

  // Pinch-to-zoom touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStateRef.current = {
        active: true,
        initialDist: Math.hypot(dx, dy),
        initialZoom: zoomValue,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pinchStateRef.current.active && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchStateRef.current.initialDist > 0) {
        const scale = dist / pinchStateRef.current.initialDist;
        const maxZ = capabilities.zoom.supported ? capabilities.zoom.max : 3;
        const minZ = capabilities.zoom.supported ? capabilities.zoom.min : 1;
        const next = Math.max(minZ, Math.min(maxZ, pinchStateRef.current.initialZoom * scale));
        onZoomChange(Number(next.toFixed(2)));
      }
    }
  };

  const handleTouchEnd = () => {
    pinchStateRef.current.active = false;
  };

  const renderGridLines = () => {
    if (gridType === 'off') return null;
    if (gridType === 'thirds') {
      return (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
        </div>
      );
    }
    if (gridType === 'golden') {
      return (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[38.2%] top-0 bottom-0 w-px bg-amber-300/25" />
          <div className="absolute left-[61.8%] top-0 bottom-0 w-px bg-amber-300/25" />
          <div className="absolute top-[38.2%] left-0 right-0 h-px bg-amber-300/25" />
          <div className="absolute top-[61.8%] left-0 right-0 h-px bg-amber-300/25" />
        </div>
      );
    }
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-px bg-white/45" />
        <div className="h-8 w-px bg-white/45 absolute" />
      </div>
    );
  };

  const sensorAspect = sensorDims.w > 0 && sensorDims.h > 0 ? sensorDims.w / sensorDims.h : 16 / 9;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      {/* Live Camera Container locked to true sensor aspect ratio for exact pixel-to-overlay framing */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ aspectRatio: `${sensorAspect}` }}
        className="relative max-w-full max-h-full w-full lg:w-auto lg:h-full bg-zinc-950 overflow-hidden touch-none cursor-crosshair"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${mirrorPreview ? '-scale-x-100' : ''}`}
        />

        {/* Grid overlay */}
        {streamActive && renderGridLines()}

        {/* Dual Mode Simultaneous Framing Guides */}
        {streamActive && mode === 'dual' && (
          <div className="pointer-events-none absolute inset-0">
            {/* Landscape 16:9 Framing Guide */}
            <div
              style={{
                left: `${(mirrorPreview ? 1 - landscapeRect.normX - landscapeRect.normW : landscapeRect.normX) * 100}%`,
                top: `${landscapeRect.normY * 100}%`,
                width: `${landscapeRect.normW * 100}%`,
                height: `${landscapeRect.normH * 100}%`,
              }}
              className={`absolute border-2 transition-colors ${
                activeDualTarget === 'landscape'
                  ? 'border-sky-400 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]'
                  : 'border-sky-400/45 border-dashed'
              }`}
            >
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[11px] font-mono tabular-nums text-sky-300 flex items-center gap-1">
                <span>16:9</span>
                {activeDualTarget === 'landscape' && <Move className="w-3 h-3" />}
              </div>
            </div>

            {/* Portrait 9:16 Framing Guide */}
            <div
              style={{
                left: `${(mirrorPreview ? 1 - portraitRect.normX - portraitRect.normW : portraitRect.normX) * 100}%`,
                top: `${portraitRect.normY * 100}%`,
                width: `${portraitRect.normW * 100}%`,
                height: `${portraitRect.normH * 100}%`,
              }}
              className={`absolute border-2 transition-colors ${
                activeDualTarget === 'portrait'
                  ? 'border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)]'
                  : 'border-amber-400/55 border-dashed'
              }`}
            >
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[11px] font-mono tabular-nums text-amber-300 flex items-center gap-1">
                <span>9:16</span>
                {activeDualTarget === 'portrait' && <Move className="w-3 h-3" />}
              </div>
            </div>

            {/* Auto-Detected Face Tracking Brackets */}
            {autoFrameFaces &&
              detectedFaces.map((face, idx) => {
                const leftNorm = mirrorPreview ? 1 - face.x - face.width : face.x;
                return (
                  <div
                    key={idx}
                    style={{
                      left: `${leftNorm * 100}%`,
                      top: `${face.y * 100}%`,
                      width: `${face.width * 100}%`,
                      height: `${face.height * 100}%`,
                    }}
                    className="absolute border border-emerald-400/80 rounded-lg transition-all duration-150"
                  >
                    <span className="absolute -top-4 left-0 text-[10px] font-mono text-emerald-300 bg-black/70 px-1 rounded">
                      FACE {idx + 1}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {/* Single Mode (Portrait 9:16, Landscape 16:9, or Photo Aspect) Framing Mask */}
        {streamActive && mode !== 'dual' && (
          <div className="pointer-events-none absolute inset-0">
            <div
              style={{
                left: `${(mirrorPreview ? 1 - singleRect.normX - singleRect.normW : singleRect.normX) * 100}%`,
                top: `${singleRect.normY * 100}%`,
                width: `${singleRect.normW * 100}%`,
                height: `${singleRect.normH * 100}%`,
              }}
              className="absolute border border-white/65 shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
            >
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[11px] font-mono tabular-nums text-zinc-200">
                {mode === 'portrait'
                  ? '9:16 Portrait'
                  : mode === 'landscape'
                  ? '16:9 Landscape'
                  : `${photoAspect} Crop`}
              </div>
            </div>
          </div>
        )}

        {/* Tap-to-Focus Reticle */}
        {focusReticle && (
          <div
            style={{ left: `${focusReticle.x}%`, top: `${focusReticle.y}%` }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-20"
          >
            <div
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-transform ${
                focusReticle.supported ? 'border-amber-400' : 'border-zinc-300/80'
              }`}
            >
              <Crosshair className={`w-5 h-5 ${focusReticle.supported ? 'text-amber-400' : 'text-zinc-200'}`} />
            </div>
            <span className="px-2 py-0.5 rounded bg-black/80 text-[11px] font-medium text-zinc-100 whitespace-nowrap">
              {focusReticle.label}
            </span>
          </div>
        )}

        {/* Live Recording HUD */}
        {isRecording && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-black/80 border border-white/10 backdrop-blur-md">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="text-xs font-semibold text-white whitespace-nowrap">
              {isPaused ? 'PAUSED' : mode === 'dual' ? 'DUAL REC' : mode === 'timelapse' ? 'LAPSE' : 'REC'}
            </span>
            <span className="text-xs font-mono tabular-nums text-zinc-200">
              {formatTimecode(recordingDurationMs)}
            </span>
            {mode === 'timelapse' && (
              <span className="text-xs font-mono tabular-nums text-amber-300">
                · {timelapseFramesCount}f
              </span>
            )}
          </div>
        )}

        {/* Quick Dual Framing Target Switcher Chip on Viewfinder */}
        {streamActive && mode === 'dual' && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectDualTarget('portrait');
              }}
              className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeDualTarget === 'portrait'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              Frame 9:16
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectDualTarget('landscape');
              }}
              className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeDualTarget === 'landscape'
                  ? 'bg-sky-400 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              Frame 16:9
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleAutoFrame();
              }}
              title="Automatically detect faces and adjust 9:16 & 16:9 zoom/pan to keep subjects centered"
              className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                autoFrameFaces
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-200 bg-white/10 hover:bg-white/15'
              }`}
            >
              <ScanFace className="w-3.5 h-3.5" />
              <span>{autoFrameFaces ? 'Auto-Frame On' : 'Auto-Frame'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleDualPip();
              }}
              className="lg:hidden px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-medium text-zinc-200 bg-white/10 hover:bg-white/15 whitespace-nowrap"
            >
              {showDualPip ? 'Hide Split' : 'Split View'}
            </button>
          </div>
        )}

        {/* Calibration Feed Notice */}
        {streamActive && isCalibrationFeed && (
          <div className="pointer-events-none absolute top-3 left-3 z-20 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200">
            Optical Calibration Pattern · No Physical Camera Attached
          </div>
        )}

        {/* Real-time Luminance Histogram Overlay */}
        {streamActive && showHistogram && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-20">
            <LuminanceHistogram videoEl={videoRef.current} streamActive={streamActive} />
          </div>
        )}

        {/* Self-Timer Countdown Overlay */}
        {countdownSeconds !== null && countdownSeconds > 0 && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35">
            <span className="text-7xl font-bold font-mono tabular-nums text-white drop-shadow-lg">
              {countdownSeconds}
            </span>
          </div>
        )}
      </div>

      {/* Camera Permission / No-Hardware Gate */}
      {!streamActive && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-zinc-950/95">
          <div className="max-w-md w-full rounded-2xl bg-zinc-900 border border-white/10 p-6 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                {permissionState === 'denied' || permissionState === 'no-hardware' ? (
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                ) : (
                  <Camera className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white">
                  {permissionState === 'checking'
                    ? 'Initializing Camera Sensor'
                    : permissionState === 'denied'
                    ? 'Camera & Microphone Access Blocked'
                    : permissionState === 'no-hardware'
                    ? 'No Camera Hardware Detected'
                    : 'Camera & Microphone Permission'}
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {errorMessage ||
                    'DualCam Pro requires access to a live camera sensor and microphone to capture synchronized 9:16 portrait and 16:9 landscape streams.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onRequestCamera}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                {permissionState === 'checking' ? 'Request Access' : 'Retry Camera Access'}
              </button>
              <button
                type="button"
                onClick={onLaunchCalibration}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-sm border border-white/10 transition-colors whitespace-nowrap"
              >
                Launch Calibration Feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
