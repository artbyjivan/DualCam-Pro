import React, { useEffect, useRef } from 'react';
import { CropFrameConfig } from '../types/camera';
import { computeCropRect } from '../utils/dualRecorderEngine';

interface DualLiveMonitorsProps {
  videoEl: HTMLVideoElement | null;
  streamActive: boolean;
  portraitFrame: CropFrameConfig;
  landscapeFrame: CropFrameConfig;
  activeTarget: 'portrait' | 'landscape';
  onSelectTarget: (target: 'portrait' | 'landscape') => void;
  mirrorHorizontal?: boolean;
}

export const DualLiveMonitors: React.FC<DualLiveMonitorsProps> = ({
  videoEl,
  streamActive,
  portraitFrame,
  landscapeFrame,
  activeTarget,
  onSelectTarget,
  mirrorHorizontal = false,
}) => {
  const portraitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landscapeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const portraitFrameRef = useRef(portraitFrame);
  portraitFrameRef.current = portraitFrame;

  const landscapeFrameRef = useRef(landscapeFrame);
  landscapeFrameRef.current = landscapeFrame;

  const mirrorRef = useRef(mirrorHorizontal);
  mirrorRef.current = mirrorHorizontal;

  useEffect(() => {
    if (!streamActive || !videoEl) return;
    let active = true;
    let rafId = 0;

    const renderPreviews = () => {
      if (!active) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        const srcW = videoEl.videoWidth;
        const srcH = videoEl.videoHeight;

        const pCanvas = portraitCanvasRef.current;
        if (pCanvas) {
          const pCtx = pCanvas.getContext('2d', { alpha: false });
          if (pCtx) {
            const rect = computeCropRect(srcW, srcH, 9 / 16, portraitFrameRef.current);
            pCtx.save();
            if (mirrorRef.current) {
              pCtx.translate(pCanvas.width, 0);
              pCtx.scale(-1, 1);
            }
            pCtx.drawImage(videoEl, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, pCanvas.width, pCanvas.height);
            pCtx.restore();
          }
        }

        const lCanvas = landscapeCanvasRef.current;
        if (lCanvas) {
          const lCtx = lCanvas.getContext('2d', { alpha: false });
          if (lCtx) {
            const rect = computeCropRect(srcW, srcH, 16 / 9, landscapeFrameRef.current);
            lCtx.save();
            if (mirrorRef.current) {
              lCtx.translate(lCanvas.width, 0);
              lCtx.scale(-1, 1);
            }
            lCtx.drawImage(videoEl, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, lCanvas.width, lCanvas.height);
            lCtx.restore();
          }
        }
      }
      rafId = requestAnimationFrame(renderPreviews);
    };

    renderPreviews();
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [streamActive, videoEl]);

  return (
    <div className="grid grid-cols-2 gap-3 items-center">
      <button
        type="button"
        onClick={() => onSelectTarget('portrait')}
        className={`group flex flex-col items-center gap-2 p-2.5 rounded-xl border transition-colors text-left ${
          activeTarget === 'portrait'
            ? 'bg-amber-500/10 border-amber-500/60'
            : 'bg-zinc-900/70 border-white/10 hover:border-white/25'
        }`}
      >
        <div className="w-full flex items-center justify-between text-xs">
          <span className="font-semibold text-amber-400">Portrait</span>
          <span className="font-mono tabular-nums text-zinc-400">9:16</span>
        </div>
        <div className="h-28 aspect-[9/16] bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
          <canvas
            ref={portraitCanvasRef}
            width={180}
            height={320}
            className="w-full h-full object-cover"
          />
        </div>
      </button>

      <button
        type="button"
        onClick={() => onSelectTarget('landscape')}
        className={`group flex flex-col items-center gap-2 p-2.5 rounded-xl border transition-colors text-left ${
          activeTarget === 'landscape'
            ? 'bg-sky-400/10 border-sky-400/60'
            : 'bg-zinc-900/70 border-white/10 hover:border-white/25'
        }`}
      >
        <div className="w-full flex items-center justify-between text-xs">
          <span className="font-semibold text-sky-400">Landscape</span>
          <span className="font-mono tabular-nums text-zinc-400">16:9</span>
        </div>
        <div className="w-full aspect-[16/9] my-auto bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
          <canvas
            ref={landscapeCanvasRef}
            width={320}
            height={180}
            className="w-full h-full object-cover"
          />
        </div>
      </button>
    </div>
  );
};
