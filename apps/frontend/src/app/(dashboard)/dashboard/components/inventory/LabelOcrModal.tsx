// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/LabelOcrModal.tsx
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
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
    if (!v.videoWidth || !v.videoHeight) {
      setErr('Camera is not ready yet. Please wait a moment and try again.');
      return;
    }
    setBusy(true);
    setErr(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
  
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
  
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), 'image/jpeg', 0.9);
      });
  
      const file = new File([blob], `label-${Date.now()}.jpg`, { type: 'image/jpeg' });
  
      // ✅ run upload first, close only on success
      await props.onCaptured(file);
      props.onClose();
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
            <div className="relative rounded-2xl border border-black/10 overflow-hidden">
              <video ref={videoRef} className="w-full h-[300px] object-cover bg-black" playsInline />
              {/* Framing guide — corner brackets show where to position the label */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[55%] w-3/4">
                  <span className="absolute left-0 top-0 h-6 w-6 border-l-[3px] border-t-[3px] border-white/90" />
                  <span className="absolute right-0 top-0 h-6 w-6 border-r-[3px] border-t-[3px] border-white/90" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 border-b-[3px] border-l-[3px] border-white/90" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 border-b-[3px] border-r-[3px] border-white/90" />
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/80">
                    Center label here
                  </span>
                </div>
              </div>
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
