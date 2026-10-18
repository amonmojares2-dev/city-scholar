import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { BROADCAST_CHANNEL, clearSession, getSessionUser, SESSION_UPDATED_EVENT } from '../lib/auth';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart'] as const;

export function useIdleLogout({
  idleLimitMs = 15 * 60 * 1000,
  warningLeadMs = 60 * 1000,
  activityPingMs = 60 * 1000,
}: {
  idleLimitMs?: number;
  warningLeadMs?: number;
  activityPingMs?: number;
} = {}) {
  const navigate = useNavigate();
  const [warningOpen, setWarningOpen] = useState(false);
  const lastActivityPing = useRef(0);
  const pingInFlight = useRef(false);
  const uploadInFlight = useRef(false);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    if (warningTimer.current !== null) window.clearTimeout(warningTimer.current);
    idleTimer.current = null;
    warningTimer.current = null;
  }, []);

  const handleIdleTimeout = useCallback(async () => {
    setWarningOpen(false);
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      if (!getSessionUser()) return;
    }
    clearSession();
    navigate('/login', { replace: true });
  }, [navigate]);

  const resetTimers = useCallback(() => {
    clearTimers();

    const remaining = idleLimitMs;
    const warnAt = Math.max(0, remaining - warningLeadMs);
    if (warnAt <= 0) {
      setWarningOpen(true);
      return;
    }

    warningTimer.current = window.setTimeout(() => setWarningOpen(true), warnAt);
    idleTimer.current = window.setTimeout(() => {
      void handleIdleTimeout();
    }, remaining);
  }, [clearTimers, handleIdleTimeout, idleLimitMs, warningLeadMs]);

  const recordActivity = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  const broadcastActivity = useCallback(() => {
    broadcastChannel.current?.postMessage({ type: 'activity' });
  }, []);

  const pingActivity = useCallback(() => {
    const now = Date.now();
    const minimumPingInterval = Math.max(activityPingMs, 60000);
    if (
      uploadInFlight.current
      || pingInFlight.current
      || document.visibilityState !== 'visible'
      || now - lastActivityPing.current < minimumPingInterval
    ) return;

    lastActivityPing.current = now;
    pingInFlight.current = true;
    void api('/auth/activity', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => {
        pingInFlight.current = false;
      });
  }, [activityPingMs]);

  const onRealActivity = useCallback(() => {
    if (uploadInFlight.current) return;
    recordActivity();
    broadcastActivity();
    pingActivity();
  }, [broadcastActivity, pingActivity, recordActivity]);

  const dismissWarning = useCallback(() => {
    setWarningOpen(false);
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    broadcastChannel.current = channel;
    channel.onmessage = event => {
      const { type } = event.data || {};
      if (type === 'logout') {
        setWarningOpen(false);
        clearSession();
        navigate('/login', { replace: true });
      } else if (type === 'activity') {
        recordActivity();
      }
    };

    const onSessionUpdated = () => {
      if (!getSessionUser()) channel.postMessage({ type: 'logout' });
    };
    window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);

    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
      channel.close();
      if (broadcastChannel.current === channel) broadcastChannel.current = null;
    };
  }, [navigate, recordActivity]);

  useEffect(() => {
    resetTimers();
    ACTIVITY_EVENTS.forEach(eventName => window.addEventListener(eventName, onRealActivity, { passive: true }));

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resetTimers();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach(eventName => window.removeEventListener(eventName, onRealActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, onRealActivity, resetTimers]);

  const setUploadInFlight = useCallback((inFlight: boolean) => {
    uploadInFlight.current = inFlight;
    if (!inFlight) resetTimers();
  }, [resetTimers]);

  return {
    warningOpen,
    dismissWarning,
    recordActivity,
    setUploadInFlight,
  };
}
