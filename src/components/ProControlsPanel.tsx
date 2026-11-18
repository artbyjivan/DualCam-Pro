import React from 'react';
import { RotateCcw, ScanFace, ShieldCheck, X } from 'lucide-react';
import {
  CameraMode,
  CropFrameConfig,
  FpsOption,
  HardwareCapabilities,
  PhotoAspectRatio,
  ResolutionPreset,
  WhiteBalancePreset,
} from '../types/camera';
import { DualLiveMonitors } from './DualLiveMonitors';

interface ProControlsPanelProps {
  videoEl: HTMLVideoElement | null;
  streamActive: boolean;
  mode: CameraMode;
  portraitFrame: CropFrameConfig;
  landscapeFrame: CropFrameConfig;
  activeDualTarget: 'portrait' | 'landscape';
  onSelectDualTarget: (target: 'portrait' | 'landscape') => void;
  onUpdatePortraitFrame: (updater: (prev: CropFrameConfig) => CropFrameConfig) => void;
  onUpdateLandscapeFrame: (updater: (prev: CropFrameConfig) => CropFrameConfig) => void;
  onResetFraming: () => void;
  autoFrameFaces: boolean;
  onToggleAutoFrame: () => void;
  detectedFaceCount: number;
  faceEngineLabel: string;
  resolution: ResolutionPreset;
  onChangeResolution: (res: ResolutionPreset) => void;
  fps: FpsOption;
  onChangeFps: (fps: FpsOption) => void;
  capabilities: HardwareCapabilities;
  isRecording: boolean;
  mirrorPreview: boolean;
  // Optical controls
  focusMode: 'continuous' | 'manual';
  onChangeFocusMode: (m: 'continuous' | 'manual') => void;
  focusDistance: number;
  onChangeFocusDistance: (val: number) => void;
  exposureEv: number;
  onChangeExposureEv: (val: number) => void;
  whiteBalance: WhiteBalancePreset;
  onChangeWhiteBalance: (wb: WhiteBalancePreset) => void;
  colorTemp: number;
  onChangeColorTemp: (k: number) => void;
  zoomValue: number;
  onZoomChange: (z: number) => void;
  stabilizationEnabled: boolean;
  onToggleStabilization: () => void;
  photoAspect: PhotoAspectRatio;
  onChangePhotoAspect: (ar: PhotoAspectRatio) => void;
  timelapseIntervalSec: number;
  onChangeTimelapseInterval: (sec: number) => void;
  burstCount: number;
  onChangeBurstCount: (count: number) => void;
  // Mobile drawer support
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const ProControlsPanel: React.FC<ProControlsPanelProps> = ({
  videoEl,
  streamActive,
  mode,
  portraitFrame,
  landscapeFrame,
  activeDualTarget,
  onSelectDualTarget,
  onUpdatePortraitFrame,
  onUpdateLandscapeFrame,
  onResetFraming,
  autoFrameFaces,
  onToggleAutoFrame,
  detectedFaceCount,
  faceEngineLabel,
  resolution,
  onChangeResolution,
  fps,
  onChangeFps,
  capabilities,
  isRecording,
  mirrorPreview,
  focusMode,
  onChangeFocusMode,
  focusDistance,
  onChangeFocusDistance,
  exposureEv,
  onChangeExposureEv,
  whiteBalance,
  onChangeWhiteBalance,
  colorTemp,
  onChangeColorTemp,
  zoomValue,
  onZoomChange,
  stabilizationEnabled,
  onToggleStabilization,
  photoAspect,
  onChangePhotoAspect,
  timelapseIntervalSec,
  onChangeTimelapseInterval,
  burstCount,
  onChangeBurstCount,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const activeFrame = activeDualTarget === 'portrait' ? portraitFrame : landscapeFrame;
  const updateActiveFrame =
    activeDualTarget === 'portrait' ? onUpdatePortraitFrame : onUpdateLandscapeFrame;

  const isVideoLikeMode =
    mode === 'dual' ||
    mode === 'portrait' ||
    mode === 'landscape' ||
    mode === 'slowmo' ||
    mode === 'timelapse';

  const content = (
    <div className="flex flex-col gap-5 p-4 lg:p-5 text-sm">
      {/* Live Dual Monitors & Independent Crop Framing */}
      {mode === 'dual' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Simultaneous Outputs
            </h3>
            <button
              type="button"
              onClick={onResetFraming}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 min-h-[32px] px-2 rounded-md hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Crop</span>
            </button>
          </div>

          <DualLiveMonitors
            videoEl={videoEl}
            streamActive={streamActive}
            portraitFrame={portraitFrame}
            landscapeFrame={landscapeFrame}
            activeTarget={activeDualTarget}
            onSelectTarget={onSelectDualTarget}
            mirrorHorizontal={mirrorPreview}
          />

          {/* Auto-Frame Faces Toggle */}
          <div className="rounded-xl bg-zinc-900/70 border border-white/10 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                <ScanFace className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Auto-Frame Subjects</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {autoFrameFaces
                  ? `${
                      detectedFaceCount > 0
                        ? `${detectedFaceCount} ${detectedFaceCount === 1 ? 'face' : 'faces'} centered`
                        : 'Scanning for faces'
                    } · ${faceEngineLabel}`
                  : 'Centers & zooms 9:16 and 16:9 automatically'}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleAutoFrame}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                autoFrameFaces
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {autoFrameFaces ? 'Active' : 'Enable'}
            </button>
          </div>

          <div className="rounded-xl bg-zinc-900/70 border border-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-200">
                Adjusting{' '}
                <span className={activeDualTarget === 'portrait' ? 'text-amber-400' : 'text-sky-400'}>
                  {activeDualTarget === 'portrait' ? 'Portrait 9:16' : 'Landscape 16:9'}
                </span>
              </span>
              <span className="font-mono tabular-nums text-zinc-400">
                {activeFrame.zoom.toFixed(2)}x
              </span>
            </div>

            <label className="block space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Crop Zoom</span>
                <span className="font-mono tabular-nums">{activeFrame.zoom.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={2.5}
                step={0.05}
                value={activeFrame.zoom}
                onChange={(e) =>
                  updateActiveFrame((prev) => ({ ...prev, zoom: parseFloat(e.target.value) }))
                }
                className="w-full pro-slider"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Horizontal Pan (X)</span>
                <span className="font-mono tabular-nums">{Math.round(activeFrame.panX * 100)}%</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={activeFrame.panX}
                onChange={(e) =>
                  updateActiveFrame((prev) => ({ ...prev, panX: parseFloat(e.target.value) }))
                }
                className="w-full pro-slider"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Vertical Pan (Y)</span>
                <span className="font-mono tabular-nums">{Math.round(activeFrame.panY * 100)}%</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={activeFrame.panY}
                onChange={(e) =>
                  updateActiveFrame((prev) => ({ ...prev, panY: parseFloat(e.target.value) }))
                }
                className="w-full pro-slider"
              />
            </label>
          </div>
        </section>
      )}

      {/* Resolution & Frame Rate (Strictly disabled when hardware cannot deliver) */}
      {isVideoLikeMode && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Format & Frame Rate
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-zinc-500">
              Sensor {capabilities.sensorWidth}×{capabilities.sensorHeight}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            {(['720p', '1080p', '4k'] as ResolutionPreset[]).map((res) => {
              const supported = capabilities.supportedResolutions[res];
              return (
                <button
                  key={res}
                  type="button"
                  disabled={!supported || isRecording}
                  onClick={() => onChangeResolution(res)}
                  title={
                    supported
                      ? `Set output resolution to ${res.toUpperCase()}`
                      : `${res.toUpperCase()} exceeds detected camera sensor max (${capabilities.sensorMaxWidth}×${capabilities.sensorMaxHeight})`
                  }
                  className={`min-h-[40px] rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                    resolution === res
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : supported
                      ? 'text-zinc-300 hover:bg-white/5'
                      : 'text-zinc-600 cursor-not-allowed line-through'
                  }`}
                >
                  {res.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            {([24, 30, 60, 120] as FpsOption[]).map((opt) => {
              const supported = capabilities.supportedFps[opt];
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!supported || isRecording}
                  onClick={() => onChangeFps(opt)}
                  title={
                    supported
                      ? `Record at ${opt} FPS`
                      : `${opt} FPS not exposed by current browser sensor (max ${capabilities.sensorMaxFps} FPS)`
                  }
                  className={`min-h-[40px] rounded-lg text-xs font-mono tabular-nums font-medium transition-colors whitespace-nowrap ${
                    fps === opt
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : supported
                      ? 'text-zinc-300 hover:bg-white/5'
                      : 'text-zinc-600 cursor-not-allowed line-through'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Mode-Specific Controls: Photo Aspect, Time-Lapse Interval, Burst Count */}
      {(mode === 'photo' || mode === 'burst' || mode === 'portrait-photo') && (
        <section className="space-y-2.5 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Photo Aspect Ratio
          </h3>
          <div className="grid grid-cols-4 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            {(['4:3', '16:9', '9:16', '1:1'] as PhotoAspectRatio[]).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => onChangePhotoAspect(ar)}
                className={`min-h-[40px] rounded-lg text-xs font-mono tabular-nums transition-colors ${
                  photoAspect === ar
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === 'timelapse' && (
        <section className="space-y-2.5 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Time-Lapse Interval
          </h3>
          <div className="grid grid-cols-5 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            {[0.5, 1, 2, 5, 10].map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={isRecording}
                onClick={() => onChangeTimelapseInterval(sec)}
                className={`min-h-[40px] rounded-lg text-xs font-mono tabular-nums transition-colors ${
                  timelapseIntervalSec === sec
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === 'burst' && (
        <section className="space-y-2.5 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Burst Sequence Frames
          </h3>
          <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            {[5, 10, 15].map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => onChangeBurstCount(cnt)}
                className={`min-h-[40px] rounded-lg text-xs font-mono tabular-nums transition-colors ${
                  burstCount === cnt
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                {cnt} shots
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Hardware Optical Controls */}
      <section className="space-y-4 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Sensor & Optics
          </h3>
          <span className="text-[11px] text-zinc-500">Hardware-gated</span>
        </div>

        {/* Hardware Zoom */}
        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-300">Optical / Sensor Zoom</span>
            <span className="font-mono tabular-nums text-zinc-400">
              {capabilities.zoom.supported ? `${zoomValue.toFixed(1)}x` : 'Unsupported'}
            </span>
          </div>
          <input
            type="range"
            disabled={!capabilities.zoom.supported}
            min={capabilities.zoom.supported ? capabilities.zoom.min : 1}
            max={capabilities.zoom.supported ? capabilities.zoom.max : 3}
            step={capabilities.zoom.supported ? capabilities.zoom.step : 0.1}
            value={zoomValue}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="w-full pro-slider"
          />
        </label>

        {/* Focus Mode & Manual Focus */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">Autofocus</span>
            {capabilities.focusMode.supported ? (
              <div className="flex gap-1 bg-zinc-900 p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => onChangeFocusMode('continuous')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    focusMode === 'continuous'
                      ? 'bg-zinc-100 text-zinc-950 font-medium'
                      : 'text-zinc-400'
                  }`}
                >
                  Continuous
                </button>
                <button
                  type="button"
                  disabled={!capabilities.focusMode.manualDistance.supported}
                  onClick={() => onChangeFocusMode('manual')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    focusMode === 'manual'
                      ? 'bg-amber-500 text-zinc-950 font-medium'
                      : capabilities.focusMode.manualDistance.supported
                      ? 'text-zinc-400'
                      : 'text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  Manual
                </button>
              </div>
            ) : (
              <span className="text-zinc-500 font-mono">Fixed / Auto</span>
            )}
          </div>

          {capabilities.focusMode.manualDistance.supported && focusMode === 'manual' && (
            <label className="block space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Focus Distance</span>
                <span className="font-mono tabular-nums">{focusDistance.toFixed(2)}m</span>
              </div>
              <input
                type="range"
                min={capabilities.focusMode.manualDistance.min}
                max={capabilities.focusMode.manualDistance.max}
                step={capabilities.focusMode.manualDistance.step}
                value={focusDistance}
                onChange={(e) => onChangeFocusDistance(parseFloat(e.target.value))}
                className="w-full pro-slider"
              />
            </label>
          )}
        </div>

        {/* Exposure Compensation (EV) */}
        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-300">Exposure (EV)</span>
            <span className="font-mono tabular-nums text-zinc-400">
              {capabilities.exposure.compensation.supported
                ? `${exposureEv > 0 ? '+' : ''}${exposureEv.toFixed(1)} EV`
                : 'Unsupported'}
            </span>
          </div>
          <input
            type="range"
            disabled={!capabilities.exposure.compensation.supported}
            min={capabilities.exposure.compensation.supported ? capabilities.exposure.compensation.min : -2}
            max={capabilities.exposure.compensation.supported ? capabilities.exposure.compensation.max : 2}
            step={capabilities.exposure.compensation.supported ? capabilities.exposure.compensation.step : 0.25}
            value={exposureEv}
            onChange={(e) => onChangeExposureEv(parseFloat(e.target.value))}
            className="w-full pro-slider"
          />
        </label>

        {/* White Balance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">White Balance</span>
            <span className="text-zinc-500 font-mono">
              {capabilities.whiteBalance.colorTemperature.supported
                ? `${colorTemp}K`
                : capabilities.whiteBalance.modeSupported
                ? whiteBalance
                : 'Auto Only'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['auto', 'daylight', 'tungsten'] as WhiteBalancePreset[]).map((preset) => {
              const supported =
                capabilities.whiteBalance.modeSupported &&
                (preset === 'auto'
                  ? capabilities.whiteBalance.modes.includes('continuous')
                  : capabilities.whiteBalance.modes.includes('manual') &&
                    capabilities.whiteBalance.colorTemperature.supported);
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={!supported}
                  onClick={() => onChangeWhiteBalance(preset)}
                  className={`min-h-[36px] rounded-lg text-xs capitalize border transition-colors ${
                    whiteBalance === preset && supported
                      ? 'bg-zinc-100 text-zinc-950 border-white font-medium'
                      : supported
                      ? 'bg-zinc-900 text-zinc-300 border-white/10 hover:bg-zinc-800'
                      : 'bg-zinc-900/40 text-zinc-600 border-white/5 cursor-not-allowed'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          {capabilities.whiteBalance.colorTemperature.supported && whiteBalance !== 'auto' && (
            <input
              type="range"
              min={capabilities.whiteBalance.colorTemperature.min}
              max={capabilities.whiteBalance.colorTemperature.max}
              step={capabilities.whiteBalance.colorTemperature.step}
              value={colorTemp}
              onChange={(e) => onChangeColorTemp(parseInt(e.target.value, 10))}
              className="w-full pro-slider"
            />
          )}
        </div>

        {/* Video Stabilization */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <ShieldCheck className="w-4 h-4 text-zinc-400" />
            <span>Optical Stabilization (OIS)</span>
          </div>
          <button
            type="button"
            disabled={!capabilities.stabilizationSupported}
            onClick={onToggleStabilization}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              !capabilities.stabilizationSupported
                ? 'bg-zinc-900/40 text-zinc-600 border-white/5 cursor-not-allowed'
                : stabilizationEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-zinc-900 text-zinc-300 border-white/10'
            }`}
          >
            {!capabilities.stabilizationSupported
              ? 'Unavailable'
              : stabilizationEnabled
              ? 'Enabled'
              : 'Off'}
          </button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Side Workstation Panel */}
      <aside className="hidden lg:block w-[360px] xl:w-[380px] shrink-0 bg-zinc-950 border-l border-white/10 overflow-y-auto">
        {content}
      </aside>

      {/* Mobile Slide-Up Bottom Sheet */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[82vh] bg-zinc-950 border-t border-white/15 rounded-t-3xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <span className="text-sm font-semibold text-white">Framing & Pro Optics</span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto pb-6">{content}</div>
          </div>
        </div>
      )}
    </>
  );
};
