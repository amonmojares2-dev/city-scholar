import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { didSessionCheckFail, fetchSession, getSessionUser, onSessionChange, portalForRole, type PortalRole } from '../lib/auth';

export default function RequireAuth({ portal }: { portal: PortalRole }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(getSessionUser);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onSessionChange(() => {
      setUser(getSessionUser());
    });
    void fetchSession().then(() => {
      if (!mounted) return;
      const currentUser = getSessionUser();
      setUser(currentUser);
      setSessionFailed(!currentUser && didSessionCheckFail());
      setSessionChecked(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const allowedPortal = user ? portalForRole(user.role) : null;

  useEffect(() => {
    if (!sessionChecked || sessionFailed) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (allowedPortal && allowedPortal !== portal) {
      navigate(`/${allowedPortal}`, { replace: true });
    }
  }, [user, allowedPortal, portal, navigate, sessionChecked, sessionFailed]);

  if (sessionFailed) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center text-sm text-[#6B7280]">
        Unable to verify your session right now. Please try again later.
      </div>
    );
  }

  return sessionChecked && user ? <Outlet /> : null;
}
