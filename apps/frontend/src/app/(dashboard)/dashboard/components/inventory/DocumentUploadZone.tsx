'use client';

import React, { useRef, useState } from 'react';
import { FileText, Link2, Search, Upload, X } from 'lucide-react';

type LinkedDocument = {
  id: string;
  name?: string;
  title?: string;
  fileName?: string;
  type?: string;
  documentType?: string;
};

type DocumentUploadZoneProps = {
  disabled?: boolean;
  uploading?: boolean;
  uploadError?: string | null;
  documents: LinkedDocument[];
  onUpload: (file: File) => void;
  onAttachExisting: () => void;
  onRemove: (docId: string) => void;
};

export default function DocumentUploadZone({
  disabled = false,
  uploading = false,
  uploadError,
  documents,
  onUpload,
  onAttachExisting,
  onRemove,
}: DocumentUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;

    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Documents</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Receipts, manuals, and warranties for this item.
          </p>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={onAttachExisting}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" />
          Attach existing
        </button>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (disabled) return;
          fileInputRef.current?.click();
        }}
        className={[
          'cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-150',
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50/60 opacity-70'
            : isDragging
              ? 'border-teal-400 bg-teal-50'
              : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30',
        ].join(' ')}
      >
        <div className="mx-auto flex w-fit items-center justify-center rounded-full bg-gray-100 p-2">
          <Upload className={['h-5 w-5', isDragging ? 'text-teal-600' : 'text-gray-400'].join(' ')} />
        </div>

        <p className="mt-2 text-sm font-medium text-gray-600">
          {isDragging ? 'Drop to upload' : 'Drop a file or click to browse'}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">PDF, JPG, PNG - Receipts, manuals, warranties</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.currentTarget.value = '';
          }}
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onAttachExisting}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-400 transition-colors hover:border-teal-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        Search your uploaded documents...
      </button>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</div>
      ) : null}

      {uploading ? (
        <p className="text-center text-xs text-gray-500">Uploading document...</p>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                <span className="truncate text-xs text-gray-700">{doc.name || doc.title || doc.fileName || doc.id}</span>
              </div>

              <button
                type="button"
                onClick={() => onRemove(doc.id)}
                disabled={disabled}
                className="text-gray-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Remove attached document"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400">No documents attached.</p>
      )}
    </div>
  );
}
