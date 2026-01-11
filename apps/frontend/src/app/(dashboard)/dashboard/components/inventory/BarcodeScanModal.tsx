// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/BarcodeScanModal.tsx
'use client';

import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export default function BarcodeScanModal({ open, onClose, onDetected }: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<any>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState('');
  const [starting, setStarting] = React.useState(false);

  const hasBarcodeDetector =
    typeof window !== 'undefined' && typeof (window as any).BarcodeDetector !== 'undefined';

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function start() {
      setError(null);
      setStarting(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) return;
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        if (!hasBarcodeDetector) {
          setError('Barcode scanning is not supported in this browser. Use manual entry below.');
          return;
        }

        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({
          // Browser decides what it supports; these cover common retail codes
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        let last = '';
        let stable = 0;

        const tick = async () => {
          if (cancelled) return;
          try {
            const results = await detector.detect(video);
            const rawValue = results?.[0]?.rawValue ? String(results[0].rawValue) : '';
            if (rawValue) {
              if (rawValue === last) stable += 1;
              else {
                last = rawValue;
                stable = 1;
              }

              // Small stability threshold to reduce flicker
              if (stable >= 2) {
                onDetected(rawValue);
                onClose();
                return;
              }
            }
          } catch {
            // ignore intermittent detect errors
          }

          timerRef.current = setTimeout(tick, 250);
        };

        tick();
      } catch (e: any) {
        setError(e?.message || 'Camera permission denied or unavailable.');
      } finally {
        setStarting(false);
      }
    }

    start();

    return () => {
      cancelled = true;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, hasBarcodeDetector, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">Scan barcode</div>
          <button className="text-sm underline opacity-80 hover:opacity-100" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl overflow-hidden bg-black/5 border border-black/10">
            <video ref={videoRef} className="w-full h-[260px] object-cover" playsInline />
          </div>

          {starting && <div className="text-sm opacity-70">Starting camera…</div>}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="pt-3 border-t border-black/10">
            <div className="text-sm font-medium">Manual entry</div>
            <div className="text-xs opacity-70 mt-1">
              If scanning doesn’t work, paste/type the barcode.
            </div>

            <div className="mt-2 flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm"
                placeholder="Enter UPC/EAN"
              />
              <button
                className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                disabled={!manual.trim()}
                onClick={() => {
                  onDetected(manual.trim());
                  onClose();
                }}
              >
                Use
              </button>
            </div>

            <div className="text-xs opacity-60 mt-2">
              Tip: good lighting + steady camera improves detection.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
