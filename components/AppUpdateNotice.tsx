import React, { useEffect, useState } from 'react';

declare const __NEKO_RELEASE__: string;

// Independent of service-worker changes: every production build gets a new ID.
export const AppUpdateNotice = () => {
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
      checking = true;
      try {
        const response = await fetch(`/version.json?check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const version = await response.json();
        if (active) setAvailable(typeof version.releaseId === 'string' && version.releaseId !== __NEKO_RELEASE__);
      } catch { /* Offline or transient failures should not interrupt work. */ }
      finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('pageshow', check);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);

  const update = async () => {
    setUpdating(true);
    setError('');
    try {
      const response = await fetch(`/version.json?check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const version = await response.json();
      if (typeof version.releaseId !== 'string') throw new Error();
      // A normal navigation preserves Firebase sign-in and kiosk configuration.
      const url = new URL(window.location.href);
      url.searchParams.set('release', version.releaseId);
      window.location.replace(url.toString());
    } catch {
      setError('Could not connect. Please try again when you are online.');
      setUpdating(false);
    }
  };

  if (!available) return null;
  return <aside role="status" aria-live="polite" className="fixed top-3 left-3 right-3 sm:left-auto sm:w-96 z-[100] rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl text-[#123229]">
    <p className="font-bold">Neko Pulse update available</p>
    <p className="mt-1 text-sm">Save any unfinished work, then update. You will stay signed in.</p>
    {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    <button type="button" disabled={updating} onClick={update} className="mt-3 rounded-xl bg-[#063b2c] px-4 py-3 font-semibold text-white disabled:opacity-50">{updating ? 'Updating…' : 'Update now'}</button>
  </aside>;
};
