'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

export type BarcodeLookupResult = {
  name?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  upc?: string | null;
  sku?: string | null;
  categoryHint?: string | null;
  imageUrl?: string | null;
};

export default function BarcodeScannerModal(props: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => Promise<void> | void;
  allowManualEntry?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const reader = useMemo(() => new BrowserMultiFormatReader(), []);

  useEffect(() => {
    if (!props.open) return;

    let stopped = false;
    setErr(null);

    (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;

        // Start decoding from the default camera device (prefer environment camera automatically)
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          async (result, _error, controls) => {
            if (stopped) return;

            if (result) {
              const text = result.getText();
              stopped = true;

              // Stop scanning ASAP
              try {
                controls.stop();
              } catch {}

              // Close modal, then run handler
              props.onClose();
              await props.onDetected(text);
            }
          }
        );

        controlsRef.current = controls;
      } catch (e: any) {
        setErr(e?.message || 'Unable to access camera. Please allow camera permission.');
      }
    })();

    return () => {
      stopped = true;

      // Stop ZXing scanner controls (releases camera in most cases)
      try {
        controlsRef.current?.stop();
      } catch {}
      controlsRef.current = null;

      // Extra safety: stop MediaStream tracks if still attached
      try {
        const v = videoRef.current as any;
        const stream: MediaStream | null = v?.srcObject || null;
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          v.srcObject = null;
        }
      } catch {}
    };
  }, [props.open, props.onClose, props.onDetected, reader]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />

      <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-3 border-b border-black/5">
          <div>
            <div className="text-sm font-semibold">Scan barcode</div>
            <div className="text-xs opacity-70">Point your camera at a UPC/EAN barcode.</div>
          </div>
          <button onClick={props.onClose} className="text-xs underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {err}
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 overflow-hidden">
              <video ref={videoRef} className="w-full h-[280px] object-cover bg-black" playsInline />
            </div>
          )}

          {props.allowManualEntry ? (
            <div className="rounded-2xl border border-black/10 p-3">
              <div className="text-xs font-medium">Having trouble?</div>
              <div className="text-[11px] opacity-70">Paste/enter a barcode value to lookup.</div>

              <div className="mt-2 flex gap-2">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm"
                  placeholder="e.g. 012345678905"
                />
                <button
                  onClick={async () => {
                    const v = manual.trim();
                    if (!v) return;

                    props.onClose();
                    await props.onDetected(v);
                  }}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
                >
                  Lookup
                </button>
              </div>
            </div>
          ) : null}

          <div className="text-[11px] opacity-60">
            Tip: Ensure HTTPS and allow camera permissions.
          </div>
        </div>
      </div>
    </div>
  );
}
