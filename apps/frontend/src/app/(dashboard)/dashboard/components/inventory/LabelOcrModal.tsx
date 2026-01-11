'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function LabelOcrModal(props: {
  open: boolean;
  onClose: () => void;
  onCaptured: (file: File) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;

    let cancelled = false;
    setErr(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) return;

        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
      } catch (e: any) {
        setErr(e?.message || 'Unable to access camera. Please allow permission.');
      }
    })();

    return () => {
      cancelled = true;
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
      try {
        const v = videoRef.current as any;
        if (v?.srcObject) v.srcObject = null;
      } catch {}
    };
  }, [props.open]);

  async function capture() {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), 'image/jpeg', 0.9);
      });

      const file = new File([blob], `label-${Date.now()}.jpg`, { type: 'image/jpeg' });

      props.onClose();
      await props.onCaptured(file);
    } catch (e: any) {
      setErr(e?.message || 'Capture failed');
    } finally {
      setBusy(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />
      <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-3 border-b border-black/5">
          <div>
            <div className="text-sm font-semibold">Scan appliance label</div>
            <div className="text-xs opacity-70">Take a clear photo of the model/serial plate.</div>
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

          <button
            onClick={capture}
            disabled={!!err || busy}
            className="w-full rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {busy ? 'Capturing…' : 'Capture & Extract'}
          </button>

          <div className="text-[11px] opacity-60">
            Tip: get close, avoid glare, and keep the label centered.
          </div>
        </div>
      </div>
    </div>
  );
}
