import React from 'react';
import {
  Camera,
  Film,
  Images,
  Pause,
  Play,
  RefreshCcw,
  Square,
} from 'lucide-react';
import { CameraMode, HardwareCapabilities } from '../types/camera';

interface BottomDockProps {
  mode: CameraMode;
  onChangeMode: (mode: CameraMode) => void;
  isRecording: boolean;
  isPaused: boolean;
  onPrimaryAction: () => void;
  onTogglePause: () => void;
  onSwitchCamera: () => void;
  onOpenGallery: () => void;
  galleryCount: number;
  latestThumbUrl: string | null;
  capabilities: HardwareCapabilities;
  zoomValue: number;
  onZoomChange: (z: number) => void;
  canSwitchCamera: boolean;
  isBusyProcessing: boolean;
}

const PRIMARY_RECORDING_MODES: { id: CameraMode; label: string; tag: string }[] = [
  { id: 'dual', label: 'Dual', tag: '9:16 + 16:9' },
  { id: 'portrait', label: 'Portrait', tag: '9:16' },
  { id: 'landscape', label: 'Landscape', tag: '16:9' },
];

const EXTRA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'timelapse', label: 'Time-Lapse' },
  { id: 'burst', label: 'Burst' },
  { id: 'slowmo', label: 'Slow-Mo' },
  { id: 'portrait-photo', label: 'Portrait Photo' },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  mode,
  onChangeMode,
  isRecording,
  isPaused,
  onPrimaryAction,
  onTogglePause,
  onSwitchCamera,
  onOpenGallery,
  galleryCount,
  latestThumbUrl,
  capabilities,
  zoomValue,
  onZoomChange,
  canSwitchCamera,
  isBusyProcessing,
}) => {
  const isPhotoLike = mode === 'photo' || mode === 'burst' || mode === 'portrait-photo';
  const zoomSteps = capabilities.zoom.supported
    ? [
        capabilities.zoom.min,
        Number(((capabilities.zoom.min + capabilities.zoom.max) * 0.35).toFixed(1)),
        Number(capabilities.zoom.max.toFixed(1)),
      ].filter((v, i, arr) => arr.indexOf(v) === i)
    : [1];

  return (
    <footer className="bg-zinc-950 border-t border-white/10 px-3 sm:px-6 pt-2.5 pb-3.5 shrink-0 z-30">
      <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
        {/* Quick 3-Way Recording Mode Bar + Secondary Modes */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Fast 3-way Switcher: Dual / Portrait / Landscape */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-white/10 w-full sm:w-auto justify-center">
            {PRIMARY_RECORDING_MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={isRecording}
                  onClick={() => onChangeMode(m.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    active
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{m.label}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      active ? 'text-zinc-900' : 'text-zinc-500'
                    }`}
                  >
                    {m.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Photo & Extra Modes Scroller */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full py-0.5">
            {EXTRA_MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={isRecording}
                  onClick={() => onChangeMode(m.id)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    active
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Shutter Row */}
        <div className="flex items-center justify-between gap-4 pt-0.5">
          {/* Left: Gallery Thumbnail Button */}
          <div className="flex items-center gap-2.5 min-w-[92px]">
            <button
              type="button"
              onClick={onOpenGallery}
              className="relative w-12 h-12 rounded-xl bg-zinc-900 border border-white/15 overflow-hidden flex items-center justify-center hover:border-white/35 transition-colors shrink-0"
              title="Open Media Gallery"
            >
              {latestThumbUrl ? (
                <img
                  src={latestThumbUrl}
                  alt="Latest capture"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Images className="w-5 h-5 text-zinc-400" />
              )}
            </button>
            <div className="hidden sm:flex flex-col text-xs leading-tight">
              <span className="font-medium text-zinc-200">Gallery</span>
              <span className="font-mono tabular-nums text-zinc-500">
                {galleryCount} {galleryCount === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>

          {/* Center: Zoom Quick Steps + Main Shutter + Pause/Resume */}
          <div className="flex items-center gap-4">
            {capabilities.zoom.supported && (
              <div className="hidden md:flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-white/10">
                {zoomSteps.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => onZoomChange(z)}
                    className={`px-2 py-1 min-h-[32px] rounded text-xs font-mono tabular-nums transition-colors ${
                      Math.abs(zoomValue - z) < 0.15
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            )}

            {/* Primary Shutter / Record Button */}
            <button
              type="button"
              disabled={isBusyProcessing}
              onClick={onPrimaryAction}
              aria-label={
                isRecording
                  ? 'Stop Recording'
                  : isPhotoLike
                  ? 'Capture Photo'
                  : 'Start Recording'
              }
              className="relative w-[68px] h-[68px] rounded-full border-[3px] border-white flex items-center justify-center p-1.5 transition-transform active:scale-95 disabled:opacity-50 shrink-0"
            >
              {isPhotoLike ? (
                <span className="w-full h-full rounded-full bg-white flex items-center justify-center text-zinc-950">
                  <Camera className="w-6 h-6" />
                </span>
              ) : isRecording ? (
                <span className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center">
                  <Square className="w-3.5 h-3.5 text-white fill-white" />
                </span>
              ) : (
                <span className="w-full h-full rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center">
                  <Film className="w-5 h-5 text-white opacity-0" />
                </span>
              )}
            </button>

            {/* Pause / Resume Button during active recording */}
            {isRecording && (
              <button
                type="button"
                disabled={!capabilities.mediaRecorderPauseSupported || mode === 'timelapse'}
                onClick={onTogglePause}
                title={
                  !capabilities.mediaRecorderPauseSupported
                    ? 'Pause/Resume unsupported by browser MediaRecorder'
                    : mode === 'timelapse'
                    ? 'Pause unavailable in interval time-lapse'
                    : isPaused
                    ? 'Resume recording'
                    : 'Pause recording'
                }
                className="w-12 h-12 rounded-full bg-zinc-900 border border-white/15 hover:bg-zinc-800 flex items-center justify-center text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isPaused ? <Play className="w-5 h-5 fill-white" /> : <Pause className="w-5 h-5" />}
              </button>
            )}
          </div>

          {/* Right: Flip Front / Rear Camera */}
          <div className="flex items-center justify-end min-w-[92px]">
            <button
              type="button"
              disabled={!canSwitchCamera || isRecording}
              onClick={onSwitchCamera}
              title={
                canSwitchCamera
                  ? 'Switch front / rear camera'
                  : 'Only one camera sensor detected'
              }
              className="w-12 h-12 rounded-full bg-zinc-900 border border-white/15 hover:bg-zinc-800 flex items-center justify-center text-zinc-200 disabled:opacity-35 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
