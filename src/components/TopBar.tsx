import React from 'react';
import {
  Activity,
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Cpu,
  Flashlight,
  Grid3X3,
  HardDrive,
  Headphones,
  Mic,
  MicOff,
  SlidersHorizontal,
  Timer,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AudioSourceMode,
  GridOverlayType,
  HardwareCapabilities,
  StorageEstimateInfo,
  TimerSeconds,
} from '../types/camera';
import { formatBytes } from '../utils/storage';
import { BatteryStatusInfo } from '../utils/useBatteryStatus';

interface TopBarProps {
  torchEnabled: boolean;
  onToggleTorch: () => void;
  timerSeconds: TimerSeconds;
  onCycleTimer: () => void;
  gridType: GridOverlayType;
  onCycleGrid: () => void;
  audioSourceMode: AudioSourceMode;
  onOpenAudioModal: () => void;
  audioLevel: number;
  uiSoundsMuted: boolean;
  onToggleUiSounds: () => void;
  capabilities: HardwareCapabilities;
  storageInfo: StorageEstimateInfo;
  batteryInfo: BatteryStatusInfo;
  isRecording: boolean;
  showHistogram: boolean;
  onToggleHistogram: () => void;
  onOpenCapabilities: () => void;
  onOpenMobileControls: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  torchEnabled,
  onToggleTorch,
  timerSeconds,
  onCycleTimer,
  gridType,
  onCycleGrid,
  audioSourceMode,
  onOpenAudioModal,
  audioLevel,
  uiSoundsMuted,
  onToggleUiSounds,
  capabilities,
  storageInfo,
  batteryInfo,
  isRecording,
  showHistogram,
  onToggleHistogram,
  onOpenCapabilities,
  onOpenMobileControls,
}) => {
  const storageText = storageInfo.supported ? formatBytes(storageInfo.remainingBytes) : 'Quota N/A';
  const hasExternalAvailable =
    capabilities.audioDevices.some((d) => d.sourceKind === 'external') ||
    capabilities.audioDevices.length >= 2;
  const audioLabel =
    audioSourceMode === 'muted'
      ? 'Muted'
      : audioSourceMode === 'both'
      ? 'Both Mics'
      : audioSourceMode === 'external'
      ? 'Ext Mic'
      : hasExternalAvailable
      ? 'Phone Mic'
      : 'Audio';

  return (
    <header className="h-14 px-3 lg:px-5 bg-zinc-950/95 border-b border-white/10 flex items-center justify-between gap-2 shrink-0 z-30">
      {/* Brand + Storage & Battery Readouts */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm lg:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          DualCam Pro
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-400 whitespace-nowrap">
          <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
          <span>{storageText} free</span>
        </span>
        <span
          title={
            !batteryInfo.supported
              ? 'Battery Status API unavailable in this browser'
              : batteryInfo.charging
              ? `Charging (${batteryInfo.levelPct}%)`
              : batteryInfo.isCritical
              ? `Critical battery (${batteryInfo.levelPct}%) — connect charger`
              : batteryInfo.isLow
              ? `Low battery (${batteryInfo.levelPct}%)`
              : `Battery ${batteryInfo.levelPct}%`
          }
          className={`${
            batteryInfo.isLow ? 'inline-flex' : 'hidden md:inline-flex'
          } items-center gap-1 text-xs font-mono tabular-nums whitespace-nowrap ${
            !batteryInfo.supported
              ? 'text-zinc-500'
              : batteryInfo.charging
              ? 'text-emerald-400'
              : batteryInfo.isCritical
              ? 'text-red-400 font-semibold'
              : batteryInfo.isLow
              ? 'text-amber-400 font-semibold'
              : 'text-zinc-400'
          }`}
        >
          {!batteryInfo.supported ? (
            <>
              <Battery className="w-3.5 h-3.5 text-zinc-600" />
              <span>Bat N/A</span>
            </>
          ) : batteryInfo.charging ? (
            <>
              <BatteryCharging className="w-3.5 h-3.5" />
              <span>{batteryInfo.levelPct}%</span>
            </>
          ) : batteryInfo.isCritical ? (
            <>
              <BatteryWarning className="w-3.5 h-3.5" />
              <span>{batteryInfo.levelPct}% Low</span>
            </>
          ) : batteryInfo.isLow ? (
            <>
              <BatteryLow className="w-3.5 h-3.5" />
              <span>{batteryInfo.levelPct}% Low</span>
            </>
          ) : batteryInfo.levelPct <= 60 ? (
            <>
              <BatteryMedium className="w-3.5 h-3.5 text-zinc-400" />
              <span>{batteryInfo.levelPct}%</span>
            </>
          ) : (
            <>
              <BatteryFull className="w-3.5 h-3.5 text-zinc-400" />
              <span>{batteryInfo.levelPct}%</span>
            </>
          )}
        </span>
      </div>

      {/* Quick Optical & Audio Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Flash / Torch (disabled if hardware does not expose torch) */}
        <button
          type="button"
          onClick={onToggleTorch}
          disabled={!capabilities.torchSupported}
          title={
            capabilities.torchSupported
              ? torchEnabled
                ? 'Turn off torch'
                : 'Turn on torch'
              : 'Flash/Torch not supported by active sensor'
          }
          className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            !capabilities.torchSupported
              ? 'text-zinc-600 cursor-not-allowed'
              : torchEnabled
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Flashlight className="w-4 h-4" />
          <span className="hidden md:inline">{torchEnabled ? 'On' : 'Flash'}</span>
        </button>

        {/* Self Timer */}
        <button
          type="button"
          onClick={onCycleTimer}
          disabled={isRecording}
          title="Cycle self-timer (Off, 3s, 5s, 10s)"
          className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${
            timerSeconds > 0
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Timer className="w-4 h-4" />
          <span className="font-mono tabular-nums">{timerSeconds > 0 ? `${timerSeconds}s` : 'Off'}</span>
        </button>

        {/* Grid Overlay */}
        <button
          type="button"
          onClick={onCycleGrid}
          title="Cycle composition grid (Off, 3x3, Golden, Crosshair)"
          className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1 text-xs font-medium transition-colors whitespace-nowrap ${
            gridType !== 'off'
              ? 'bg-white/15 text-white'
              : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span className="hidden md:inline capitalize">{gridType}</span>
        </button>

        {/* Luminance Histogram Overlay Toggle */}
        <button
          type="button"
          onClick={onToggleHistogram}
          title={showHistogram ? 'Hide luminance histogram' : 'Show luminance histogram'}
          className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            showHistogram
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span className="hidden lg:inline">Luma</span>
        </button>

        {/* Audio Input Source Selector (Phone Mic / External Mic / Both / Mute) + Live VU */}
        <button
          type="button"
          onClick={onOpenAudioModal}
          title="Select Audio Input (Phone Mic, External Mic, Both, or Mute)"
          className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            audioSourceMode === 'muted'
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : audioSourceMode === 'both' || audioSourceMode === 'external'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
              : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          {audioSourceMode === 'muted' ? (
            <MicOff className="w-4 h-4" />
          ) : audioSourceMode === 'both' ? (
            <Users className="w-4 h-4" />
          ) : audioSourceMode === 'external' ? (
            <Headphones className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{audioLabel}</span>
          <span className="hidden sm:flex items-end gap-0.5 h-3 w-4">
            {[0.2, 0.5, 0.8].map((threshold, idx) => (
              <span
                key={idx}
                style={{ height: `${35 + idx * 30}%` }}
                className={`w-1 rounded-full transition-colors ${
                  audioSourceMode !== 'muted' && audioLevel >= threshold
                    ? 'bg-emerald-400'
                    : 'bg-zinc-700'
                }`}
              />
            ))}
          </span>
        </button>

        {/* Shutter/Timer Beep Mute */}
        <button
          type="button"
          onClick={onToggleUiSounds}
          title={uiSoundsMuted ? 'Enable shutter & timer sounds' : 'Mute shutter & timer sounds'}
          className="hidden sm:flex min-h-[44px] min-w-[44px] rounded-lg items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
        >
          {uiSoundsMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Mobile Pro Controls Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenMobileControls}
          title="Open Framing & Pro Optics"
          className="lg:hidden min-h-[44px] min-w-[44px] px-2.5 rounded-lg flex items-center justify-center text-zinc-200 bg-white/10 hover:bg-white/15 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Hardware Capability Audit */}
        <button
          type="button"
          onClick={onOpenCapabilities}
          title="Hardware Capabilities & Native API Matrix"
          className="min-h-[44px] px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-200 bg-zinc-900 border border-white/10 hover:bg-zinc-800 transition-colors whitespace-nowrap"
        >
          <Cpu className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Specs</span>
        </button>
      </div>
    </header>
  );
};
