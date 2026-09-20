import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { getSession, portalForRole, type PortalRole } from '../lib/auth';

export default function RequireAuth({ portal }: { portal: PortalRole }) {
  const navigate = useNavigate();
  const session = getSession();
  const allowedPortal = session ? portalForRole(session.user.role) : null;

  // If there's no session, or the session belongs to a different portal,
  // navigate once instead of returning <Navigate> during render.
  useEffect(() => {
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }

    if (allowedPortal && allowedPortal !== portal) {
      navigate(`/${allowedPortal}`, { replace: true });
    }
  }, [session, allowedPortal, portal, navigate]);

  // Keep rendering Outlet while the guard does its navigation work.
  // This avoids the "Maximum update depth exceeded" loop caused by
  // returning <Navigate> synchronously during render.
  return <Outlet />;
}
