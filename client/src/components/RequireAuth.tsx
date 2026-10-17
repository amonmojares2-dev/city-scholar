import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { fetchSession, getSessionUser, portalForRole, onSessionChange, type PortalRole } from '../lib/auth';

export default function RequireAuth({ portal }: { portal: PortalRole }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<ReturnType<typeof getSessionUser> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const u = await fetchSession();
      if (!cancelled) setUser(u);
    };

    load();

    const unsub = onSessionChange(() => {
      void load();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [portal, navigate]);

  const allowedPortal = user ? portalForRole(user.role) : null;

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (allowedPortal && allowedPortal !== portal) {
      navigate(`/${allowedPortal}`, { replace: true });
    }
  }, [user, allowedPortal, portal, navigate]);

  return <Outlet />;
}
