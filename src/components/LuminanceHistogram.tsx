import React, { useEffect, useRef, useState } from 'react';

interface LuminanceHistogramProps {
  videoEl: HTMLVideoElement | null;
  streamActive: boolean;
}

const SAMPLE_W = 128;
const SAMPLE_H = 72;
const BINS = 64;

export const LuminanceHistogram: React.FC<LuminanceHistogramProps> = ({
  videoEl,
  streamActive,
}) => {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState({
    meanIre: 0,
    shadowClipPct: 0,
    highlightClipPct: 0,
  });

  useEffect(() => {
    if (!streamActive || !videoEl) return;

    if (!sampleCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = SAMPLE_W;
      c.height = SAMPLE_H;
      sampleCanvasRef.current = c;
    }

    const sampleCtx = sampleCanvasRef.current.getContext('2d', {
      willReadFrequently: true,
    });
    if (!sampleCtx) return;

    let active = true;
    const bins = new Uint32Array(BINS);

    const updateHistogram = () => {
      if (!active) return;

      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        sampleCtx.drawImage(videoEl, 0, 0, SAMPLE_W, SAMPLE_H);
        const { data } = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

        bins.fill(0);
        const totalPixels = SAMPLE_W * SAMPLE_H;
        let lumaSum = 0;
        let shadows = 0;
        let highlights = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Rec.709 perceptual luminance
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lumaSum += y;
          if (y <= 6) shadows++;
          if (y >= 249) highlights++;
          const bin = Math.min(BINS - 1, Math.max(0, (y * BINS) >> 8));
          bins[bin]++;
        }

        // Normalize peak with mild percentile cap to prevent single spike crushing curve
        let maxBin = 1;
        for (let i = 0; i < BINS; i++) {
          if (bins[i] > maxBin) maxBin = bins[i];
        }
        const ceiling = Math.max(maxBin * 0.92, totalPixels * 0.04);

        const canvas = displayCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Quarter-tone vertical reference lines (25%, 50%, 75%)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            for (const frac of [0.25, 0.5, 0.75]) {
              const x = Math.round(w * frac) + 0.5;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }

            // Build luminance waveform path
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let i = 0; i < BINS; i++) {
              const x = (i / (BINS - 1)) * w;
              const norm = Math.min(1, bins[i] / ceiling);
              const y = h - norm * (h - 4);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0, 'rgba(148, 163, 184, 0.45)');
            grad.addColorStop(0.5, 'rgba(244, 244, 245, 0.52)');
            grad.addColorStop(1, 'rgba(251, 191, 36, 0.58)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Crisp top trace
            ctx.beginPath();
            for (let i = 0; i < BINS; i++) {
              const x = (i / (BINS - 1)) * w;
              const norm = Math.min(1, bins[i] / ceiling);
              const y = h - norm * (h - 4);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Clipping edge markers when shadows or highlights clip > 2%
            if (shadows / totalPixels > 0.02) {
              ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
              ctx.fillRect(0, 0, 2.5, h);
            }
            if (highlights / totalPixels > 0.02) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
              ctx.fillRect(w - 2.5, 0, 2.5, h);
            }
          }
        }

        setMetrics({
          meanIre: Math.round((lumaSum / totalPixels / 255) * 100),
          shadowClipPct: Math.round((shadows / totalPixels) * 100),
          highlightClipPct: Math.round((highlights / totalPixels) * 100),
        });
      }
    };

    updateHistogram();
    const intervalId = window.setInterval(updateHistogram, 80);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [streamActive, videoEl]);

  if (!streamActive) return null;

  return (
    <div
      className="pointer-events-none select-none w-[164px] sm:w-[184px] rounded-xl bg-black/75 backdrop-blur-md border border-white/12 p-2 shadow-lg"
      aria-label="Real-time luminance histogram"
    >
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-zinc-400 mb-1">
        <span className="font-semibold text-zinc-200 tracking-wide">LUMA</span>
        <span>{metrics.meanIre} IRE</span>
      </div>

      <canvas
        ref={displayCanvasRef}
        width={168}
        height={52}
        className="w-full h-[46px] rounded bg-zinc-950/70 block"
      />

      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums mt-1 text-zinc-400">
        <span className={metrics.shadowClipPct > 2 ? 'text-sky-300 font-semibold' : ''}>
          SHD {metrics.shadowClipPct}%
        </span>
        <span className={metrics.highlightClipPct > 2 ? 'text-red-400 font-semibold' : ''}>
          HLT {metrics.highlightClipPct}%
        </span>
      </div>
    </div>
  );
};
