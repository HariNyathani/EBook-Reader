'use client';

import { useCallback, useState } from 'react';
import { ACCEPTED_EXT, ACCEPTED_MIME, getMaxUploadBytes } from '../constants';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
}

/**
 * Client component — drag-drop zone + file input for EPUB upload.
 * Validates extension, MIME, and size before invoking onFileSelect.
 */
export function UploadZone({ onFileSelect }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (file: File): string | null => {
      const filename = file.name.toLowerCase();
      const ext = filename.substring(filename.lastIndexOf('.'));

      if (!ACCEPTED_EXT.includes(ext as (typeof ACCEPTED_EXT)[number])) {
        return 'Invalid file type. Only .epub files are accepted.';
      }
      if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number]) && file.type !== '') {
        // file.type may be '' for some OS/browser combos with .epub files — accept if extension matches
        return 'Invalid MIME type. Only application/epub+zip files are accepted.';
      }
      const maxBytes = getMaxUploadBytes();
      if (file.size > maxBytes) {
        return `File too large. Maximum size is ${Math.round(maxBytes / 1_048_576)} MB.`;
      }
      return null;
    },
    [],
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validate(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      onFileSelect(file);
    },
    [validate, onFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be selected again
      e.target.value = '';
    },
    [handleFile],
  );

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
        }`}
        onClick={() => document.getElementById('epub-file-input')?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload EPUB file"
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="mb-1 text-sm font-medium text-gray-700">
          Drag & drop your EPUB file here, or click to browse
        </p>
        <p className="text-xs text-gray-500">
          Only .epub files up to {Math.round(getMaxUploadBytes() / 1_048_576)} MB
        </p>
        <input
          id="epub-file-input"
          type="file"
          accept=".epub,application/epub+zip"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
