import { requireAdmin } from '@/features/auth/session';
import { UploadForm } from '@/features/admin/upload/components/upload-form';

/**
 * Admin uploads page — EPUB upload interface.
 * Server Component; calls requireAdmin() for authorization.
 */
export default async function AdminUploadsPage() {
  await requireAdmin();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload Books</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload EPUB files to the library. Title and author can be specified manually or
          will be derived from the file.
        </p>
      </div>

      <div className="max-w-2xl">
        <UploadForm />
      </div>
    </div>
  );
}
