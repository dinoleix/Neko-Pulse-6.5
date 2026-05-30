
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { LoginView } from './components/LoginView';
import { AdminLayout } from './components/AdminLayout';
import { CrewLayout } from './components/CrewLayout';
import { KioskView } from './components/KioskView';
import { DynamicBranding } from './components/DynamicBranding';
import { CurrentUser, UserRole, CrewMember } from './types';

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
        setCurrentUser(null);
      }
      setInit(false);
    });
    return () => unsubscribe();
  }, []); 

  const handleLogin = (user: CurrentUser) => setCurrentUser(user);
  
  const handleLogout = () => {
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
