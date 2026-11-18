import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Film,
  Image as ImageIcon,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { CapturedMediaItem } from '../types/camera';
import { formatBytes, triggerBlobDownload } from '../utils/storage';

interface GalleryModalProps {
  open: boolean;
  items: CapturedMediaItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '00:00';
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  open,
  items,
  onClose,
  onDelete,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [burstIdx, setBurstIdx] = useState(0);
  const [dualPlaying, setDualPlaying] = useState(false);

  const portraitVideoRef = useRef<HTMLVideoElement | null>(null);
  const landscapeVideoRef = useRef<HTMLVideoElement | null>(null);

  const selectedItem = useMemo(() => {
    if (!items.length) return null;
    return items.find((i) => i.id === selectedId) ?? items[0];
  }, [items, selectedId]);

  useEffect(() => {
    setBurstIdx(0);
    setDualPlaying(false);
  }, [selectedItem?.id]);

  // Create & revoke object URLs cleanly for the active item
  const objectUrls = useMemo(() => {
    if (!selectedItem) return {};
    const urls: {
      portrait?: string;
      landscape?: string;
      single?: string;
      photo?: string;
      burst?: string[];
    } = {};
    if (selectedItem.portraitVideo) {
      urls.portrait = URL.createObjectURL(selectedItem.portraitVideo.blob);
    }
    if (selectedItem.landscapeVideo) {
      urls.landscape = URL.createObjectURL(selectedItem.landscapeVideo.blob);
    }
    if (selectedItem.singleVideo) {
      urls.single = URL.createObjectURL(selectedItem.singleVideo.blob);
    }
    if (selectedItem.photoBlob) {
      urls.photo = URL.createObjectURL(selectedItem.photoBlob);
    }
    if (selectedItem.burstFrames?.length) {
      urls.burst = selectedItem.burstFrames.map((f) => URL.createObjectURL(f.blob));
    }
    return urls;
  }, [selectedItem]);

