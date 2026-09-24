// Private application/renewal files are fetched with the Authorization header
// and displayed through short-lived Blob URLs. JWTs are never placed in URLs.
import { useEffect, useState } from 'react';
import { fetchPrivateFile } from './api';

export function docFileUrl(documentId?: string | null): string | null {
  if (!documentId || !/^[a-f0-9]{24}$/i.test(String(documentId).trim())) return null;
  return `/documents/${String(documentId).trim()}/file`;
}

export function usePrivateResourceUrl(resourcePath?: string | null): { url: string | null; error: string; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!resourcePath) {
      setUrl(null);
      setError('');
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError('');
    const normalizedPath = resourcePath.startsWith('/api/') ? resourcePath.slice(4) : resourcePath;
    fetchPrivateFile(normalizedPath)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load file.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resourcePath]);

  return { url, error, loading };
}

export function usePrivateFileUrl(documentId?: string | null): { url: string | null; error: string; loading: boolean } {
  return usePrivateResourceUrl(docFileUrl(documentId));
}

export function isImageMime(mime?: string | null): boolean {
  return mime === 'image/jpeg' || mime === 'image/png';
}

/**
 * Translate raw server error messages into human-friendly text.
 * Must never show a Mongoose ValidationError string like
 * "Application validation failed: school: Path `school` is required."
 */
export function friendlyErrorMessage(message: string): string {
  const lower = (message || '').toLowerCase();
  if (lower.includes('university') || lower.includes('school name')) {
    return 'No university found on your account. Please contact the scholarship office to have it corrected.';
  }
  if (lower.includes('application') && (lower.includes('not found') || lower.includes('404'))) {
    return 'Your application could not be found. Please refresh the page.';
  }
  if (lower.includes('validation failed')) {
    return 'Some required fields are missing. Please complete the form and try again.';
  }
  if (lower.includes('duplicate key')) {
    return 'You already have a draft application. Please refresh the page.';
  }
  return message;
}
