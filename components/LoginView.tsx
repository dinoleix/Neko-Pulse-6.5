
import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { Button, Input, Card } from './SharedComponents';
import { CurrentUser, UserRole, CrewMember } from '../types';
import { loginLogService } from '../services/loginLogService';
import { isTenantModeEnabled, tenantService } from '../services/tenantService';
import { Coffee, Lock, User } from 'lucide-react';

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

      // A crew code resolves against the CREW collection only. The old
      // fallback into 'managers' was a back door: a staff-code login could
      // land in the full admin hub, and the session then died on refresh
      // (the restore path never checked managers for synthetic accounts).
      // Admins sign in with their email on the Manager Login tab.
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
      }

      if (!userProfile) {
         await auth.signOut();
         throw new Error("No staff profile found for this code. Managers should use the Manager Login tab; otherwise ask an Admin to 'Regenerate Login' for this user in the Employee tab.");
      }

      if (userProfile.active === false) {
         await auth.signOut();
         throw new Error("Account is inactive. Please contact your administrator.");
      }

      loginLogService.record({
        userId: uid,
        dbId: dbId,
        userName: userProfile.crewName,
        role: 'CREW',
        accessRole: userProfile.role,
        outletId: userProfile.outletId,
        loginMethod: 'STAFF_CODE',
      });

      onLogin({
        role: UserRole.CREW,
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

        // The sandbox tenant path resolves a signed-in account through its
        // membership instead of assuming every email login is a global
        // manager. This remains feature-flagged until production cutover.
        if (isTenantModeEnabled) {
          const tenantUser = await tenantService.resolveCurrentUser(uid, userCredential.user.email || undefined);
          if (!tenantUser) {
            await auth.signOut();
            throw new Error('No active business membership was found for this account.');
          }
          onLogin(tenantUser);
          return;
        }
        
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

  return (
    <div className="min-h-screen neko-shell flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-[#efb5aa] rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#8bbda5] rounded-full blur-3xl opacity-20 translate-y-1/3 -translate-x-1/4"></div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <button
            type="button"
            onClick={() => { setMode('admin'); setError(null); }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-[#063b2c] text-white mb-6 shadow-2xl shadow-emerald-950/20 transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-emerald-900/15"
            aria-label="Manager sign in"
            title="Manager sign in"
          >
            <Coffee className="w-10 h-10 drop-shadow-md" />
          </button>
          <p className="neko-eyebrow mb-2">Café operations</p>
          <h1 className="text-4xl font-semibold text-[#123229] tracking-tight">Neko Pulse</h1>
          <p className="text-slate-500 mt-2 font-medium">Good people. Great coffee. Brighter days.</p>
        </div>

        <Card className="shadow-2xl shadow-emerald-950/10">
          <div className="mb-8">
            <p className="neko-eyebrow mb-2">{mode === 'admin' ? 'Manager access' : 'Staff access'}</p>
            <h2 className="text-2xl font-semibold text-[#123229]">{mode === 'admin' ? 'Welcome back.' : 'Start your shift.'}</h2>
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
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="!pl-12"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium border border-red-100">{error}</p>}
              
              <Button type="submit" isLoading={isLoading} className="shadow-emerald-300/50 mt-4">
                Login to Dashboard
              </Button>
              <button type="button" onClick={() => { setMode('staff'); setError(null); }} className="w-full text-xs font-bold text-slate-400 hover:text-[#0b6b4d] transition-colors">
                ← Back to staff access
              </button>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Crew Code (PIN)
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  {/* Symmetric !px-12 keeps the digits truly centered (a left-only
                      pad shifted them right); tracking is reset on the placeholder
                      so "Enter code" doesn't render stretched. */}
                  <Input
                    placeholder="Enter code"
                    className="!px-12 text-center tracking-[0.35em] placeholder:tracking-normal text-xl !font-bold !text-slate-700"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={crewCode}
                    onChange={(e) => setCrewCode(e.target.value.replace(/\D/g, ''))}
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
      </div>
    </div>
  );
};
