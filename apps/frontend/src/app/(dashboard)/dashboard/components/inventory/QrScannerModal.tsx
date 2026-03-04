// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/QrScannerModal.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export default function QrScannerModal(props: {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;

    let cancelled = false;
    setErr(null);
    setBusy(true);

    (async () => {
      try {
        const hints = new Map<DecodeHintType, unknown>();
        // QR only for speed + fewer false positives
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });

        const video = videoRef.current;
        if (!video) return;

        // Prefer rear/environment camera for scanning physical labels
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video,
          async (result, _error, controls: IScannerControls) => {
            if (cancelled) return;
            if (!result) return;

            const text = result.getText?.() ?? '';
            if (!text) return;

            // Stop immediately after first hit
            try {
              controls.stop();
            } catch {}
            // Belt-and-suspenders: stop any lingering MediaStream tracks
            try {
              const stream = videoRef.current?.srcObject as MediaStream | null;
              stream?.getTracks().forEach((track) => track.stop());
              if (videoRef.current) videoRef.current.srcObject = null;
            } catch {}

            props.onClose();
            await props.onDetected(text);
          }
        );

        if (!cancelled) {
          controlsRef.current = controls;
        } else {
          // If cancelled before controls were saved, stop immediately
          try { controls.stop(); } catch {}
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Unable to access camera. Please allow permission.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {}
      controlsRef.current = null;
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      } catch {}
    };
  }, [props.open, props.onClose, props.onDetected]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />
      <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-3 border-b border-black/5">
          <div>
            <div className="text-sm font-semibold">Scan QR code</div>
            <div className="text-xs opacity-70">
              Point at a QR sticker on the device/manual to autofill details.
            </div>
          </div>
          <button onClick={props.onClose} className="text-xs underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div>
          ) : (
            <div className="rounded-2xl border border-black/10 overflow-hidden">
              <video ref={videoRef} className="w-full h-[300px] object-cover bg-black" playsInline />
            </div>
          )}

          <div className="text-[11px] opacity-60">
            {busy ? 'Starting camera…' : 'Tip: keep the QR code centered and steady.'}
          </div>
        </div>
      </div>
    </div>
  );
}
