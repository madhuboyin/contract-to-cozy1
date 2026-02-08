// apps/frontend/src/components/mobile/CameraCapture.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

export function CameraCapture({ 
  onCapture, 
  accept = 'image/*',
  maxSizeMB = 10,
  className 
}: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (restoreCaptureTimeoutRef.current) {
        clearTimeout(restoreCaptureTimeoutRef.current);
      }
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    onCapture(file);
  };

  const handleRetake = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerCamera = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn("space-y-4", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        capture="environment" // Use back camera on mobile
        onChange={handleFileSelect}
        className="hidden"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {preview ? (
        <div className="relative">
          <img 
            src={preview} 
            alt="Captured document" 
            className="rounded-lg w-full border-2 border-gray-200"
          />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="shadow-lg"
              onClick={handleRetake}
            >
              <RotateCw className="h-4 w-4 mr-1" />
              Retake
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            onClick={triggerCamera}
            className="w-full h-40 flex flex-col items-center justify-center gap-3 text-base"
            variant="outline"
          >
            <Camera className="h-10 w-10" />
            <span className="font-semibold">Take Photo</span>
            <span className="text-xs text-gray-500">Use your camera to scan documents</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or</span>
            </div>
          </div>

          <Button
            onClick={() => {
              const input = fileInputRef.current;
              if (input) {
                input.removeAttribute('capture');
                input.click();
                // Re-add capture attribute after click
                if (restoreCaptureTimeoutRef.current) {
                  clearTimeout(restoreCaptureTimeoutRef.current);
                }
                restoreCaptureTimeoutRef.current = setTimeout(() => {
                  const currentInput = fileInputRef.current;
                  if (currentInput) {
                    currentInput.setAttribute('capture', 'environment');
                  }
                  restoreCaptureTimeoutRef.current = null;
                }, 100);
              }
            }}
            variant="ghost"
            className="w-full h-16 flex items-center justify-center gap-2"
          >
            <Upload className="h-5 w-5" />
            <span>Upload from Gallery</span>
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Max file size: {maxSizeMB}MB • Supported: JPG, PNG, HEIC
      </p>
    </div>
  );
}

// Quick action button for floating camera access
export function FloatingCameraButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-20 right-4 md:bottom-6",
        "w-14 h-14 rounded-full",
        "bg-blue-600 text-white shadow-lg",
        "flex items-center justify-center",
        "active:scale-95 transition-transform",
        "hover:bg-blue-700",
        "z-40"
      )}
      aria-label="Open camera"
    >
      <Camera className="h-6 w-6" />
    </button>
  );
}
