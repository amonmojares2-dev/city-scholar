import { useEffect, useState } from 'react';
import { profilePhotoUrl } from '../lib/api';
import { usePrivateResourceUrl } from '../lib/docUrl';
import { getSessionUser, SESSION_UPDATED_EVENT } from '../lib/auth';

interface SessionAvatarProps {
  name: string;
  className?: string;
  imageClassName?: string;
  hasProfilePhoto?: boolean;
  savedUrl?: string | null;
  updatedAt?: string | null;
}

export default function SessionAvatar({
  name,
  className = '',
  imageClassName = '',
  hasProfilePhoto,
  savedUrl,
  updatedAt,
}: SessionAvatarProps) {
  const [session, setSession] = useState(getSessionUser());
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setSession(getSessionUser());
      setImageFailed(false);
    };
    window.addEventListener(SESSION_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const sessionPhotoUrl = session?.profilePhotoUrl;
  const sessionPhotoUpdatedAt = session?.profilePhotoUpdatedAt;
  const showPhoto = hasProfilePhoto ?? session?.hasProfilePhoto;
  const initials = name.split(' ').map(part => part[0]).join('').slice(0, 2);
  const photoUrl = !imageFailed && showPhoto
    ? profilePhotoUrl(savedUrl || sessionPhotoUrl, updatedAt || sessionPhotoUpdatedAt)
    : null;
  const privatePhoto = usePrivateResourceUrl(photoUrl);

  if (privatePhoto.url) {
    return <img src={privatePhoto.url} alt={`${name} profile`} className={`${className} ${imageClassName} object-cover`} onError={() => setImageFailed(true)} />;
  }

  return <div className={`${className} flex items-center justify-center`}>{initials}</div>;
}