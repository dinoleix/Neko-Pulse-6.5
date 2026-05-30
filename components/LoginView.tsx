
import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { Button, Input, Card } from './SharedComponents';
import { CurrentUser, UserRole, CrewMember } from '../types';
import { loginLogService } from '../services/loginLogService';
import { Coffee, Lock, User, Zap } from 'lucide-react';

interface LoginViewProps {
  onLogin: (user: CurrentUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'staff' | 'admin'>('staff');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [crewCode, setCrewCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const cleanCode = crewCode.trim();
      if (!cleanCode) throw new Error("Please enter a code");

      // SYNTHETIC LOGIN (Staff always use synthetic emails)
      const syntheticEmail = `${cleanCode}@neko.local`;
      const syntheticPassword = `neko${cleanCode}pulse`;

      const userCred = await auth.signInWithEmailAndPassword(syntheticEmail, syntheticPassword);
      if (!userCred.user) throw new Error("Authentication failed");

      const uid = userCred.user.uid;
      let userProfile: CrewMember | null = null;
      let dbId = '';
      let foundInCollection = 'crew';

      // 1. SEARCH IN 'CREW' COLLECTION
      // Try by Doc ID (Primary)
      let docSnap = await db.collection('crew').doc(uid).get();
      
      // Fallback: Check via authUid field if Doc ID doesn't match
      if (!docSnap.exists) {
          const querySnap = await db.collection('crew').where('authUid', '==', uid).limit(1).get();
          if (!querySnap.empty) {
              docSnap = querySnap.docs[0];
          }
      }

      if (docSnap.exists) {
          userProfile = docSnap.data() as CrewMember;
          dbId = docSnap.id;
      } else {
          // 2. SEARCH IN 'MANAGERS' COLLECTION (Fallback for managers using PINs)
          // Try by Doc ID
          docSnap = await db.collection('managers').doc(uid).get();
          if (!docSnap.exists) {
              const querySnap = await db.collection('managers').where('authUid', '==', uid).limit(1).get();
              if (!querySnap.empty) {
                  docSnap = querySnap.docs[0];
              }
          }

          if (docSnap.exists) {
              userProfile = docSnap.data() as CrewMember;
              dbId = docSnap.id;
              foundInCollection = 'managers';
          }
      }

      if (!userProfile) {
         throw new Error("Account exists but profile data is missing. Please ask an Admin to 'Regenerate Login' for this user in the Employee tab.");
      }
      
      if (userProfile.active === false) {
         await auth.signOut();
         throw new Error("Account is inactive. Please contact your administrator.");
      }

      const resolvedRole = foundInCollection === 'managers' ? UserRole.ADMIN : UserRole.CREW;

      loginLogService.record({
        userId: uid,
        dbId: dbId,
        userName: userProfile.crewName,
        role: resolvedRole === UserRole.ADMIN ? 'ADMIN' : 'CREW',
        accessRole: userProfile.role,
        outletId: userProfile.outletId,
        loginMethod: 'STAFF_CODE',
      });

      onLogin({
        role: resolvedRole,
        uid: uid,
        name: userProfile.crewName,
        outletId: userProfile.outletId,
        accessRole: userProfile.role,
        dbId: dbId
      });
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         setError("Incorrect Code.");
      } else {
         setError(err.message || "Login failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email.trim(), password);
      
      if (userCredential.user) {
        const uid = userCredential.user.uid;
        
        // STRICT CHECK: MANAGERS COLLECTION ONLY
        let managerDoc = await db.collection('managers').doc(uid).get();
        
        // Fallback for migrated managers
        if (!managerDoc.exists) {
             const querySnap = await db.collection('managers').where('authUid', '==', uid).limit(1).get();
             if (!querySnap.empty) {
                 managerDoc = querySnap.docs[0];
             }
        }
        
        if (!managerDoc.exists) {
            // Safety Check: Did a crew member try to login here?
            await auth.signOut();
            throw new Error("Access Denied. User not found in Manager Directory.");
        }

        const managerData = managerDoc.data() as CrewMember;

        if (managerData.active === false) {
          await auth.signOut();
          throw new Error("Account is inactive. Please contact your administrator.");
        }

        loginLogService.record({
          userId: uid,
          dbId: managerDoc.id,
          userName: managerData.crewName || userCredential.user.email || 'Admin',
          role: 'ADMIN',
          accessRole: managerData.role,
          outletId: managerData.outletId,
          loginMethod: 'MANAGER_EMAIL',
        });

        onLogin({
          role: UserRole.ADMIN,
          uid: uid,
          name: managerData.crewName || userCredential.user.email || 'Admin',
          outletId: managerData.outletId,
          accessRole: managerData.role,
          dbId: managerDoc.id
        });
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Incorrect Email or Password.");
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const launchKiosk = () => {
      window.location.href = `${window.location.origin}${window.location.pathname}?mode=kiosk`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-200 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-200 rounded-full blur-3xl opacity-30 translate-y-1/3 -translate-x-1/4"></div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white mb-6 shadow-2xl shadow-emerald-200 transform rotate-3">
            <Coffee className="w-10 h-10 drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Neko Pulse</h1>
          <p className="text-slate-500 mt-2 font-medium">Your Cafe Solution</p>
        </div>

        <Card className="shadow-2xl shadow-slate-300/50">
          <div className="flex border-b border-slate-100 mb-8">
            <button 
              type="button"
              className={`flex-1 py-4 text-sm font-bold transition-all relative ${mode === 'staff' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => { setMode('staff'); setError(null); }}
            >
              Staff Access
              {mode === 'staff' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-emerald-500 rounded-t-full"></div>}
            </button>
            <button 
              type="button"
              className={`flex-1 py-4 text-sm font-bold transition-all relative ${mode === 'admin' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => { setMode('admin'); setError(null); }}
            >
              Manager Login
              {mode === 'admin' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-emerald-500 rounded-t-full"></div>}
            </button>
          </div>

          {mode === 'admin' ? (
            <form onSubmit={handleAdminAuth} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Manager Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@cafe.com" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="pl-12"
                    placeholder="••••••••" 
                  />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium border border-red-100">{error}</p>}
              
              <Button type="submit" isLoading={isLoading} className="shadow-emerald-300/50 mt-4">
                Login to Dashboard
              </Button>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Crew Code (PIN)
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-4 w-6 h-6 text-slate-400" />
                  <Input 
                    placeholder="Enter code" 
                    className="pl-14 text-center tracking-[0.5em] text-xl font-bold text-slate-700" 
                    type="tel" 
                    value={crewCode}
                    onChange={(e) => setCrewCode(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 text-center">Use the Crew Code provided by your Manager</p>
              </div>
              {error && <p className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium border border-red-100">{error}</p>}
              <Button type="submit" isLoading={isLoading} className="shadow-emerald-300/50">
                Log In
              </Button>
            </form>
          )}
        </Card>

        <div className="mt-8 text-center">
          <button 
            type="button"
            onClick={launchKiosk}
            className="group px-6 py-3 bg-white/50 hover:bg-white text-slate-500 hover:text-emerald-600 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-emerald-100 hover:shadow-lg flex items-center justify-center gap-2 mx-auto"
          >
            <Zap className="w-4 h-4 group-hover:fill-emerald-600 transition-colors" />
            Launch Kiosk (Time Clock)
          </button>
        </div>
      </div>
    </div>
  );
};
