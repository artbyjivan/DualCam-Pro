export type CameraMode =
  | 'dual'
  | 'portrait'
  | 'landscape'
  | 'photo'
  | 'timelapse'
  | 'burst'
  | 'slowmo'
  | 'portrait-photo';

export type ResolutionPreset = '720p' | '1080p' | '4k';

export type FpsOption = 24 | 30 | 60 | 120;

export type TimerSeconds = 0 | 3 | 5 | 10;

export type GridOverlayType = 'off' | 'thirds' | 'golden' | 'crosshair';

export type PhotoAspectRatio = '4:3' | '16:9' | '9:16' | '1:1';

export type WhiteBalancePreset = 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent' | 'manual';

export type AudioSourceMode = 'phone' | 'external' | 'both' | 'muted';

export interface AudioInputDeviceInfo {
  deviceId: string;
  groupId: string;
  label: string;
  sourceKind: 'phone' | 'external';
}

export interface CropFrameConfig {
  panX: number; // -1 to 1 normalized horizontal crop pan
  panY: number; // -1 to 1 normalized vertical crop pan
  zoom: number; // 1.0 to 3.0 independent digital framing zoom
}

export interface FramingRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  normX: number;
  normY: number;
  normW: number;
  normH: number;
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: 'user' | 'environment' | 'unknown';
}

export interface CapabilityRange {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  current: number;
}

export interface HardwareCapabilities {
  videoDevices: CameraDeviceInfo[];
  audioDevices: AudioInputDeviceInfo[];
  sensorWidth: number;
  sensorHeight: number;
  sensorMaxWidth: number;
  sensorMaxHeight: number;
  sensorMaxFps: number;
  supportedResolutions: Record<ResolutionPreset, boolean>;
  supportedFps: Record<FpsOption, boolean>;
  torchSupported: boolean;
  zoom: CapabilityRange;
  focusMode: {
    supported: boolean;
    modes: string[];
    manualDistance: CapabilityRange;
    pointsOfInterestSupported: boolean;
  };
  exposure: {
    modeSupported: boolean;
    modes: string[];
    compensation: CapabilityRange;
  };
  whiteBalance: {
    modeSupported: boolean;
    modes: string[];
    colorTemperature: CapabilityRange;
  };
  stabilizationSupported: boolean;
  backgroundBlurSupported: boolean;
  imageCaptureSupported: boolean;
  mediaRecorderPauseSupported: boolean;
  selectedVideoMimeType: string;
  selectedVideoExtension: 'mp4' | 'webm';
}

export interface StorageEstimateInfo {
  quotaBytes: number;
  usageBytes: number;
  remainingBytes: number;
  supported: boolean;
}

export interface VideoTrackFile {
  blob: Blob;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  aspectRatio: '9:16' | '16:9';
  sizeBytes: number;
}

export interface CapturedMediaItem {
  id: string;
  createdAt: number;
  kind: 'dual-video' | 'single-video' | 'timelapse' | 'slowmo' | 'photo' | 'burst';
  durationMs?: number;
  fps?: number;
  hasAudio?: boolean;
  resolutionLabel: string;
  // For dual-video: both separate video files
  portraitVideo?: VideoTrackFile;
  landscapeVideo?: VideoTrackFile;
  // For single-video / timelapse / slowmo
  singleVideo?: VideoTrackFile;
  // For photo
  photoBlob?: Blob;
  photoFilename?: string;
  photoWidth?: number;
  photoHeight?: number;
  photoAspectRatio?: PhotoAspectRatio;
  // For burst
  burstFrames?: {
    blob: Blob;
    filename: string;
    width: number;
    height: number;
  }[];
}

export type PermissionStatusState = 'checking' | 'granted' | 'denied' | 'prompt' | 'no-hardware' | 'calibration';