  useEffect(() => {
    return () => {
      if (objectUrls.portrait) URL.revokeObjectURL(objectUrls.portrait);
      if (objectUrls.landscape) URL.revokeObjectURL(objectUrls.landscape);
      if (objectUrls.single) URL.revokeObjectURL(objectUrls.single);
      if (objectUrls.photo) URL.revokeObjectURL(objectUrls.photo);
      objectUrls.burst?.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [objectUrls]);

  if (!open) return null;

  const toggleDualSyncPlayback = () => {
    const p = portraitVideoRef.current;
    const l = landscapeVideoRef.current;
    if (!p || !l) return;
    if (dualPlaying) {
      p.pause();
      l.pause();
      setDualPlaying(false);
    } else {
      if (Math.abs(p.currentTime - l.currentTime) > 0.15) {
        l.currentTime = p.currentTime;
      }
      Promise.all([p.play(), l.play()])
        .then(() => setDualPlaying(true))
        .catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl h-[90vh] bg-zinc-950 border border-white/15 rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 px-4 sm:px-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">Captured Media Studio</h2>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              {items.length} {items.length === 1 ? 'capture' : 'captures'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500">
              <Film className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-zinc-200">No captures saved yet</p>
            <p className="text-xs text-zinc-500 max-w-sm">
              Record a Dual 9:16 + 16:9 video, Portrait, Landscape, Time-Lapse, or Photo to inspect and download separate output files here.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {/* Sidebar Capture List */}
            <aside className="lg:w-72 border-b lg:border-b-0 lg:border-r border-white/10 overflow-x-auto lg:overflow-y-auto shrink-0 flex lg:flex-col gap-2 p-3">
              {items.map((item) => {
                const active = selectedItem?.id === item.id;
                const kindLabel =
                  item.kind === 'dual-video'
                    ? 'Dual 9:16 + 16:9'
                    : item.kind === 'single-video'
                    ? `Video ${item.singleVideo?.aspectRatio ?? ''}`
                    : item.kind === 'timelapse'
                    ? 'Time-Lapse'
                    : item.kind === 'slowmo'
                    ? 'Slow-Mo'
                    : item.kind === 'burst'
                    ? `Burst (${item.burstFrames?.length ?? 0})`
                    : `Photo ${item.photoAspectRatio ?? ''}`;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`min-w-[180px] lg:min-w-0 w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                      active
                        ? 'bg-zinc-900 border-amber-500/60'
                        : 'bg-zinc-900/40 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-300">
                      {item.kind === 'photo' || item.kind === 'burst' ? (
                        <ImageIcon className="w-4 h-4" />
                      ) : (
                        <Film className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{kindLabel}</p>
                      <p className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5 truncate">
                        {item.resolutionLabel}
                        {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </aside>

            {/* Main Inspector & Dual Synchronized Playback */}
            {selectedItem && (
              <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto gap-5">
                {/* Dual Video Side-by-Side Synchronized View */}
                {selectedItem.kind === 'dual-video' &&
                  selectedItem.portraitVideo &&
                  selectedItem.landscapeVideo && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-full flex items-center justify-between text-xs">
                            <span className="font-semibold text-amber-400">
                              Portrait Output (9:16)
                            </span>
                            <span className="font-mono tabular-nums text-zinc-400">
                              {selectedItem.portraitVideo.width}×{selectedItem.portraitVideo.height} ·{' '}
                              {formatBytes(selectedItem.portraitVideo.sizeBytes)}
                            </span>
                          </div>
                          <div className="h-[320px] aspect-[9/16] bg-black rounded-xl overflow-hidden border border-white/10">
                            <video
                              ref={portraitVideoRef}
                              src={objectUrls.portrait}
                              controls
                              playsInline
                              onEnded={() => setDualPlaying(false)}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                          <div className="w-full flex items-center justify-between text-xs">
                            <span className="font-semibold text-sky-400">
                              Landscape Output (16:9)
                            </span>
                            <span className="font-mono tabular-nums text-zinc-400">
                              {selectedItem.landscapeVideo.width}×
                              {selectedItem.landscapeVideo.height} ·{' '}
                              {formatBytes(selectedItem.landscapeVideo.sizeBytes)}
                            </span>
                          </div>
                          <div className="w-full aspect-[16/9] bg-black rounded-xl overflow-hidden border border-white/10">
                            <video
                              ref={landscapeVideoRef}
                              src={objectUrls.landscape}
                              controls
                              playsInline
                              muted
                              onEnded={() => setDualPlaying(false)}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            Both files contain synchronized audio tracks; preview mutes secondary track to prevent echo.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={toggleDualSyncPlayback}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap"
                          >
                            {dualPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            <span>{dualPlaying ? 'Pause Sync Playback' : 'Play Both Synchronized'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              selectedItem.portraitVideo &&
                              triggerBlobDownload(
                                selectedItem.portraitVideo.blob,
                                selectedItem.portraitVideo.filename
                              )
                            }
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-100 flex items-center gap-2 whitespace-nowrap"
                          >
                            <Download className="w-4 h-4 text-amber-400" />
                            <span>Save Portrait 9:16</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              selectedItem.landscapeVideo &&
                              triggerBlobDownload(
                                selectedItem.landscapeVideo.blob,
                                selectedItem.landscapeVideo.filename
                              )
                            }
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-100 flex items-center gap-2 whitespace-nowrap"
                          >
                            <Download className="w-4 h-4 text-sky-400" />
                            <span>Save Landscape 16:9</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => onDelete(selectedItem.id)}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Pair</span>
                        </button>
                      </div>
                    </>
                  )}

                {/* Single Video / Time-Lapse / Slow-Mo */}
                {selectedItem.singleVideo && objectUrls.single && (
                  <>
                    <div className="flex-1 min-h-[300px] bg-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center p-2">
                      <video
                        src={objectUrls.single}
                        controls
                        playsInline
                        className="max-h-[460px] max-w-full rounded-lg"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-400">
                        <span>
                          {selectedItem.singleVideo.width}×{selectedItem.singleVideo.height}
                        </span>
                        <span>·</span>
                        <span>{formatBytes(selectedItem.singleVideo.sizeBytes)}</span>
                        {selectedItem.durationMs && (
                          <>
                            <span>·</span>
                            <span>{formatDuration(selectedItem.durationMs)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            selectedItem.singleVideo &&
                            triggerBlobDownload(
                              selectedItem.singleVideo.blob,
                              selectedItem.singleVideo.filename
                            )
                          }
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Video</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(selectedItem.id)}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Single Photo */}
                {selectedItem.kind === 'photo' && objectUrls.photo && (
                  <>
                    <div className="flex-1 min-h-[300px] bg-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center p-2">
                      <img
                        src={objectUrls.photo}
                        alt="Captured photo"
                        className="max-h-[460px] max-w-full object-contain rounded-lg"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-400">
                        <span>
                          {selectedItem.photoWidth}×{selectedItem.photoHeight}
                        </span>
                        <span>·</span>
                        <span>{selectedItem.photoAspectRatio}</span>
                        {selectedItem.photoBlob && (
                          <>
                            <span>·</span>
                            <span>{formatBytes(selectedItem.photoBlob.size)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            selectedItem.photoBlob &&
                            triggerBlobDownload(
                              selectedItem.photoBlob,
                              selectedItem.photoFilename || 'photo.jpg'
                            )
                          }
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(selectedItem.id)}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Burst Sequence Viewer */}
                {selectedItem.kind === 'burst' &&
                  selectedItem.burstFrames &&
                  objectUrls.burst && (
                    <>
                      <div className="flex-1 min-h-[280px] bg-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center p-2">
                        <img
                          src={objectUrls.burst[burstIdx]}
                          alt={`Burst frame ${burstIdx + 1}`}
                          className="max-h-[400px] max-w-full object-contain rounded-lg"
                        />
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {objectUrls.burst.map((url, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setBurstIdx(idx)}
                            className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${
                              burstIdx === idx ? 'border-amber-400' : 'border-white/10 opacity-65'
                            }`}
                          >
                            <img src={url} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-mono tabular-nums text-zinc-400">
                          Frame {burstIdx + 1} / {selectedItem.burstFrames.length}
                        </span>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              const frame = selectedItem.burstFrames?.[burstIdx];
                              if (frame) triggerBlobDownload(frame.blob, frame.filename);
                            }}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Save Frame {burstIdx + 1}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(selectedItem.id)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Burst</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
