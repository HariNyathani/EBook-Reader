'use client';

import { useActionState, useEffect, useState } from 'react';
import { uploadBookAction } from '../actions';
import { UploadZone } from './upload-zone';
import { useUiStore } from '@/store/ui-store';

/**
 * Client component — upload form with metadata fields.
 * Submits FormData to uploadBookAction via useActionState.
 */
export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      return uploadBookAction(formData);
    },
    null,
  );

  // Handle result
  useEffect(() => {
    if (state?.status === 'success') {
      showToast('Book uploaded successfully!', 'success');
      setFile(null);
      // Reset the form
      const form = document.getElementById('upload-form') as HTMLFormElement | null;
      form?.reset();
    } else if (state?.status === 'error') {
      showToast(state.message, 'error');
    }
  }, [state, showToast]);

  const handleSubmit = (formData: FormData) => {
    if (!file) {
      showToast('Please select an EPUB file first.', 'error');
      return;
    }
    formData.set('file', file);
    formAction(formData);
  };

  return (
    <form id="upload-form" action={handleSubmit} className="space-y-6">
      {/* File selection */}
      <UploadZone onFileSelect={setFile} />

      {/* Selected file indicator */}
      {file && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">{file.name}</span>
          <span className="text-blue-500">({(file.size / 1_048_576).toFixed(2)} MB)</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="ml-auto text-blue-500 hover:text-blue-700"
          >
            Remove
          </button>
        </div>
      )}

      {/* Optional metadata override fields (ISD §7.H upload-form.tsx) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
            Title <span className="text-gray-400">(optional override)</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Leave blank to auto-detect from EPUB"
            maxLength={300}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            If blank, the title is extracted from the EPUB metadata.
          </p>
        </div>
        <div>
          <label htmlFor="author" className="mb-1 block text-sm font-medium text-gray-700">
            Author <span className="text-gray-400">(optional override)</span>
          </label>
          <input
            type="text"
            id="author"
            name="author"
            placeholder="Leave blank to auto-detect from EPUB"
            maxLength={200}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            If blank, the author is extracted from the EPUB metadata.
          </p>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending || !file}
        className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Uploading…
          </span>
        ) : (
          'Upload Book'
        )}
      </button>
    </form>
  );
}
