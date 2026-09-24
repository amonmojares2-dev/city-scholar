import type { ReactNode } from 'react';
import { usePrivateFileUrl } from '../lib/docUrl';

interface PrivateDocumentImageProps {
  documentId?: string | null;
  alt: string;
  className?: string;
}

export function PrivateDocumentImage({ documentId, alt, className = '' }: PrivateDocumentImageProps) {
  const { url, loading, error } = usePrivateFileUrl(documentId);
  if (loading) return <div className={`${className} flex items-center justify-center text-xs text-[#9CA3AF]`}>Loading…</div>;
  if (error || !url) return <div className={`${className} flex items-center justify-center text-xs text-[#DC2626]`}>{error || 'Preview unavailable.'}</div>;
  return <img src={url} alt={alt} className={className} />;
}

interface PrivateFileLinkProps {
  documentId?: string | null;
  className?: string;
  children: ReactNode;
  title?: string;
}

export function PrivateFileLink({ documentId, className = '', children, title }: PrivateFileLinkProps) {
  const { url, loading, error } = usePrivateFileUrl(documentId);
  if (loading) return <span className={className}>Loading file…</span>;
  if (error || !url) return <span className={`${className} text-[#DC2626]`}>{error || 'File unavailable.'}</span>;
  return <a href={url} target="_blank" rel="noreferrer" className={className} title={title}>{children}</a>;
}
