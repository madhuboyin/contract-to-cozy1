'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface PhotoUploadProps {
  propertyId: string;
  actionKey: string;
  maxPhotos?: number;
  onPhotosChange: (photoIds: string[]) => void;
  onUpload: (file: File, orderIndex: number) => Promise<{ id: string; thumbnailUrl: string }>;
}

interface UploadedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  thumbnailUrl?: string;
  uploading: boolean;
  error?: string;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  propertyId,
  actionKey,
  maxPhotos = 5,
  onPhotosChange,
  onUpload,
}) => {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Revoke all object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = maxPhotos - photos.length;
    if (remainingSlots <= 0) {
      toast({
        title: 'Maximum photos reached',
        description: `You can only upload ${maxPhotos} photos.`,
        variant: 'destructive',
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    let orderIndex = photos.length;

    for (const file of filesToUpload) {
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/heic'].includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload JPG, PNG, or HEIC images only.',
          variant: 'destructive',
        });
        continue;
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 10MB limit.`,
          variant: 'destructive',
        });
        continue;
      }

      // Create preview
      const previewUrl = URL.createObjectURL(file);
      const tempPhoto: UploadedPhoto = {
        id: `temp-${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
        uploading: true,
      };

      const currentIndex = orderIndex++;
      setPhotos((prev) => [...prev, tempPhoto]);

      // Upload
      try {
        const result = await onUpload(file, currentIndex);

        setPhotos((prev) => {
          const next = prev.map((p) =>
            p.id === tempPhoto.id
              ? { ...p, id: result.id, thumbnailUrl: result.thumbnailUrl, uploading: false }
              : p
          );
          // Notify parent after state update resolves
          queueMicrotask(() => onPhotosChange(next.filter(p => !p.id.startsWith('temp-')).map(p => p.id)));
          return next;
        });
      } catch (error: any) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempPhoto.id
              ? { ...p, uploading: false, error: error.message || 'Upload failed' }
              : p
          )
        );
        toast({
          title: 'Upload failed',
          description: error.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleRemove = (photoId: string) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === photoId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter((p) => p.id !== photoId);
      onPhotosChange(next.map((p) => p.id));
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-3">
      {/* Upload Zone */}
      {photos.length < maxPhotos && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer',
            'hover:border-blue-500 hover:bg-blue-50 transition-colors',
            'border-gray-300'
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            JPG, PNG, or HEIC (max 10MB per photo)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      )}

      {/* Photo Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
            >
              <img
                src={photo.previewUrl}
                alt="Upload preview"
                className="w-full h-full object-cover"
              />

              {photo.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}

              {photo.error && (
                <div className="absolute inset-0 bg-red-500/90 flex items-center justify-center p-2">
                  <p className="text-xs text-white text-center">{photo.error}</p>
                </div>
              )}

              {!photo.uploading && !photo.error && (
                <button
                  onClick={() => handleRemove(photo.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <p className="text-xs text-gray-500">
          {photos.length} / {maxPhotos} photos uploaded
        </p>
      )}
    </div>
  );
};