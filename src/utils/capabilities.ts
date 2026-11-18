import {
  AudioInputDeviceInfo,
  CameraDeviceInfo,
  CapabilityRange,
  FpsOption,
  HardwareCapabilities,
  ResolutionPreset,
} from '../types/camera';

// Extended MediaTrackCapabilities covering W3C ImageCapture / PTZ / Chrome properties
interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step: number };
  pointsOfInterest?: unknown;
  exposureMode?: string[];
  exposureCompensation?: { min: number; max: number; step: number };
  whiteBalanceMode?: string[];
  colorTemperature?: { min: number; max: number; step: number };
  backgroundBlur?: boolean[];
  opticalImageStabilization?: boolean;
}

interface ExtendedSettings extends MediaTrackSettings {
  zoom?: number;
  focusDistance?: number;
  exposureCompensation?: number;
  colorTemperature?: number;
}

const DISABLED_RANGE: CapabilityRange = {
  supported: false,
  min: 0,
  max: 0,
  step: 0,
  current: 0,
};

export function selectPreferredMimeType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }
  const candidates: { mimeType: string; extension: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1,mp4a', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=h264,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    } catch {
      // Continue checking
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

const EXTERNAL_MIC_KEYWORDS = [
  'usb',
  'bluetooth',
  'headset',
  'headphone',
  'earbud',
  'airpods',
  'external',
  'wired',
  'rode',
  'shure',
  'boya',
  'saramonic',
  'dji',
  'lavalier',
  'wireless',
  'line in',
  'interface',
  'scarlett',
  'yeti',
  'logitech',
  'hyperx',
  'condenser',
];

const INTERNAL_MIC_KEYWORDS = [
  'built-in',
  'internal',
  'phone',
  'speakerphone',
  'bottom',
  'handset',
  'macbook',
  'array',
  'realtek',
];

export async function enumerateCameraDevices(): Promise<{
  videoDevices: CameraDeviceInfo[];
  audioDevices: AudioInputDeviceInfo[];
}> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { videoDevices: [], audioDevices: [] };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices: CameraDeviceInfo[] = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => {
        const lower = (d.label || '').toLowerCase();
        let facing: 'user' | 'environment' | 'unknown' = 'unknown';
        if (lower.includes('front') || lower.includes('user') || lower.includes('facetime')) {
          facing = 'user';
        } else if (lower.includes('back') || lower.includes('rear') || lower.includes('environment')) {
          facing = 'environment';
        }
        return {
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
          facing,
        };
      });

    const rawAudio = devices.filter((d) => d.kind === 'audioinput');
    const physicalAudio = rawAudio.filter(
      (d) => d.deviceId !== 'default' && d.deviceId !== 'communications'
    );
    const chosenList = physicalAudio.length > 0 ? physicalAudio : rawAudio;

    // Deduplicate by groupId when distinct labels collapse to one physical device
    const seenIds = new Set<string>();
    const audioDevices: AudioInputDeviceInfo[] = [];
    for (let i = 0; i < chosenList.length; i++) {
      const d = chosenList[i];
      if (!d.deviceId || seenIds.has(d.deviceId)) continue;
      seenIds.add(d.deviceId);
      const label = d.label || `Microphone ${audioDevices.length + 1}`;
      const lower = label.toLowerCase();
      const isExternal = EXTERNAL_MIC_KEYWORDS.some((kw) => lower.includes(kw));
      const isInternal = INTERNAL_MIC_KEYWORDS.some((kw) => lower.includes(kw));

      let sourceKind: 'phone' | 'external' = 'phone';
      if (isExternal) {
        sourceKind = 'external';
      } else if (!isInternal && audioDevices.some((a) => a.sourceKind === 'phone' && a.groupId !== d.groupId)) {
        sourceKind = 'external';
      }

      audioDevices.push({
        deviceId: d.deviceId,
        groupId: d.groupId || d.deviceId,
        label,
        sourceKind,
      });
    }

    return { videoDevices, audioDevices };
  } catch {
    return { videoDevices: [], audioDevices: [] };
  }
}

