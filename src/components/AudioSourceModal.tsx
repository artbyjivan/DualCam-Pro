import React from 'react';
import {
  Check,
  Headphones,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import { AudioInputDeviceInfo, AudioSourceMode } from '../types/camera';
import { AudioChannelLevels } from '../utils/dualRecorderEngine';

interface AudioSourceModalProps {
  open: boolean;
  onClose: () => void;
  audioDevices: AudioInputDeviceInfo[];
  audioSourceMode: AudioSourceMode;
  onSelectMode: (mode: AudioSourceMode) => void;
  selectedPhoneMicId: string;
  onSelectPhoneMicId: (id: string) => void;
  selectedExternalMicId: string;
  onSelectExternalMicId: (id: string) => void;
  phoneGain: number;
  onChangePhoneGain: (gain: number) => void;
  externalGain: number;
  onChangeExternalGain: (gain: number) => void;
  channelLevels: AudioChannelLevels;
  isRecording: boolean;
  onRefreshDevices: () => void;
  dualMixWarning: string | null;
}

function MeterBar({ level, muted = false }: { level: number; muted?: boolean }) {
  const pct = muted ? 0 : Math.min(100, Math.round(level * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-950 overflow-hidden">
      <div
        style={{ width: `${pct}%` }}
        className={`h-full transition-all duration-75 ${
          level > 0.85 ? 'bg-red-500' : level > 0.55 ? 'bg-amber-400' : 'bg-emerald-400'
        }`}
      />
    </div>
  );
}

export const AudioSourceModal: React.FC<AudioSourceModalProps> = ({
  open,
  onClose,
  audioDevices,
  audioSourceMode,
  onSelectMode,
  selectedPhoneMicId,
  onSelectPhoneMicId,
  selectedExternalMicId,
  onSelectExternalMicId,
  phoneGain,
  onChangePhoneGain,
  externalGain,
  onChangeExternalGain,
  channelLevels,
  isRecording,
  onRefreshDevices,
  dualMixWarning,
}) => {
  if (!open) return null;

  const hasAnyMic = audioDevices.length > 0;
  const externalMics = audioDevices.filter((d) => d.sourceKind === 'external');
  const hasExternalMic = externalMics.length > 0 || audioDevices.length >= 2;
  const canRecordBoth = audioDevices.length >= 2;

  const phoneMicLabel =
    audioDevices.find((d) => d.deviceId === selectedPhoneMicId)?.label ??
    audioDevices[0]?.label ??
    'No built-in microphone detected';

  const externalMicLabel =
    audioDevices.find((d) => d.deviceId === selectedExternalMicId)?.label ??
    externalMics[0]?.label ??
    'No external microphone connected';

  const options: {
    id: AudioSourceMode;
    title: string;
    subtitle: string;
    enabled: boolean;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'phone',
      title: 'Phone / Built-in Mic',
      subtitle: phoneMicLabel,
      enabled: hasAnyMic,
      icon: <Smartphone className="w-4 h-4" />,
    },
    {
      id: 'external',
      title: 'External Mic',
      subtitle: hasExternalMic ? externalMicLabel : 'Connect a USB, wired, or Bluetooth mic to enable',
      enabled: hasExternalMic,
      icon: <Headphones className="w-4 h-4" />,
    },
    {
      id: 'both',
      title: 'Both (Phone + External Mic)',
      subtitle: canRecordBoth
        ? 'Mixes primary phone mic & secondary external mic via independent GainNodes'
        : 'Requires 2 active microphone inputs (built-in + connected external mic)',
      enabled: canRecordBoth,
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'muted',
      title: 'Mute Audio',
      subtitle: 'Record video streams silently with no microphone input',
      enabled: true,
      icon: <MicOff className="w-4 h-4" />,
    },
  ];

  const showPhoneGain = audioSourceMode === 'phone' || audioSourceMode === 'both';
  const showExternalGain = audioSourceMode === 'external' || audioSourceMode === 'both';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-lg bg-zinc-950 border border-white/15 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Mic className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Audio Input & Mixing</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshDevices}
              disabled={isRecording}
              title="Scan for connected microphones"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Master Recording Stream Level Monitor */}
          <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Master Recording Mix</span>
              <span className="font-mono tabular-nums text-zinc-300">
                {audioSourceMode === 'muted'
                  ? 'MUTED'
                  : `${Math.round(channelLevels.master * 100)}%`}
              </span>
            </div>
            <MeterBar level={channelLevels.master} muted={audioSourceMode === 'muted'} />
          </div>

          {isRecording && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              Stop recording before changing microphone routing. GainNode mix levels remain adjustable live.
            </p>
          )}

          {dualMixWarning && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              {dualMixWarning}
            </p>
          )}

          {/* Routing Mode Selection */}
          <div className="space-y-2">
            {options.map((opt) => {
              const selected = audioSourceMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!opt.enabled || (isRecording && opt.id !== audioSourceMode)}
                  onClick={() => onSelectMode(opt.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                    selected
                      ? 'bg-amber-500/12 border-amber-500/60'
                      : opt.enabled
                      ? 'bg-zinc-900/60 border-white/10 hover:border-white/25'
                      : 'bg-zinc-900/30 border-white/5 opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {opt.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-zinc-100">{opt.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 break-words">{opt.subtitle}</p>
                    </div>
                  </div>
                  {selected && <Check className="w-4 h-4 text-amber-400 shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>

          {/* Independent Input Channel Assignment & GainNode Mixer */}
          {audioSourceMode !== 'muted' && audioDevices.length > 0 && (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {audioSourceMode === 'both'
                    ? 'Dual-Channel GainNode Mixer'
                    : 'Input Source & Gain Control'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onChangePhoneGain(1);
                    onChangeExternalGain(1);
                  }}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Unity 100%</span>
                </button>
              </div>

              {/* Primary Phone Mic Channel Strip */}
              {showPhoneGain && (
                <div className="p-3 rounded-xl bg-zinc-900/70 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Primary · Phone Mic</span>
                    </span>
                    <span className="font-mono tabular-nums text-xs text-zinc-300">
                      {Math.round(phoneGain * 100)}%
                    </span>
                  </div>

                  {audioDevices.length > 1 && (
                    <select
                      disabled={isRecording}
                      value={selectedPhoneMicId}
                      onChange={(e) => onSelectPhoneMicId(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-lg bg-zinc-950 border border-white/15 text-xs text-zinc-100 disabled:opacity-50"
                    >
                      {audioDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={phoneGain}
                    onChange={(e) => onChangePhoneGain(parseFloat(e.target.value))}
                    className="w-full pro-slider"
                  />
                  <MeterBar level={channelLevels.primary} muted={phoneGain === 0} />
                </div>
              )}

              {/* Secondary External Mic Channel Strip */}
              {showExternalGain && (
                <div className="p-3 rounded-xl bg-zinc-900/70 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Secondary · External Mic</span>
                    </span>
                    <span className="font-mono tabular-nums text-xs text-zinc-300">
                      {Math.round(externalGain * 100)}%
                    </span>
                  </div>

                  {audioDevices.length > 1 && (
                    <select
                      disabled={isRecording}
                      value={selectedExternalMicId}
                      onChange={(e) => onSelectExternalMicId(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-lg bg-zinc-950 border border-white/15 text-xs text-zinc-100 disabled:opacity-50"
                    >
                      {audioDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={externalGain}
                    onChange={(e) => onChangeExternalGain(parseFloat(e.target.value))}
                    className="w-full pro-slider"
                  />
                  <MeterBar level={channelLevels.secondary} muted={externalGain === 0} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
