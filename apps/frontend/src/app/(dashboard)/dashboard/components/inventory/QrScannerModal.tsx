// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/QrScannerModal.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  Result,
} from '@zxing/library';

export default function QrScannerModal(props: {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;

    let cancelled = false;
    setErr(null);
    setBusy(true);

    (async () => {
      try {
        // Prefer QR only for speed + fewer false positives
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

        const reader = new BrowserMultiFormatReader(hints, 300);
        readerRef.current = reader;

        const video = videoRef.current;
        if (!video) return;

        // ✅ Pass null (not undefined) to use default camera
        await reader.decodeFromVideoDevice(
          null,
          video,
          async (
            result: Result | undefined,
            _error: unknown,
            controls?: { stop: () => void }
          ) => {
            if (cancelled) return;
            if (!result) return;

            const text = result.getText?.() ?? '';
            if (!text) return;

            // stop immediately after first hit
            try {
              controls?.stop();
            } catch {}

            props.onClose();
            await props.onDetected(text);
          }
        );
      } catch (e: any) {
        setErr(e?.message || 'Unable to access camera. Please allow permission.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        // Some zxing builds expose reset(); some rely on stopping tracks internally
        readerRef.current?.reset?.();
      } catch {}
      readerRef.current = null;
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
            {busy ? 'Scanning…' : 'Tip: keep the QR code centered and steady.'}
          </div>
        </div>
      </div>
    </div>
  );
}
