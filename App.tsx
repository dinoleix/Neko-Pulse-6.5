
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { LoginView } from './components/LoginView';
import { AdminLayout } from './components/AdminLayout';
import { CrewLayout } from './components/CrewLayout';
import { KioskView } from './components/KioskView';
import { DynamicBranding } from './components/DynamicBranding';
import { CurrentUser, UserRole, CrewMember } from './types';

// Auto-logout after inactivity. Most roles get 5 minutes; the "Counter" role
// runs unattended on a shared device, so it gets 14 hours.
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const COUNTER_IDLE_TIMEOUT_MS = 14 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'neko_last_activity';

const getIdleTimeoutMs = (accessRole?: string) =>
  accessRole === 'Counter' ? COUNTER_IDLE_TIMEOUT_MS : DEFAULT_IDLE_TIMEOUT_MS;

function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  
  // Initialize Kiosk Mode directly from URL to avoid race conditions
  const [isKioskMode, setIsKioskMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'kiosk';
  });
  
  const [kioskOutletId, setKioskOutletId] = useState<string | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('outletId') || undefined;
  });

  const [init, setInit] = useState(true);

  useEffect(() => {
    // Only the very first auth callback represents a session restored from
    // storage on page load — that's when we enforce the idle deadline so a
    // refresh can't be used to dodge the timeout. Logins that happen later in
    // the same session are genuine user activity and are exempt.
    let didInitialIdleCheck = false;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Determine role based on login method (Synthetic Email = Crew Code Login)
        const isSynthetic = user.email?.endsWith('@neko.local') || false;
        
        // Initial assumption
        const determinedRole = isSynthetic ? UserRole.CREW : UserRole.ADMIN;

        let accessRole = undefined;
        let outletId = undefined;
        let name = user.email || 'Staff';
        let dbId = undefined;

        try {
            let userProfile: CrewMember | undefined;
            let docId: string | undefined;

            if (isSynthetic) {
                // 1. CREW LOGIN: Check 'crew' collection
                const docSnap = await db.collection('crew').doc(user.uid).get();
                if (docSnap.exists) {
                    userProfile = docSnap.data() as CrewMember;
                    docId = docSnap.id;
                } else {
                    // Legacy migration support
                    const linkedSnap = await db.collection('crew').where('authUid', '==', user.uid).limit(1).get();
                    if (!linkedSnap.empty) {
                        userProfile = linkedSnap.docs[0].data() as CrewMember;
                        docId = linkedSnap.docs[0].id;
                    }
                }
            } else {
                // 2. ADMIN LOGIN: Check 'managers' collection
                const managerSnap = await db.collection('managers').doc(user.uid).get();
                if (managerSnap.exists) {
                    userProfile = managerSnap.data() as CrewMember;
                    docId = managerSnap.id;
                }
            }

            if (userProfile) {
                // Block accounts explicitly marked inactive, even on session restore.
                if (userProfile.active === false) {
                    console.warn("Inactive account session blocked.");
                    await auth.signOut();
                    setCurrentUser(null);
                    setInit(false);
                    return;
                }
                accessRole = userProfile.role;
                outletId = userProfile.outletId;
                name = userProfile.crewName;
                dbId = docId;

                // On a restored session, log out if the idle deadline (role-based) has passed.
                if (!didInitialIdleCheck) {
                    didInitialIdleCheck = true;
                    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
                    if (last && Date.now() - last > getIdleTimeoutMs(accessRole)) {
                        localStorage.removeItem(LAST_ACTIVITY_KEY);
                        await auth.signOut();
                        setCurrentUser(null);
                        setInit(false);
                        return;
                    }
                }
            } else {
                // If profile not found in correct collection, logout to prevent "Ghost" sessions
                console.warn("User authenticated but no profile found in restricted collections.");
                await auth.signOut();
                setCurrentUser(null);
                setInit(false);
                return;
            }
        } catch (error) {
            console.warn("Profile fetch warning:", error);
        }

        setCurrentUser({ 
            role: determinedRole, 
            uid: user.uid, 
            name: name,
            outletId: outletId,
            accessRole: accessRole,
            dbId: dbId
        });
      } else {
        didInitialIdleCheck = true;
        setCurrentUser(null);
      }
      setInit(false);
    });
    return () => unsubscribe();
  }, []);

  // Idle-logout timer: while logged in, sign out after the role's idle window
  // with no interaction. Activity also stamps localStorage so a page reload
  // can't reset the clock (see the restore check above).
  useEffect(() => {
    if (!currentUser) return;

    const timeoutMs = getIdleTimeoutMs(currentUser.accessRole);
    let timerId: number;
    let lastWrite = 0;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 10000) {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        lastWrite = now;
      }
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => { auth.signOut(); }, timeoutMs);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    handleActivity(); // start the timer and stamp initial activity

    return () => {
      window.clearTimeout(timerId);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [currentUser]);

  const handleLogin = (user: CurrentUser) => setCurrentUser(user);
  
  const handleLogout = () => {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    auth.signOut();
    setCurrentUser(null);
  };

  if (init) return <div className="h-screen flex items-center justify-center text-emerald-600 font-bold animate-pulse">Loading Neko Pulse...</div>;

  // Render Kiosk
  if (isKioskMode) {
      return (
        <>
          <DynamicBranding />
          <KioskView defaultOutletId={kioskOutletId} onExit={() => window.location.href = window.location.origin} currentUser={currentUser} />
        </>
      );
  }

  return (
    <div className="min-h-screen bg-emerald-50 text-slate-900 font-sans">
      <DynamicBranding />
      {!currentUser ? (
        <LoginView onLogin={handleLogin} />
      ) : currentUser.role === UserRole.ADMIN ? (
        <AdminLayout currentUser={currentUser} onLogout={handleLogout} />
      ) : (
        <CrewLayout currentUser={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
