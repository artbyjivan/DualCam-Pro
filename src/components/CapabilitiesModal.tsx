import React from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { HardwareCapabilities, StorageEstimateInfo } from '../types/camera';
import { formatBytes } from '../utils/storage';

interface CapabilitiesModalProps {
  open: boolean;
  onClose: () => void;
  capabilities: HardwareCapabilities;
  storageInfo: StorageEstimateInfo;
  isCalibrationFeed: boolean;
}

export const CapabilitiesModal: React.FC<CapabilitiesModalProps> = ({
  open,
  onClose,
  capabilities,
  storageInfo,
  isCalibrationFeed,
}) => {
  if (!open) return null;

  const featureRows: {
    name: string;
    implementation: 'Web Camera & Canvas' | 'Browser Hardware API' | 'Requires Native Camera API';
    available: boolean;
    detail: string;
  }[] = [
    {
      name: 'Simultaneous 9:16 + 16:9 Dual Recording',
      implementation: 'Web Camera & Canvas',
      available: true,
      detail: 'Single live camera session cropped in real time to two independent MediaRecorder outputs with shared Web Audio clock.',
    },
    {
      name: 'Independent Portrait & Landscape Framing',
      implementation: 'Web Camera & Canvas',
      available: true,
      detail: 'Real-time pan X/Y and crop zoom per output without rotating or stretching after capture.',
    },
    {
      name: 'Time-Lapse & Burst Photography',
      implementation: 'Web Camera & Canvas',
      available: true,
      detail: 'Intervalometer frame encoding and rapid multi-frame burst capture saved to IndexedDB.',
    },
    {
      name: 'Hardware Resolution & Frame Rate',
      implementation: 'Browser Hardware API',
      available: capabilities.supportedResolutions['1080p'],
      detail: `Active sensor reports max ${capabilities.sensorMaxWidth}×${capabilities.sensorMaxHeight} at up to ${capabilities.sensorMaxFps} FPS.`,
    },
    {
      name: 'Flash / Torch & Optical Zoom',
      implementation: 'Browser Hardware API',
      available: capabilities.torchSupported || capabilities.zoom.supported,
      detail: `Torch: ${capabilities.torchSupported ? 'Supported' : 'Unavailable'} · Hardware Zoom: ${
        capabilities.zoom.supported
          ? `${capabilities.zoom.min}x–${capabilities.zoom.max}x`
          : 'Unavailable'
      }`,
    },
    {
      name: 'Manual Focus, Exposure (EV) & White Balance',
      implementation: 'Browser Hardware API',
      available:
        capabilities.focusMode.manualDistance.supported ||
        capabilities.exposure.compensation.supported ||
        capabilities.whiteBalance.colorTemperature.supported,
      detail: 'Controls are automatically enabled or disabled based on MediaStreamTrack.getCapabilities().',
    },
    {
      name: 'Simultaneous Multi-Lens Physical Streams (Wide + Tele)',
      implementation: 'Requires Native Camera API',
      available: false,
      detail: 'Capturing two separate physical lenses simultaneously requires iOS AVFoundation MultiCam or Android Camera2 concurrent streams.',
    },
    {
      name: '120 / 240 FPS High-Speed Sensor Readout',
      implementation: 'Requires Native Camera API',
      available: capabilities.supportedFps[120],
      detail: capabilities.supportedFps[120]
        ? '120 FPS exposed by active browser hardware.'
        : 'Standard browser WebRTC pipelines cap capture at 30–60 FPS; true 120/240 FPS slow-motion requires native Camera2/AVFoundation.',
    },
    {
      name: 'Optical Depth-Map Portrait Bokeh & Gyro OIS Lock',
      implementation: 'Requires Native Camera API',
      available: capabilities.backgroundBlurSupported || capabilities.stabilizationSupported,
      detail: 'LiDAR/ToF hardware depth maps and gyro-synchronized EIS/OIS require native platform camera frameworks.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl max-h-[88vh] bg-zinc-950 border border-white/15 rounded-2xl flex flex-col overflow-hidden">
        <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-white">Hardware & Capability Matrix</h2>
            {isCalibrationFeed && (
              <span className="text-xs font-mono text-amber-400">Calibration Mode</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Detected Hardware Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10">
              <p className="text-[11px] text-zinc-400">Active Sensor</p>
              <p className="text-sm font-mono tabular-nums font-semibold text-white mt-1">
                {capabilities.sensorWidth}×{capabilities.sensorHeight}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10">
              <p className="text-[11px] text-zinc-400">Max Frame Rate</p>
              <p className="text-sm font-mono tabular-nums font-semibold text-white mt-1">
                {capabilities.sensorMaxFps} FPS
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10">
              <p className="text-[11px] text-zinc-400">Encoder Format</p>
              <p className="text-sm font-mono font-semibold text-white mt-1 uppercase">
                {capabilities.selectedVideoExtension}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10">
              <p className="text-[11px] text-zinc-400">Browser Quota Free</p>
              <p className="text-sm font-mono tabular-nums font-semibold text-white mt-1">
                {storageInfo.supported ? formatBytes(storageInfo.remainingBytes) : 'N/A'}
              </p>
            </div>
          </div>

          {/* Feature Distinction Table */}
          <div className="divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden bg-zinc-900/40">
            {featureRows.map((row) => (
              <div key={row.name} className="p-3.5 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-100 text-xs sm:text-sm">
                      {row.name}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      · {row.implementation}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{row.detail}</p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium pt-0.5">
                  {row.available ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Active</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-zinc-500" />
                      <span className="text-zinc-500">
                        {row.implementation === 'Requires Native Camera API' ? 'Native API' : 'Disabled'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