export async function probeHardwareCapabilities(
  videoTrack: MediaStreamTrack | null,
  isCalibrationFeed = false
): Promise<HardwareCapabilities> {
  const { videoDevices, audioDevices } = await enumerateCameraDevices();
  const { mimeType, extension } = selectPreferredMimeType();
  const mediaRecorderPauseSupported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function';
  const imageCaptureSupported =
    !isCalibrationFeed && typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === 'function';

  if (!videoTrack || isCalibrationFeed) {
    const w = isCalibrationFeed ? 1920 : 0;
    const h = isCalibrationFeed ? 1080 : 0;
    return {
      videoDevices,
      audioDevices,
      sensorWidth: w,
      sensorHeight: h,
      sensorMaxWidth: w,
      sensorMaxHeight: h,
      sensorMaxFps: isCalibrationFeed ? 60 : 0,
      supportedResolutions: {
        '720p': isCalibrationFeed,
        '1080p': isCalibrationFeed,
        '4k': false,
      },
      supportedFps: {
        24: isCalibrationFeed,
        30: isCalibrationFeed,
        60: isCalibrationFeed,
        120: false,
      },
      torchSupported: false,
      zoom: DISABLED_RANGE,
      focusMode: {
        supported: false,
        modes: [],
        manualDistance: DISABLED_RANGE,
        pointsOfInterestSupported: false,
      },
      exposure: {
        modeSupported: false,
        modes: [],
        compensation: DISABLED_RANGE,
      },
      whiteBalance: {
        modeSupported: false,
        modes: [],
        colorTemperature: DISABLED_RANGE,
      },
      stabilizationSupported: false,
      backgroundBlurSupported: false,
      imageCaptureSupported: false,
      mediaRecorderPauseSupported,
      selectedVideoMimeType: mimeType,
      selectedVideoExtension: extension,
    };
  }

  const caps: ExtendedCapabilities =
    typeof videoTrack.getCapabilities === 'function' ? (videoTrack.getCapabilities() as ExtendedCapabilities) : {};
  const settings: ExtendedSettings =
    typeof videoTrack.getSettings === 'function' ? (videoTrack.getSettings() as ExtendedSettings) : {};

  const sensorWidth = settings.width ?? 1280;
  const sensorHeight = settings.height ?? 720;
  const sensorMaxWidth = caps.width?.max ?? sensorWidth;
  const sensorMaxHeight = caps.height?.max ?? sensorHeight;
  const maxLongEdge = Math.max(sensorMaxWidth, sensorMaxHeight);
  const sensorMaxFps = caps.frameRate?.max ?? settings.frameRate ?? 30;

  const supportedResolutions: Record<ResolutionPreset, boolean> = {
    '720p': maxLongEdge >= 960 || sensorWidth >= 640,
    '1080p': maxLongEdge >= 1920,
    '4k': maxLongEdge >= 3840,
  };

  const supportedFps: Record<FpsOption, boolean> = {
    24: sensorMaxFps >= 24,
    30: sensorMaxFps >= 29,
    60: sensorMaxFps >= 58,
    120: sensorMaxFps >= 115,
  };

  const zoom: CapabilityRange = caps.zoom
    ? {
        supported: caps.zoom.max > caps.zoom.min,
        min: caps.zoom.min,
        max: caps.zoom.max,
        step: caps.zoom.step || 0.1,
        current: settings.zoom ?? caps.zoom.min,
      }
    : DISABLED_RANGE;

  const manualDistance: CapabilityRange = caps.focusDistance
    ? {
        supported: caps.focusDistance.max > caps.focusDistance.min,
        min: caps.focusDistance.min,
        max: caps.focusDistance.max,
        step: caps.focusDistance.step || 0.05,
        current: settings.focusDistance ?? caps.focusDistance.min,
      }
    : DISABLED_RANGE;

  const exposureComp: CapabilityRange = caps.exposureCompensation
    ? {
        supported: caps.exposureCompensation.max > caps.exposureCompensation.min,
        min: caps.exposureCompensation.min,
        max: caps.exposureCompensation.max,
        step: caps.exposureCompensation.step || 0.25,
        current: settings.exposureCompensation ?? 0,
      }
    : DISABLED_RANGE;

  const colorTemp: CapabilityRange = caps.colorTemperature
    ? {
        supported: caps.colorTemperature.max > caps.colorTemperature.min,
        min: caps.colorTemperature.min,
        max: caps.colorTemperature.max,
        step: caps.colorTemperature.step || 100,
        current: settings.colorTemperature ?? 5500,
      }
    : DISABLED_RANGE;

  return {
    videoDevices,
    audioDevices,
    sensorWidth,
    sensorHeight,
    sensorMaxWidth,
    sensorMaxHeight,
    sensorMaxFps: Math.round(sensorMaxFps),
    supportedResolutions,
    supportedFps,
    torchSupported: Boolean(caps.torch),
    zoom,
    focusMode: {
      supported: Array.isArray(caps.focusMode) && caps.focusMode.length > 0,
      modes: caps.focusMode ?? [],
      manualDistance,
      pointsOfInterestSupported: 'pointsOfInterest' in caps,
    },
    exposure: {
      modeSupported: Array.isArray(caps.exposureMode) && caps.exposureMode.length > 0,
      modes: caps.exposureMode ?? [],
      compensation: exposureComp,
    },
    whiteBalance: {
      modeSupported: Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.length > 0,
      modes: caps.whiteBalanceMode ?? [],
      colorTemperature: colorTemp,
    },
    stabilizationSupported: Boolean(caps.opticalImageStabilization),
    backgroundBlurSupported: Array.isArray(caps.backgroundBlur) && caps.backgroundBlur.includes(true),
    imageCaptureSupported,
    mediaRecorderPauseSupported,
    selectedVideoMimeType: mimeType,
    selectedVideoExtension: extension,
  };
}

export function getResolutionDimensions(
  preset: ResolutionPreset,
  aspect: '9:16' | '16:9'
): { width: number; height: number } {
  const shortSide = preset === '4k' ? 2160 : preset === '1080p' ? 1080 : 720;
  const longSide = preset === '4k' ? 3840 : preset === '1080p' ? 1920 : 1280;
  return aspect === '9:16'
    ? { width: shortSide, height: longSide }
    : { width: longSide, height: shortSide };
}
