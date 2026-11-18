import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatteryWarning } from 'lucide-react';
import { AudioSourceModal } from './components/AudioSourceModal';
import { BottomDock } from './components/BottomDock';
import { CapabilitiesModal } from './components/CapabilitiesModal';
import { DualLiveMonitors } from './components/DualLiveMonitors';
import { GalleryModal } from './components/GalleryModal';
import { ProControlsPanel } from './components/ProControlsPanel';
import { TopBar } from './components/TopBar';
import { Viewfinder } from './components/Viewfinder';
import {
  AudioInputDeviceInfo,
  AudioSourceMode,
  CameraMode,
  CapturedMediaItem,
  CropFrameConfig,
  FpsOption,
  GridOverlayType,
  HardwareCapabilities,
  PermissionStatusState,
  PhotoAspectRatio,
  ResolutionPreset,
  StorageEstimateInfo,
  TimerSeconds,
  VideoTrackFile,
  WhiteBalancePreset,
} from './types/camera';
import { playRecordTone, playShutterSound, playTimerBeep } from './utils/audioCue';
import {
  enumerateCameraDevices,
  getResolutionDimensions,
  probeHardwareCapabilities,
} from './utils/capabilities';
import {
  AudioChannelLevels,
  AudioSyncPipeline,
  CalibrationGeneratorHandle,
  computeCropRect,
  createAudioSyncPipeline,
  createCalibrationFeedGenerator,
  DualRecordingSession,
  startSynchronizedRecording,
} from './utils/dualRecorderEngine';
import {
  deleteCapturedMedia,
  getAllCapturedMedia,
  getStorageEstimate,
  saveCapturedMedia,
} from './utils/storage';
import {
  computeDualAutoFraming,
  DetectedFaceBox,
  detectFacesInVideo,
  smoothStepFrame,
} from './utils/faceTracker';
import { useBatteryStatus } from './utils/useBatteryStatus';

const INITIAL_CAPABILITIES: HardwareCapabilities = {
  videoDevices: [],
  audioDevices: [],
  sensorWidth: 0,
  sensorHeight: 0,
  sensorMaxWidth: 0,
  sensorMaxHeight: 0,
  sensorMaxFps: 30,
  supportedResolutions: { '720p': false, '1080p': false, '4k': false },
  supportedFps: { 24: false, 30: false, 60: false, 120: false },
  torchSupported: false,
  zoom: { supported: false, min: 1, max: 1, step: 0.1, current: 1 },
  focusMode: {
    supported: false,
    modes: [],
    manualDistance: { supported: false, min: 0, max: 1, step: 0.05, current: 0 },
    pointsOfInterestSupported: false,
  },
  exposure: {
    modeSupported: false,
    modes: [],
    compensation: { supported: false, min: -2, max: 2, step: 0.25, current: 0 },
  },
  whiteBalance: {
    modeSupported: false,
    modes: [],
    colorTemperature: { supported: false, min: 2800, max: 6500, step: 100, current: 5500 },
  },
  stabilizationSupported: false,
  backgroundBlurSupported: false,
  imageCaptureSupported: false,
  mediaRecorderPauseSupported: false,
  selectedVideoMimeType: 'video/webm',
  selectedVideoExtension: 'webm',
};

