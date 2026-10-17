import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { clearSession, SESSION_UPDATED_EVENT, BROADCAST_CHANNEL } from '../lib/auth';

/**
 * Client-side inactivity auto-logout with a warning dialog and cross-tab sync.
 *
 * The server is authoritative: it tracks last activity via POST /auth/activity
 * and enforces IDLE_TIMEOUT_MINUTES. This hook mirrors that on the client so
 * the user gets a warning dialog ~60s before the server kills the session, and
 * so that signing out (or idling out) in one tab invalidates every tab.
 *
 * IdleLimitMs is passed in (defaults to 15 min) and should match the server's
 * IDLE_TIMEOUT_MINUTES (via VITE_IDLE_TIMEOUT_MINUTES at build time).
 */
export function useIdleLogout({
  idleLimitMs = 15 * 60 * 1000,
  warningLeadMs = 60 * 1000, // show warning this long before hard logout
  activityPingMs = 60 * 1000, // ping server at most once per minute while active
}: {
  idleLimitMs?: number;
  warningLeadMs?: number;
  activityPingMs?: number;
} = {}) {
  const navigate = useNavigate();
  const [warningOpen, setWarningOpen] = useState(false);
  const lastActivity = useRef(Date.now());
  let pingTimer: ReturnType<typeof setTimeout>;
  let idleTimer: ReturnType<typeof setTimeout>;
  let warningTimer: ReturnType<typeof setTimeout>;
  let bc: BroadcastChannel | null = null;
  let uploadInFlight = false;

  // Reset all timers based on current lastActivity.
  const resetTimers = useCallback(() => {
    lastActivity.current = Date.now();
    window.clearTimeout(idleTimer);
    window.clearTimeout(warningTimer);

    const now = Date.now();
    const remaining = idleLimitMs - (now - lastActivity.current);
    const warnAt = Math.max(0, remaining - warningLeadMs);

    if (warnAt <= 0) {
      // Session is already inside the warning window — show immediately.
      setWarningOpen(true);
      return;
    }

    warningTimer = window.setTimeout(() => setWarningOpen(true), warnAt);
    idleTimer = window.setTimeout(() => handleIdleTimeout(), remaining);
  }, [idleLimitMs, warningLeadMs]);

  const recordActivity = useCallback(() => {
    lastActivity.current = Date.now();
    resetTimers();
  }, [resetTimers]);

  const handleIdleTimeout = async () => {
    setWarningOpen(false);
    try {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    } catch {
      /* ignore */
    }
    clearSession();
    navigate('/login', { replace: true });
  };

  const dismissWarning = useCallback(() => {
    setWarningOpen(false);
    lastActivity.current = Date.now();
    resetTimers();
  }, [resetTimers]);

  // ---- Cross-tab sync via BroadcastChannel ----
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    bc = new BroadcastChannel(BROADCAST_CHANNEL);

    bc.onmessage = (event) => {
      const { type } = event.data || {};
      if (type === 'logout') {
        setWarningOpen(false);
        clearSession();
        navigate('/login', { replace: true });
      } else if (type === 'activity') {
        // Another tab reported activity — mirror it.
        recordActivity();
      }
    };

    const broadcast = (type: string) => {
      if (bc) bc.postMessage({ type });
    };

    const onSessionUpdated = () => {
      // Session was updated locally (e.g. sign-out) — tell other tabs.
      broadcast('logout');
    };

    window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);

    return () => {
      bc?.close();
      window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
    };
  }, [navigate, recordActivity]);

  // ---- Page activity listeners ----
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const onActivity = () => {
      if (uploadInFlight) return; // skip reset during file upload
      recordActivity();
      broadcastActivity();
    };

    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    // Refresh timers when tab regains focus / visibility.
    const onFocus = () => resetTimers();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resetTimers();
    });

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', () => resetTimers());
    };
  }, [resetTimers, recordActivity]);

  const broadcastActivity = useCallback(() => {
    if (bc) bc.postMessage({ type: 'activity' });
  }, [bc]);

  // ---- Periodic server ping while active ----
  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      if (uploadInFlight || document.visibilityState !== 'visible') return;
      try {
        await api('/auth/activity', { method: 'POST' }).catch(() => undefined);
      } catch {
        /* ignore — server will still enforce its own idle tracker */
      }
    };

    ping();
    pingTimer = window.setInterval(ping, activityPingMs);

    return () => {
      cancelled = true;
      window.clearInterval(pingTimer);
    };
  }, [activityPingMs]);

  // ---- Upload-aware pause ----
  const setUploadInFlight = useCallback((inFlight: boolean) => {
    uploadInFlight = inFlight;
    if (!inFlight) resetTimers();
  }, [resetTimers]);

  return {
    warningOpen,
    dismissWarning,
    recordActivity,
    setUploadInFlight,
  };
}