const DEFAULT_PORTRAIT_FRAME: CropFrameConfig = { panX: 0, panY: 0, zoom: 1 };
const DEFAULT_LANDSCAPE_FRAME: CropFrameConfig = { panX: 0, panY: 0, zoom: 1 };

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamsRef = useRef<MediaStream[]>([]);
  const calibrationRef = useRef<CalibrationGeneratorHandle | null>(null);
  const audioPipelineRef = useRef<AudioSyncPipeline | null>(null);
  const recordingSessionRef = useRef<DualRecordingSession | null>(null);
  const timelapseSessionRef = useRef<{
    stop: () => Promise<VideoTrackFile | null>;
  } | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [isCalibrationFeed, setIsCalibrationFeed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionStatusState>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<HardwareCapabilities>(INITIAL_CAPABILITIES);
  const [activeDeviceIdx, setActiveDeviceIdx] = useState(0);
  const [facingPreference, setFacingPreference] = useState<'environment' | 'user'>('environment');

  // Modes & capture preferences
  const [mode, setMode] = useState<CameraMode>('dual');
  const [resolution, setResolution] = useState<ResolutionPreset>('1080p');
  const [fps, setFps] = useState<FpsOption>(30);
  const [photoAspect, setPhotoAspect] = useState<PhotoAspectRatio>('4:3');
  const [timelapseIntervalSec, setTimelapseIntervalSec] = useState(1);
  const [burstCount, setBurstCount] = useState(10);

  // Dual independent framing configs + refs for real-time capture loop
  const [portraitFrame, setPortraitFrame] = useState<CropFrameConfig>(DEFAULT_PORTRAIT_FRAME);
  const [landscapeFrame, setLandscapeFrame] = useState<CropFrameConfig>(DEFAULT_LANDSCAPE_FRAME);
  const [activeDualTarget, setActiveDualTarget] = useState<'portrait' | 'landscape'>('portrait');
  const portraitFrameRef = useRef(portraitFrame);
  portraitFrameRef.current = portraitFrame;
  const landscapeFrameRef = useRef(landscapeFrame);
  landscapeFrameRef.current = landscapeFrame;

  // Quick bar states
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [gridType, setGridType] = useState<GridOverlayType>('thirds');
  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>('phone');
  const [selectedPhoneMicId, setSelectedPhoneMicId] = useState('');
  const [selectedExternalMicId, setSelectedExternalMicId] = useState('');
  const [phoneGain, setPhoneGain] = useState(1);
  const [externalGain, setExternalGain] = useState(1);
  const [dualMixWarning, setDualMixWarning] = useState<string | null>(null);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [uiSoundsMuted, setUiSoundsMuted] = useState(false);
  const [channelLevels, setChannelLevels] = useState<AudioChannelLevels>({
    master: 0,
    primary: 0,
    secondary: 0,
  });
  const [showHistogram, setShowHistogram] = useState(true);

  // Hardware optical states
  const [zoomValue, setZoomValue] = useState(1);
  const [focusMode, setFocusMode] = useState<'continuous' | 'manual'>('continuous');
  const [focusDistance, setFocusDistance] = useState(0.5);
  const [exposureEv, setExposureEv] = useState(0);
  const [whiteBalance, setWhiteBalance] = useState<WhiteBalancePreset>('auto');
  const [colorTemp, setColorTemp] = useState(5500);
  const [stabilizationEnabled, setStabilizationEnabled] = useState(false);

  // Recording / countdown / processing states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [timelapseFramesCount, setTimelapseFramesCount] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isBusyProcessing, setIsBusyProcessing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Storage & Gallery
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo>({
    quotaBytes: 0,
    usageBytes: 0,
    remainingBytes: 0,
    supported: false,
  });
  const [galleryItems, setGalleryItems] = useState<CapturedMediaItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [showDualPip, setShowDualPip] = useState(false);

  // Auto-Face Detection & Dual-Aspect Framing
  const [autoFrameFaces, setAutoFrameFaces] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFaceBox[]>([]);
  const [faceEngineLabel, setFaceEngineLabel] = useState('Chroma Subject Tracker');

  const batteryInfo = useBatteryStatus();
  const lastBatteryWarnRef = useRef<'none' | 'low' | 'critical'>('none');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const refreshStorageAndGallery = useCallback(async () => {
    try {
      const [est, items] = await Promise.all([getStorageEstimate(), getAllCapturedMedia()]);
      setStorageInfo(est);
      setGalleryItems(items);
    } catch {
      // Ignore storage refresh errors
    }
  }, []);

  useEffect(() => {
    refreshStorageAndGallery();
  }, [refreshStorageAndGallery]);

  // Latest thumbnail preview URL for Gallery button
  const latestThumbUrl = useMemo(() => {
    const first = galleryItems[0];
    if (!first) return null;
    if (first.photoBlob) return URL.createObjectURL(first.photoBlob);
    if (first.burstFrames?.[0]?.blob) return URL.createObjectURL(first.burstFrames[0].blob);
    return null;
  }, [galleryItems]);

  useEffect(() => {
    return () => {
      if (latestThumbUrl) URL.revokeObjectURL(latestThumbUrl);
    };
  }, [latestThumbUrl]);

  const stopStandaloneAudioStreams = useCallback(() => {
    audioStreamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    audioStreamsRef.current = [];
  }, []);

  const stopActiveStreams = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    stopStandaloneAudioStreams();
    if (calibrationRef.current) {
      calibrationRef.current.stop();
      calibrationRef.current = null;
    }
    if (audioPipelineRef.current) {
      audioPipelineRef.current.cleanup();
      audioPipelineRef.current = null;
    }
    setStreamActive(false);
  }, [stopStandaloneAudioStreams]);

  const assignDefaultMics = useCallback((devices: AudioInputDeviceInfo[]) => {
    if (devices.length === 0) return { phoneId: '', extId: '' };
    const builtIn = devices.find((d) => d.sourceKind === 'phone') ?? devices[0];
    const ext =
      devices.find((d) => d.sourceKind === 'external' && d.deviceId !== builtIn.deviceId) ??
      devices.find((d) => d.deviceId !== builtIn.deviceId) ??
      null;
    setSelectedPhoneMicId((prev) =>
      prev && devices.some((d) => d.deviceId === prev) ? prev : builtIn.deviceId
    );
    setSelectedExternalMicId((prev) =>
      prev && devices.some((d) => d.deviceId === prev) ? prev : ext?.deviceId ?? ''
    );
    return { phoneId: builtIn.deviceId, extId: ext?.deviceId ?? '' };
  }, []);

  const configureAudioRouting = useCallback(
    async (
      nextMode: AudioSourceMode,
      phoneId: string,
      extId: string,
      gains: { primary: number; secondary: number } = { primary: phoneGain, secondary: externalGain }
    ) => {
      setDualMixWarning(null);
      if (audioPipelineRef.current) {
        audioPipelineRef.current.cleanup();
        audioPipelineRef.current = null;
      }
      stopStandaloneAudioStreams();

      if (nextMode === 'muted') {
        audioPipelineRef.current = createAudioSyncPipeline(null);
        return;
      }

      const openAudioStream = async (deviceId: string): Promise<MediaStream | null> => {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        try {
          return await navigator.mediaDevices.getUserMedia({
            audio: deviceId
              ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
              : { echoCancellation: true, noiseSuppression: true },
            video: false,
          });
        } catch {
          return null;
        }
      };

      if (nextMode === 'phone') {
        const pStream = phoneId
          ? await openAudioStream(phoneId)
          : streamRef.current?.getAudioTracks().length
          ? streamRef.current
          : await openAudioStream('');
        if (pStream && pStream !== streamRef.current) {
          audioStreamsRef.current.push(pStream);
        }
        audioPipelineRef.current = createAudioSyncPipeline(pStream ?? streamRef.current, null, gains);
        return;
      }

      if (nextMode === 'external') {
        const eStream = await openAudioStream(extId);
        if (eStream) {
          audioStreamsRef.current.push(eStream);
          // Route external mic to secondary channel so externalGain controls its GainNode directly
          audioPipelineRef.current = createAudioSyncPipeline(null, eStream, gains);
        } else {
          setDualMixWarning('Unable to access selected external microphone; falling back to default mic.');
          audioPipelineRef.current = createAudioSyncPipeline(null, streamRef.current, gains);
        }
        return;
      }

      // nextMode === 'both': capture Phone Mic + External Mic simultaneously and mix via Web Audio API
      const [pStream, eStream] = await Promise.all([
        openAudioStream(phoneId),
        openAudioStream(extId),
      ]);
      if (pStream) audioStreamsRef.current.push(pStream);
      if (eStream) audioStreamsRef.current.push(eStream);

      if (pStream && eStream) {
        audioPipelineRef.current = createAudioSyncPipeline(pStream, eStream, gains);
      } else if (pStream || eStream) {
        setDualMixWarning(
          'Browser/OS only permitted one simultaneous microphone stream; recording with the available mic.'
        );
        audioPipelineRef.current = createAudioSyncPipeline(pStream ?? eStream, null, gains);
      } else {
        setDualMixWarning('Unable to open dual microphone streams.');
        audioPipelineRef.current = createAudioSyncPipeline(streamRef.current, null, gains);
      }
    },
    [phoneGain, externalGain, stopStandaloneAudioStreams]
  );

  const syncCapabilitiesAndAttach = useCallback(
    async (stream: MediaStream, calibrationMode: boolean) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const videoTrack = stream.getVideoTracks()[0] ?? null;
      const probed = await probeHardwareCapabilities(videoTrack, calibrationMode);
      setCapabilities(probed);
      const defaults = assignDefaultMics(probed.audioDevices);

      await configureAudioRouting(
        audioSourceMode,
        selectedPhoneMicId || defaults.phoneId,
        selectedExternalMicId || defaults.extId
      );

      setIsCalibrationFeed(calibrationMode);
      setStreamActive(true);
      setPermissionState(calibrationMode ? 'calibration' : 'granted');
      setErrorMessage(null);

      // Clamp selected resolution & FPS to hardware-supported values
      setResolution((prev) => {
        if (probed.supportedResolutions[prev]) return prev;
        if (probed.supportedResolutions['1080p']) return '1080p';
        return '720p';
      });
      setFps((prev) => {
        if (probed.supportedFps[prev]) return prev;
        if (probed.supportedFps[30]) return 30;
        return 24;
      });

      setZoomValue(probed.zoom.supported ? probed.zoom.current : 1);
      setFocusDistance(probed.focusMode.manualDistance.current || 0.5);
      setExposureEv(probed.exposure.compensation.current || 0);
      setColorTemp(probed.whiteBalance.colorTemperature.current || 5500);
      setTorchEnabled(false);
    },
    [assignDefaultMics, configureAudioRouting, audioSourceMode, selectedPhoneMicId, selectedExternalMicId]
  );

  const startPhysicalCamera = useCallback(
    async (opts?: { deviceId?: string; facing?: 'user' | 'environment'; targetRes?: ResolutionPreset; targetFps?: FpsOption }) => {
      stopActiveStreams();
      setPermissionState('checking');
      setErrorMessage(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState('no-hardware');
        setErrorMessage('Browser MediaDevices API is unavailable in this context.');
        return;
      }

      const resPreset = opts?.targetRes ?? resolution;
      const reqDims = getResolutionDimensions(resPreset, '16:9');
      const reqFps = opts?.targetFps ?? fps;

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: reqDims.width },
        height: { ideal: reqDims.height },
        frameRate: { ideal: reqFps },
      };

      if (opts?.deviceId) {
        videoConstraints.deviceId = { exact: opts.deviceId };
      } else {
        videoConstraints.facingMode = { ideal: opts?.facing ?? facingPreference };
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
        } catch {
          // Retry video-only if microphone permission/hardware fails
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
          showToast('Microphone unavailable; video-only capture active');
        }
        await syncCapabilitiesAndAttach(stream, false);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPermissionState('denied');
          setErrorMessage(
            'Camera permission was denied. Enable camera and microphone access in your browser site settings, then click Retry Camera Access.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
          setPermissionState('no-hardware');
          setErrorMessage(
            'No physical camera sensor was found on this device. You can connect a camera or launch the Optical Calibration Feed to test Dual Recording.'
          );
        } else {
          setPermissionState('no-hardware');
          setErrorMessage(err instanceof Error ? err.message : 'Unable to access camera hardware.');
        }
      }
    },
    [stopActiveStreams, resolution, fps, facingPreference, syncCapabilitiesAndAttach, showToast]
  );

  const launchCalibrationFeed = useCallback(async () => {
    stopActiveStreams();
    const cal = createCalibrationFeedGenerator();
    calibrationRef.current = cal;
    await syncCapabilitiesAndAttach(cal.stream, true);
  }, [stopActiveStreams, syncCapabilitiesAndAttach]);

  // Initial camera acquisition
  useEffect(() => {
    startPhysicalCamera();
    return () => {
      stopActiveStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-probe orientation changes cleanly
  useEffect(() => {
    const onOrientation = () => {
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        setCapabilities((prev) => ({
          ...prev,
          sensorWidth: videoRef.current?.videoWidth ?? prev.sensorWidth,
          sensorHeight: videoRef.current?.videoHeight ?? prev.sensorHeight,
        }));
      }
    };
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('resize', onOrientation);
    return () => {
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('resize', onOrientation);
    };
  }, []);

  // Hot-plug detection for external microphones & cameras
  const refreshAudioDeviceList = useCallback(async () => {
    const { videoDevices, audioDevices } = await enumerateCameraDevices();
    setCapabilities((prev) => ({ ...prev, videoDevices, audioDevices }));
    assignDefaultMics(audioDevices);
  }, [assignDefaultMics]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = () => {
      refreshAudioDeviceList();
    };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    };
  }, [refreshAudioDeviceList]);

  // Audio VU level meter loop (master + primary + secondary channels)
  useEffect(() => {
    if (!streamActive) return;
    let active = true;
    const tick = () => {
      if (!active) return;
      if (audioPipelineRef.current && audioSourceMode !== 'muted') {
        setChannelLevels(audioPipelineRef.current.getChannelLevels());
      } else {
        setChannelLevels({ master: 0, primary: 0, secondary: 0 });
      }
      setTimeout(tick, 90);
    };
    tick();
    return () => {
      active = false;
    };
  }, [streamActive, audioSourceMode]);

  // Recording duration timer loop
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const interval = setInterval(() => {
      setRecordingDurationMs((prev) => prev + 200);
    }, 200);
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Warn user immediately if battery drops to low/critical levels during active recording
  useEffect(() => {
    if (!isRecording || !batteryInfo.supported || batteryInfo.charging) {
      lastBatteryWarnRef.current = 'none';
      return;
    }
    if (batteryInfo.isCritical && lastBatteryWarnRef.current !== 'critical') {
      lastBatteryWarnRef.current = 'critical';
      showToast(`Critical battery (${batteryInfo.levelPct}%) — connect power immediately`);
    } else if (batteryInfo.isLow && lastBatteryWarnRef.current === 'none') {
      lastBatteryWarnRef.current = 'low';
      showToast(`Low battery (${batteryInfo.levelPct}%) during recording`);
    }
  }, [isRecording, batteryInfo, showToast]);

  // Automatic Face Detection & Dual-Aspect Framing loop (Dual Recording mode)
  useEffect(() => {
    if (!streamActive || mode !== 'dual' || !autoFrameFaces) {
      setDetectedFaces([]);
      return;
    }

    let active = true;
    let timerId = 0;

    const step = async () => {
      if (!active) return;
      const vid = videoRef.current;
      if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
        const res = await detectFacesInVideo(vid);
        if (!active) return;
        setDetectedFaces(res.faces);
        setFaceEngineLabel(
          res.engine === 'native-face-detector' ? 'FaceDetector API' : 'On-Device Subject Tracker'
        );

        const target = computeDualAutoFraming(res.faces, vid.videoWidth, vid.videoHeight);
        if (target) {
          setPortraitFrame((prev) => smoothStepFrame(prev, target.portraitTarget, 0.22));
          setLandscapeFrame((prev) => smoothStepFrame(prev, target.landscapeTarget, 0.22));
        }
      }
      if (active) {
        timerId = window.setTimeout(step, 95);
      }
    };

    step();
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [streamActive, mode, autoFrameFaces]);

  const handleManualPortraitFrameUpdate = useCallback(
    (updater: (prev: CropFrameConfig) => CropFrameConfig) => {
      setAutoFrameFaces(false);
      setPortraitFrame(updater);
    },
    []
  );

  const handleManualLandscapeFrameUpdate = useCallback(
    (updater: (prev: CropFrameConfig) => CropFrameConfig) => {
      setAutoFrameFaces(false);
      setLandscapeFrame(updater);
    },
    []
  );

  const handleToggleAutoFrame = useCallback(() => {
    setAutoFrameFaces((prev) => {
      const next = !prev;
      showToast(next ? 'Auto-Face Framing active for 9:16 & 16:9' : 'Auto-Face Framing paused');
      return next;
    });
  }, [showToast]);

  // Apply hardware track constraints safely
  const applyTrackConstraint = useCallback(
    async (advancedPatch: Record<string, unknown>) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || isCalibrationFeed) return false;
      try {
        await track.applyConstraints({
          advanced: [advancedPatch as MediaTrackConstraintSet],
        });
        return true;
      } catch {
        return false;
      }
    },
    [isCalibrationFeed]
  );

  const handleToggleTorch = async () => {
    if (!capabilities.torchSupported) return;
    const next = !torchEnabled;
    const ok = await applyTrackConstraint({ torch: next });
    if (ok) setTorchEnabled(next);
  };

  const handleZoomChange = async (nextZoom: number) => {
    setZoomValue(nextZoom);
    if (capabilities.zoom.supported) {
      await applyTrackConstraint({ zoom: nextZoom });
    }
  };

  const handleTapFocus = async (normX: number, normY: number) => {
    if (capabilities.focusMode.pointsOfInterestSupported) {
      const ok = await applyTrackConstraint({
        pointsOfInterest: [{ x: normX, y: normY }],
        focusMode: 'single-shot',
      });
      if (ok) {
        return { supported: true, message: 'AF Locked' };
      }
    }
    return {
      supported: false,
      message: capabilities.focusMode.supported ? 'Continuous AF' : 'Fixed Focus Sensor',
    };
  };

  const handleChangeFocusMode = async (m: 'continuous' | 'manual') => {
    setFocusMode(m);
    await applyTrackConstraint({ focusMode: m });
  };

  const handleChangeFocusDistance = async (val: number) => {
    setFocusDistance(val);
    setFocusMode('manual');
    await applyTrackConstraint({ focusMode: 'manual', focusDistance: val });
  };

  const handleChangeExposureEv = async (val: number) => {
    setExposureEv(val);
    await applyTrackConstraint({ exposureCompensation: val });
  };

  const handleChangeWhiteBalance = async (wb: WhiteBalancePreset) => {
    setWhiteBalance(wb);
    if (wb === 'auto') {
      await applyTrackConstraint({ whiteBalanceMode: 'continuous' });
    } else {
      const tempMap: Record<string, number> = {
        daylight: 5500,
        cloudy: 6500,
        tungsten: 3200,
        fluorescent: 4200,
        manual: colorTemp,
      };
      const targetTemp = tempMap[wb] ?? colorTemp;
      setColorTemp(targetTemp);
      await applyTrackConstraint({ whiteBalanceMode: 'manual', colorTemperature: targetTemp });
    }
  };

  const handleChangeColorTemp = async (k: number) => {
    setColorTemp(k);
    setWhiteBalance('manual');
    await applyTrackConstraint({ whiteBalanceMode: 'manual', colorTemperature: k });
  };

  const handleToggleStabilization = async () => {
    if (!capabilities.stabilizationSupported) return;
    const next = !stabilizationEnabled;
    const ok = await applyTrackConstraint({ opticalImageStabilization: next });
    if (ok) setStabilizationEnabled(next);
  };

  const handleSelectAudioMode = async (nextMode: AudioSourceMode) => {
    if (isRecording) return;
    setAudioSourceMode(nextMode);
    await configureAudioRouting(nextMode, selectedPhoneMicId, selectedExternalMicId);
  };

  const handleSelectPhoneMicId = async (id: string) => {
    setSelectedPhoneMicId(id);
    if (!isRecording && (audioSourceMode === 'phone' || audioSourceMode === 'both')) {
      await configureAudioRouting(audioSourceMode, id, selectedExternalMicId);
    }
  };

  const handleSelectExternalMicId = async (id: string) => {
    setSelectedExternalMicId(id);
    if (!isRecording && (audioSourceMode === 'external' || audioSourceMode === 'both')) {
      await configureAudioRouting(audioSourceMode, selectedPhoneMicId, id);
    }
  };

  const handleChangePhoneGain = (gain: number) => {
    setPhoneGain(gain);
    audioPipelineRef.current?.setMixGains(gain, externalGain);
  };

  const handleChangeExternalGain = (gain: number) => {
    setExternalGain(gain);
    audioPipelineRef.current?.setMixGains(phoneGain, gain);
  };

  const handleSwitchCamera = async () => {
    if (isRecording || isCalibrationFeed) return;
    if (capabilities.videoDevices.length > 1) {
      const nextIdx = (activeDeviceIdx + 1) % capabilities.videoDevices.length;
      setActiveDeviceIdx(nextIdx);
      const nextDev = capabilities.videoDevices[nextIdx];
      if (nextDev.facing === 'user' || nextDev.facing === 'environment') {
        setFacingPreference(nextDev.facing);
      }
      await startPhysicalCamera({ deviceId: nextDev.deviceId });
    } else {
      const nextFacing = facingPreference === 'environment' ? 'user' : 'environment';
      setFacingPreference(nextFacing);
      await startPhysicalCamera({ facing: nextFacing });
    }
  };

  const handleChangeResolution = async (nextRes: ResolutionPreset) => {
    if (!capabilities.supportedResolutions[nextRes] || isRecording) return;
    setResolution(nextRes);
    if (!isCalibrationFeed) {
      await startPhysicalCamera({
        deviceId: capabilities.videoDevices[activeDeviceIdx]?.deviceId,
        targetRes: nextRes,
        targetFps: fps,
      });
    }
  };

  const handleChangeFps = async (nextFps: FpsOption) => {
    if (!capabilities.supportedFps[nextFps] || isRecording) return;
    setFps(nextFps);
    if (!isCalibrationFeed) {
      await startPhysicalCamera({
        deviceId: capabilities.videoDevices[activeDeviceIdx]?.deviceId,
        targetRes: resolution,
        targetFps: nextFps,
      });
    }
  };

  const mirrorPreview = facingPreference === 'user' && !isCalibrationFeed;

  // Capture Single Photo (uses ImageCapture.takePhoto when available, else native video frame canvas)
  const captureStillBlob = useCallback(
    async (aspect: PhotoAspectRatio): Promise<{ blob: Blob; width: number; height: number } | null> => {
      const vid = videoRef.current;
      if (!vid || vid.videoWidth === 0 || vid.videoHeight === 0) return null;

      let sourceBitmap: ImageBitmap | HTMLVideoElement = vid;
      let srcW = vid.videoWidth;
      let srcH = vid.videoHeight;

      const track = streamRef.current?.getVideoTracks()[0];
      const ImageCaptureCtor = (
        window as unknown as {
          ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> };
        }
      ).ImageCapture;

      if (capabilities.imageCaptureSupported && track && ImageCaptureCtor) {
        try {
          const ic = new ImageCaptureCtor(track);
          const rawBlob = await ic.takePhoto();
          const bmp = await createImageBitmap(rawBlob);
          sourceBitmap = bmp;
          srcW = bmp.width;
          srcH = bmp.height;
        } catch {
          // Fallback cleanly to live video element frame
        }
      }

      const targetAspect =
        aspect === '9:16' ? 9 / 16 : aspect === '16:9' ? 16 / 9 : aspect === '1:1' ? 1 : 4 / 3;
      const rect = computeCropRect(srcW, srcH, targetAspect, { panX: 0, panY: 0, zoom: 1 });

      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.round(rect.sw);
      outCanvas.height = Math.round(rect.sh);
      const ctx = outCanvas.getContext('2d')!;
      if (mirrorPreview) {
        ctx.translate(outCanvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        sourceBitmap,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        0,
        0,
        outCanvas.width,
        outCanvas.height
      );

      if (sourceBitmap !== vid && 'close' in sourceBitmap) {
        sourceBitmap.close();
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        outCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.94)
      );
      if (!blob) return null;
      return { blob, width: outCanvas.width, height: outCanvas.height };
    },
    [capabilities.imageCaptureSupported, mirrorPreview]
  );

  // Execute Time-Lapse recording session
  const startTimelapseRecording = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || vid.videoWidth === 0) return;

    const dims = getResolutionDimensions(resolution, '16:9');
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const stream = canvas.captureStream(0);
    const canvasTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
      requestFrame?: () => void;
    };
    const chunks: BlobPart[] = [];
    const opts: MediaRecorderOptions = { videoBitsPerSecond: 8_000_000 };
    if (capabilities.selectedVideoMimeType && MediaRecorder.isTypeSupported(capabilities.selectedVideoMimeType)) {
      opts.mimeType = capabilities.selectedVideoMimeType;
    }
    const recorder = new MediaRecorder(stream, opts);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const captureFrame = () => {
      if (vid.readyState < 2) return;
      const rect = computeCropRect(vid.videoWidth, vid.videoHeight, 16 / 9, {
        panX: 0,
        panY: 0,
        zoom: 1,
      });
      ctx.save();
      if (mirrorPreview) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(vid, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (typeof canvasTrack.requestFrame === 'function') {
        canvasTrack.requestFrame();
      }
      setTimelapseFramesCount((c) => c + 1);
    };

    setTimelapseFramesCount(0);
    recorder.start(250);
    captureFrame();
    const timer = window.setInterval(captureFrame, timelapseIntervalSec * 1000);
    const startedAt = performance.now();

    timelapseSessionRef.current = {
      stop: () =>
        new Promise<VideoTrackFile | null>((resolve) => {
          window.clearInterval(timer);
          const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          recorder.onstop = () => {
            const blob = new Blob(chunks, {
              type: recorder.mimeType || capabilities.selectedVideoMimeType || 'video/webm',
            });
            resolve({
              blob,
              filename: `DualCam_${tag}_TimeLapse.${capabilities.selectedVideoExtension}`,
              mimeType: blob.type,
              width: dims.width,
              height: dims.height,
              aspectRatio: '16:9',
              sizeBytes: blob.size,
            });
          };
          if (recorder.state !== 'inactive') {
            recorder.stop();
          } else {
            resolve(null);
          }
          void startedAt;
        }),
    };

    setRecordingDurationMs(0);
    setIsRecording(true);
    setIsPaused(false);
    playRecordTone('start', uiSoundsMuted);
  }, [resolution, capabilities, mirrorPreview, timelapseIntervalSec, uiSoundsMuted]);

  const executeCaptureAction = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || !streamActive) return;

    // 1. Photo / Portrait Photo
    if (mode === 'photo' || mode === 'portrait-photo') {
      setIsBusyProcessing(true);
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 140);
      playShutterSound(uiSoundsMuted);

      const captured = await captureStillBlob(photoAspect);
      if (captured) {
        const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const item: CapturedMediaItem = {
          id: `photo_${Date.now()}`,
          createdAt: Date.now(),
          kind: 'photo',
          resolutionLabel: `${captured.width}×${captured.height}`,
          photoBlob: captured.blob,
          photoFilename: `DualCam_${tag}_${photoAspect.replace(':', 'x')}.jpg`,
          photoWidth: captured.width,
          photoHeight: captured.height,
          photoAspectRatio: photoAspect,
        };
        await saveCapturedMedia(item);
        await refreshStorageAndGallery();
        showToast(
          mode === 'portrait-photo' && !capabilities.backgroundBlurSupported
            ? 'Photo saved (Hardware depth bokeh requires native Camera API)'
            : 'Photo saved to Gallery'
        );
      }
      setIsBusyProcessing(false);
      return;
    }

    // 2. Burst Photography
    if (mode === 'burst') {
      setIsBusyProcessing(true);
      const frames: { blob: Blob; filename: string; width: number; height: number }[] = [];
      const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      for (let i = 0; i < burstCount; i++) {
        playShutterSound(uiSoundsMuted);
        const targetAspect =
          photoAspect === '9:16'
            ? 9 / 16
            : photoAspect === '16:9'
            ? 16 / 9
            : photoAspect === '1:1'
            ? 1
            : 4 / 3;
        const rect = computeCropRect(vid.videoWidth, vid.videoHeight, targetAspect, {
          panX: 0,
          panY: 0,
          zoom: 1,
        });
        const c = document.createElement('canvas');
        c.width = Math.round(rect.sw);
        c.height = Math.round(rect.sh);
        const ctx = c.getContext('2d')!;
        if (mirrorPreview) {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(vid, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, c.width, c.height);
        const blob = await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.9));
        if (blob) {
          frames.push({
            blob,
            filename: `DualCam_${tag}_Burst_${i + 1}.jpg`,
            width: c.width,
            height: c.height,
          });
        }
        await new Promise((r) => setTimeout(r, 90));
      }
      if (frames.length > 0) {
        await saveCapturedMedia({
          id: `burst_${Date.now()}`,
          createdAt: Date.now(),
          kind: 'burst',
          resolutionLabel: `${frames[0].width}×${frames[0].height}`,
          burstFrames: frames,
        });
        await refreshStorageAndGallery();
        showToast(`Saved ${frames.length}-frame Burst sequence`);
      }
      setIsBusyProcessing(false);
      return;
    }

    // 3. Time-Lapse Start
    if (mode === 'timelapse') {
      startTimelapseRecording();
      return;
    }

    // 4. Dual, Portrait, Landscape, or Slow-Mo Video Start
    const recMode: 'dual' | 'portrait' | 'landscape' =
      mode === 'portrait' ? 'portrait' : mode === 'landscape' || mode === 'slowmo' ? 'landscape' : 'dual';

    const portraitDims = getResolutionDimensions(resolution, '9:16');
    const landscapeDims = getResolutionDimensions(resolution, '16:9');

    if (!audioPipelineRef.current) {
      audioPipelineRef.current = createAudioSyncPipeline(streamRef.current);
    }

    const session = startSynchronizedRecording({
      mode: recMode,
      videoEl: vid,
      portraitDims,
      landscapeDims,
      fps,
      mimeType: capabilities.selectedVideoMimeType,
      extension: capabilities.selectedVideoExtension,
      getPortraitFrame: () => portraitFrameRef.current,
      getLandscapeFrame: () => landscapeFrameRef.current,
      audioPipeline: audioPipelineRef.current,
      includeAudio: audioSourceMode !== 'muted',
      mirrorHorizontal: mirrorPreview,
    });

    recordingSessionRef.current = session;
    setRecordingDurationMs(0);
    setIsRecording(true);
    setIsPaused(false);
    playRecordTone('start', uiSoundsMuted);
  }, [
    streamActive,
    mode,
    uiSoundsMuted,
    captureStillBlob,
    photoAspect,
    refreshStorageAndGallery,
    showToast,
    capabilities,
    burstCount,
    mirrorPreview,
    startTimelapseRecording,
    resolution,
    fps,
    audioSourceMode,
  ]);

  const stopActiveRecording = useCallback(async () => {
    setIsBusyProcessing(true);
    playRecordTone('stop', uiSoundsMuted);

    if (mode === 'timelapse' && timelapseSessionRef.current) {
      const videoFile = await timelapseSessionRef.current.stop();
      timelapseSessionRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      if (videoFile) {
        await saveCapturedMedia({
          id: `timelapse_${Date.now()}`,
          createdAt: Date.now(),
          kind: 'timelapse',
          durationMs: recordingDurationMs,
          resolutionLabel: `${videoFile.width}×${videoFile.height}`,
          singleVideo: videoFile,
        });
        await refreshStorageAndGallery();
        showToast('Time-Lapse video saved to Gallery');
      }
      setIsBusyProcessing(false);
      return;
    }

    if (recordingSessionRef.current) {
      const result = await recordingSessionRef.current.stop();
      recordingSessionRef.current = null;
      setIsRecording(false);
      setIsPaused(false);

      if (result.portraitVideo && result.landscapeVideo) {
        await saveCapturedMedia({
          id: `dual_${Date.now()}`,
          createdAt: Date.now(),
          kind: 'dual-video',
          durationMs: result.durationMs,
          fps,
          hasAudio: audioSourceMode !== 'muted',
          resolutionLabel: `${resolution.toUpperCase()} · ${fps}fps`,
          portraitVideo: result.portraitVideo,
          landscapeVideo: result.landscapeVideo,
        });
        await refreshStorageAndGallery();
        showToast('Saved synchronized Portrait (9:16) & Landscape (16:9) files');
      } else if (result.singleVideo) {
        await saveCapturedMedia({
          id: `vid_${Date.now()}`,
          createdAt: Date.now(),
          kind: mode === 'slowmo' ? 'slowmo' : 'single-video',
          durationMs: result.durationMs,
          fps,
          hasAudio: audioSourceMode !== 'muted',
          resolutionLabel: `${result.singleVideo.width}×${result.singleVideo.height} · ${fps}fps`,
          singleVideo: result.singleVideo,
        });
        await refreshStorageAndGallery();
        showToast('Video saved to Gallery');
      }
    }
    setIsBusyProcessing(false);
  }, [
    uiSoundsMuted,
    mode,
    recordingDurationMs,
    refreshStorageAndGallery,
    showToast,
    fps,
    audioSourceMode,
    resolution,
  ]);

  const handlePrimaryAction = () => {
    if (!streamActive) return;
    if (isRecording) {
      stopActiveRecording();
      return;
    }
    if (timerSeconds > 0) {
      let remaining = timerSeconds;
      setCountdownSeconds(remaining);
      playTimerBeep(false, uiSoundsMuted);
      const id = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearInterval(id);
          setCountdownSeconds(null);
          playTimerBeep(true, uiSoundsMuted);
          executeCaptureAction();
        } else {
          setCountdownSeconds(remaining);
          playTimerBeep(false, uiSoundsMuted);
        }
      }, 1000);
      return;
    }
    executeCaptureAction();
  };

  const handleTogglePause = () => {
    if (!recordingSessionRef.current || !capabilities.mediaRecorderPauseSupported) return;
    if (isPaused) {
      recordingSessionRef.current.resume();
      setIsPaused(false);
    } else {
      recordingSessionRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleDeleteGalleryItem = async (id: string) => {
    await deleteCapturedMedia(id);
    await refreshStorageAndGallery();
  };

  const cycleTimer = () => {
    const order: TimerSeconds[] = [0, 3, 5, 10];
    setTimerSeconds(order[(order.indexOf(timerSeconds) + 1) % order.length]);
  };

  const cycleGrid = () => {
    const order: GridOverlayType[] = ['off', 'thirds', 'golden', 'crosshair'];
    setGridType(order[(order.indexOf(gridType) + 1) % order.length]);
  };

  const canSwitchCamera = !isCalibrationFeed && capabilities.videoDevices.length > 1;

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#09090B] text-zinc-100 overflow-hidden">
      {/* Top Optical & Telemetry Bar */}
      <TopBar
        torchEnabled={torchEnabled}
        onToggleTorch={handleToggleTorch}
        timerSeconds={timerSeconds}
        onCycleTimer={cycleTimer}
        gridType={gridType}
        onCycleGrid={cycleGrid}
        audioSourceMode={audioSourceMode}
        onOpenAudioModal={() => setAudioModalOpen(true)}
        audioLevel={channelLevels.master}
        uiSoundsMuted={uiSoundsMuted}
        onToggleUiSounds={() => setUiSoundsMuted((v) => !v)}
        capabilities={capabilities}
        storageInfo={storageInfo}
        batteryInfo={batteryInfo}
        isRecording={isRecording}
        showHistogram={showHistogram}
        onToggleHistogram={() => setShowHistogram((v) => !v)}
        onOpenCapabilities={() => setCapabilitiesOpen(true)}
        onOpenMobileControls={() => setMobileControlsOpen(true)}
      />

      {/* Main Viewfinder + Pro Workstation Side Panel */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 relative flex flex-col">
          {/* Low / Critical Battery Warning Banner during Active Recording */}
          {isRecording && batteryInfo.supported && batteryInfo.isLow && (
            <div
              role="status"
              className={`border-b px-4 py-2 text-xs flex items-center gap-2 shrink-0 ${
                batteryInfo.isCritical
                  ? 'bg-red-500/20 border-red-500/40 text-red-200'
                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
              }`}
            >
              <BatteryWarning className="w-4 h-4 shrink-0" />
              <span className="font-medium">
                {batteryInfo.isCritical
                  ? `Critical Battery (${batteryInfo.levelPct}%): Connect a charger or stop and save your recording soon.`
                  : `Low Battery (${batteryInfo.levelPct}%): Connect power to prevent unexpected recording interruption.`}
              </span>
            </div>
          )}

          {/* Portrait Depth / Slow-Mo Native API Disclosure Banner */}
          {mode === 'portrait-photo' && !capabilities.backgroundBlurSupported && (
            <div className="bg-zinc-900/95 border-b border-white/10 px-4 py-2 text-xs text-zinc-300 flex items-center justify-between gap-2 shrink-0">
              <span>
                True optical depth-map bokeh requires native Camera APIs (AVFoundation / Camera2). Standard still capture remains active.
              </span>
            </div>
          )}
          {mode === 'slowmo' && !capabilities.supportedFps[60] && (
            <div className="bg-zinc-900/95 border-b border-white/10 px-4 py-2 text-xs text-zinc-300 flex items-center justify-between gap-2 shrink-0">
              <span>
                Active browser sensor maxes at {capabilities.sensorMaxFps} FPS; 120/240 FPS high-speed readout requires native Camera APIs.
              </span>
            </div>
          )}

          {/* Viewfinder Viewport */}
          <div className="flex-1 min-h-0 relative">
            <Viewfinder
              videoRef={videoRef}
              mode={mode}
              streamActive={streamActive}
              permissionState={permissionState}
              errorMessage={errorMessage}
              isCalibrationFeed={isCalibrationFeed}
              mirrorPreview={mirrorPreview}
              gridType={gridType}
              photoAspect={photoAspect}
              portraitFrame={portraitFrame}
              landscapeFrame={landscapeFrame}
              activeDualTarget={activeDualTarget}
              onSelectDualTarget={setActiveDualTarget}
              onUpdatePortraitFrame={handleManualPortraitFrameUpdate}
              onUpdateLandscapeFrame={handleManualLandscapeFrameUpdate}
              capabilities={capabilities}
              zoomValue={zoomValue}
              onZoomChange={handleZoomChange}
              onTapFocus={handleTapFocus}
              onRequestCamera={() => startPhysicalCamera()}
              onLaunchCalibration={launchCalibrationFeed}
              countdownSeconds={countdownSeconds}
              isRecording={isRecording}
              isPaused={isPaused}
              recordingDurationMs={recordingDurationMs}
              timelapseFramesCount={timelapseFramesCount}
              showDualPip={showDualPip}
              onToggleDualPip={() => setShowDualPip((v) => !v)}
              showHistogram={showHistogram}
              autoFrameFaces={autoFrameFaces}
              onToggleAutoFrame={handleToggleAutoFrame}
              detectedFaces={detectedFaces}
            />

            {/* Mobile Optional Floating Dual Split Preview */}
            {showDualPip && streamActive && mode === 'dual' && (
              <div className="lg:hidden absolute top-3 right-3 z-30 w-56 bg-zinc-950/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-xl">
                <DualLiveMonitors
                  videoEl={videoRef.current}
                  streamActive={streamActive}
                  portraitFrame={portraitFrame}
                  landscapeFrame={landscapeFrame}
                  activeTarget={activeDualTarget}
                  onSelectTarget={setActiveDualTarget}
                  mirrorHorizontal={mirrorPreview}
                />
              </div>
            )}

            {/* Shutter Flash Feedback */}
            {shutterFlash && (
              <div className="pointer-events-none absolute inset-0 bg-white/80 z-40" />
            )}

            {/* Non-intrusive Action Toast */}
            {toastMsg && (
              <div className="pointer-events-none absolute bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-zinc-900/95 border border-white/15 text-xs font-medium text-zinc-100 shadow-lg whitespace-nowrap">
                {toastMsg}
              </div>
            )}
          </div>
        </main>

        {/* Desktop Side Workstation Panel / Mobile Bottom Sheet */}
        <ProControlsPanel
          videoEl={videoRef.current}
          streamActive={streamActive}
          mode={mode}
          portraitFrame={portraitFrame}
          landscapeFrame={landscapeFrame}
          activeDualTarget={activeDualTarget}
          onSelectDualTarget={setActiveDualTarget}
          onUpdatePortraitFrame={handleManualPortraitFrameUpdate}
          onUpdateLandscapeFrame={handleManualLandscapeFrameUpdate}
          onResetFraming={() => {
            setAutoFrameFaces(false);
            setPortraitFrame(DEFAULT_PORTRAIT_FRAME);
            setLandscapeFrame(DEFAULT_LANDSCAPE_FRAME);
          }}
          autoFrameFaces={autoFrameFaces}
          onToggleAutoFrame={handleToggleAutoFrame}
          detectedFaceCount={detectedFaces.length}
          faceEngineLabel={faceEngineLabel}
          resolution={resolution}
          onChangeResolution={handleChangeResolution}
          fps={fps}
          onChangeFps={handleChangeFps}
          capabilities={capabilities}
          isRecording={isRecording}
          mirrorPreview={mirrorPreview}
          focusMode={focusMode}
          onChangeFocusMode={handleChangeFocusMode}
          focusDistance={focusDistance}
          onChangeFocusDistance={handleChangeFocusDistance}
          exposureEv={exposureEv}
          onChangeExposureEv={handleChangeExposureEv}
          whiteBalance={whiteBalance}
          onChangeWhiteBalance={handleChangeWhiteBalance}
          colorTemp={colorTemp}
          onChangeColorTemp={handleChangeColorTemp}
          zoomValue={zoomValue}
          onZoomChange={handleZoomChange}
          stabilizationEnabled={stabilizationEnabled}
          onToggleStabilization={handleToggleStabilization}
          photoAspect={photoAspect}
          onChangePhotoAspect={setPhotoAspect}
          timelapseIntervalSec={timelapseIntervalSec}
          onChangeTimelapseInterval={setTimelapseIntervalSec}
          burstCount={burstCount}
          onChangeBurstCount={setBurstCount}
          mobileOpen={mobileControlsOpen}
          onCloseMobile={() => setMobileControlsOpen(false)}
        />
      </div>

      {/* Bottom Mode Switcher & Shutter Dock */}
      <BottomDock
        mode={mode}
        onChangeMode={setMode}
        isRecording={isRecording}
        isPaused={isPaused}
        onPrimaryAction={handlePrimaryAction}
        onTogglePause={handleTogglePause}
        onSwitchCamera={handleSwitchCamera}
        onOpenGallery={() => setGalleryOpen(true)}
        galleryCount={galleryItems.length}
        latestThumbUrl={latestThumbUrl}
        capabilities={capabilities}
        zoomValue={zoomValue}
        onZoomChange={handleZoomChange}
        canSwitchCamera={canSwitchCamera}
        isBusyProcessing={isBusyProcessing}
      />

      {/* Synchronized Dual Playback & Media Gallery Modal */}
      <GalleryModal
        open={galleryOpen}
        items={galleryItems}
        onClose={() => setGalleryOpen(false)}
        onDelete={handleDeleteGalleryItem}
      />

      {/* Hardware Capabilities & Native API Distinction Modal */}
      <CapabilitiesModal
        open={capabilitiesOpen}
        onClose={() => setCapabilitiesOpen(false)}
        capabilities={capabilities}
        storageInfo={storageInfo}
        isCalibrationFeed={isCalibrationFeed}
      />

      {/* Audio Input Routing Modal (Phone Mic / External Mic / Both / Mute) */}
      <AudioSourceModal
        open={audioModalOpen}
        onClose={() => setAudioModalOpen(false)}
        audioDevices={capabilities.audioDevices}
        audioSourceMode={audioSourceMode}
        onSelectMode={handleSelectAudioMode}
        selectedPhoneMicId={selectedPhoneMicId}
        onSelectPhoneMicId={handleSelectPhoneMicId}
        selectedExternalMicId={selectedExternalMicId}
        onSelectExternalMicId={handleSelectExternalMicId}
        phoneGain={phoneGain}
        onChangePhoneGain={handleChangePhoneGain}
        externalGain={externalGain}
        onChangeExternalGain={handleChangeExternalGain}
        channelLevels={channelLevels}
        isRecording={isRecording}
        onRefreshDevices={refreshAudioDeviceList}
        dualMixWarning={dualMixWarning}
      />
    </div>
  );
}
