
import React, { useState, useEffect } from 'react';
import { db, storage, firebase, auth } from '../firebaseConfig';
import { AttendanceConfig, CrewMember, AttendanceLog, CurrentUser } from '../types';
import { Clock, RefreshCw, LogIn, LogOut, XCircle, ChevronLeft, Lock, ShieldCheck, Grid3x3, MapPin } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { Input, Button } from './SharedComponents';
import { getShiftedDate, DEFAULT_TIMEZONE } from '../utils/dateFormatter';

interface KioskViewProps {
  onExit: () => void;
  defaultOutletId?: string;
  currentUser: CurrentUser | null;
}

export const KioskView: React.FC<KioskViewProps> = ({ onExit, defaultOutletId, currentUser }) => {
  // Authentication State for Kiosk
  const [isLocked, setIsLocked] = useState(!currentUser); // Locked if no user logged in
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const [time, setTime] = useState(new Date());
  const [mode, setMode] = useState<'BEACON' | 'PIN' | 'SUCCESS' | 'ERROR'>('BEACON');
  const [message, setMessage] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [identifiedUser, setIdentifiedUser] = useState<CrewMember | null>(null);
  const [attendanceType, setAttendanceType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  
  // Configuration State
  const [kioskConfig, setKioskConfig] = useState<AttendanceConfig>({ enableQrScan: true, enablePinCode: true, permittedPinCrewIds: [] });

  // Dynamic QR State
  const [qrUrl, setQrUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Clock & Config Load
  useEffect(() => {
    // Load App Config (Timezone)
    db.collection('settings').doc('appConfig').get().then(doc => {
        if(doc.exists) setTimezone(doc.data()?.timezone || DEFAULT_TIMEZONE);
    });

    // Load Attendance Config (Enabled Methods)
    const unsubscribeConfig = db.collection('settings').doc('attendanceConfig').onSnapshot(doc => {
        if (doc.exists) {
            setKioskConfig(doc.data() as AttendanceConfig);
        }
    });

    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => {
        clearInterval(timer);
        unsubscribeConfig();
    };
  }, []);

  // Get time in target timezone
  const displayTime = getShiftedDate(time, timezone);

  // Update Lock State if prop changes
  useEffect(() => {
      setIsLocked(!currentUser);
  }, [currentUser]);

  // QR Rotator (Every 10 seconds)
  useEffect(() => {
      if (mode !== 'BEACON' || isLocked) return;

      const rotateQr = () => {
          const payload = JSON.stringify({
              type: 'NEKO_KIOSK_AUTH',
              outletId: defaultOutletId || 'MAIN',
              timestamp: Date.now(),
              nonce: Math.random().toString(36).substring(7)
          });
          // Use high-performance QR API
          setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(payload)}&color=000000&bgcolor=ffffff&qzone=1&margin=0`);
          setRefreshKey(prev => prev + 1);
      };

      rotateQr(); // Initial
      const interval = setInterval(rotateQr, 10000); // Rotate every 10s
      return () => clearInterval(interval);
  }, [mode, isLocked, defaultOutletId]);

  const handleUnlock = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsUnlocking(true);
      try {
          await auth.signInWithEmailAndPassword(adminEmail, adminPassword);
      } catch (err: any) {
          if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
              alert("Login Failed: Incorrect Email or Password.");
          } else {
              alert("Login Failed: " + err.message);
          }
      } finally {
          setIsUnlocking(false);
      }
  };

  const handlePinSubmit = async () => {
    if (pin.length < 4) return;
    setIsLoading(true);
    await processAttendance(pin);
    setPin('');
  };

  const processAttendance = async (code: string) => {
    setIsLoading(true);
    try {
      // 1. Find User
      const snap = await db.collection('crew').where('crewCode', '==', code).where('active', '==', true).get();
      
      if (snap.empty) {
        setMessage("User not found");
        setMode('ERROR');
        setTimeout(() => {
             setMode('PIN'); // Return to PIN screen
             setIdentifiedUser(null);
        }, 2500);
        return;
      }

      const user = { ...snap.docs[0].data(), id: snap.docs[0].id } as CrewMember;

      // 2. RESTRICTION CHECK: Is this user allowed to use PIN access?
      const permittedIds = kioskConfig.permittedPinCrewIds || [];
      if (permittedIds.length > 0 && !permittedIds.includes(user.id!)) {
          setMessage("Keypad access restricted. Use QR Scan.");
          setMode('ERROR');
          setTimeout(() => {
              setMode('BEACON');
              setIdentifiedUser(null);
          }, 4000);
          return;
      }
      
      // 3. Determine IN or OUT
      const logSnap = await db.collection('attendanceLogs').where('crewId', '==', user.id).get();
      
      let type: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN';
      if (!logSnap.empty) {
         const logsList = logSnap.docs.map(d => d.data() as AttendanceLog);
         logsList.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
         const lastLog = logsList[0];
         const lastTime = lastLog.timestamp?.toDate ? lastLog.timestamp.toDate() : new Date();

         // Option 1: 5-minute cooldown guardrail
         if (differenceInMinutes(new Date(), lastTime) < 5) {
             setMessage("Double scan detected. Please wait 5 minutes.");
             setMode('ERROR');
             setTimeout(() => {
                  setMode('PIN');
                  setIdentifiedUser(null);
             }, 3000);
             return;
         }

        if (lastLog.type === 'CHECK_IN') {
           const now = new Date();
           const diffHours = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
           if (diffHours < 16) {
              type = 'CHECK_OUT';
           }
        }
      }
      setAttendanceType(type);
      setIdentifiedUser(user);

      // 4. Save Log
      await db.collection('attendanceLogs').add({
        crewId: user.id,
        crewName: user.crewName,
        outletId: defaultOutletId || 'Unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        type: type,
        method: 'PIN', 
      });

      setMode('SUCCESS');
      
      setTimeout(() => {
        setMode('BEACON');
        setIdentifiedUser(null);
      }, 3000);

    } catch (e: any) {
      console.error(e);
      setMessage(e.code === 'permission-denied' ? "Permission Denied. Kiosk not authorized." : `Error: ${e.message}`);
      setMode('ERROR');
      setTimeout(() => setMode('BEACON'), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNumClick = (n: string) => {
     if (n === 'del') setPin(prev => prev.slice(0, -1));
     else if (n === 'clear') setPin('');
     else if (pin.length < 6) setPin(prev => prev + n);
  };

  // --- LOCK SCREEN (AUTHENTICATION REQ) ---
  if (isLocked) {
      return (
          <div className="fixed inset-0 bg-slate-900 z-[200] flex items-center justify-center p-6 text-white">
              <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 text-center animate-in zoom-in">
                  <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/50">
                      <Lock className="w-10 h-10 text-white"/>
                  </div>
                  <h1 className="text-2xl font-bold mb-2">Kiosk Locked</h1>
                  <p className="text-slate-400 mb-6">Device must be authorized by an Admin to access the secure database.</p>
                  
                  <form onSubmit={handleUnlock} className="space-y-4 text-left">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Manager Email</label>
                          <Input 
                             type="email" 
                             value={adminEmail} 
                             onChange={e => setAdminEmail(e.target.value)} 
                             className="bg-slate-900 border-slate-700 text-white focus:bg-slate-900" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
                          <Input 
                             type="password" 
                             value={adminPassword} 
                             onChange={e => setAdminPassword(e.target.value)} 
                             className="bg-slate-900 border-slate-700 text-white focus:bg-slate-900" 
                          />
                      </div>
                      <Button type="submit" isLoading={isUnlocking} className="mt-4 shadow-emerald-500/20">
                          <ShieldCheck className="w-4 h-4 mr-2"/> Authorize Device
                      </Button>
                  </form>
                  <button onClick={onExit} className="mt-6 text-slate-500 text-sm hover:text-white underline">
                      Exit Kiosk Mode
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-[100] text-white overflow-hidden flex flex-col font-sans">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-6 bg-slate-800/50 backdrop-blur-md">
         <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Clock className="w-6 h-6 text-white" />
             </div>
             <div>
                <h1 className="text-2xl font-bold tracking-tight">Kiosk Mode</h1>
                <p className="text-slate-400 text-sm">{defaultOutletId ? `Outlet: ${defaultOutletId}` : 'Main Entrance'}</p>
             </div>
         </div>
         <div className="text-right">
             <div className="text-4xl font-mono font-bold tracking-widest text-emerald-400">
                {format(displayTime, 'HH:mm')}
             </div>
             <div className="text-slate-400 font-medium">
                {format(displayTime, 'EEEE, MMMM d')}
             </div>
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
         
         <button onClick={onExit} className="absolute bottom-6 right-6 text-slate-700 hover:text-white p-2 flex items-center gap-2">
            <span className="text-xs font-bold opacity-0 hover:opacity-100 transition-opacity">EXIT</span>
            <LogOut className="w-5 h-5 opacity-50" />
         </button>

         {mode === 'BEACON' && (
            <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
               <div className="flex flex-col md:flex-row items-center gap-12 w-full justify-center">
                   {/* QR Section */}
                   <div className="flex-1 flex flex-col items-center max-w-md">
                       <div className="relative bg-white p-4 rounded-3xl shadow-2xl shadow-emerald-500/20 border-8 border-slate-800">
                           {qrUrl ? (
                               <img key={refreshKey} src={qrUrl} alt="Scan to Check In" className="w-72 h-72 md:w-96 md:h-96 object-contain rounded-xl" />
                           ) : (
                               <div className="w-72 h-72 md:w-96 md:h-96 bg-slate-100 animate-pulse rounded-xl"></div>
                           )}
                           
                           {/* Pulse Animation */}
                           <div className="absolute -inset-4 border-2 border-emerald-500/30 rounded-[32px] animate-ping pointer-events-none"></div>
                       </div>
                       <h2 className="text-3xl font-bold mt-8 text-white">Scan with Neko Pulse</h2>
                       <p className="text-emerald-400 font-medium mt-2">Open your phone app to clock in</p>
                   </div>

                   {/* Divider & Fallback */}
                   {kioskConfig.enablePinCode && (
                       <>
                           <div className="hidden md:flex h-64 w-px bg-slate-700"></div>

                           <div className="flex-1 flex flex-col items-center max-w-xs">
                               <button 
                                   onClick={() => setMode('PIN')}
                                   className="group flex flex-col items-center justify-center w-64 h-64 bg-slate-800 hover:bg-slate-700 rounded-3xl border-2 border-slate-700 hover:border-slate-600 transition-all shadow-xl"
                               >
                                   <div className="w-20 h-20 bg-slate-700 group-hover:bg-slate-600 rounded-full flex items-center justify-center mb-4 transition-colors">
                                       <Grid3x3 className="w-10 h-10 text-slate-300 group-hover:text-white"/>
                                   </div>
                                   <span className="text-xl font-bold text-slate-200">Use PIN Code</span>
                                   <span className="text-slate-500 text-sm mt-1">No phone? Click here</span>
                               </button>
                           </div>
                       </>
                   )}
               </div>
               
               <div className="bg-slate-800/50 backdrop-blur px-6 py-2 rounded-full border border-slate-700 flex items-center gap-2 text-slate-400 text-sm">
                   <MapPin className="w-4 h-4 text-emerald-500"/>
                   Outlet ID: <span className="font-mono font-bold text-white">{defaultOutletId || 'Unassigned'}</span>
               </div>
            </div>
         )}

         {mode === 'PIN' && (
            <div className="w-full max-w-sm bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 animate-in slide-in-from-right">
               <h2 className="text-center text-xl font-bold mb-6 text-slate-300">Enter Crew Code</h2>
               <div className="bg-slate-900 p-4 rounded-xl mb-6 text-center text-4xl font-mono tracking-[0.5em] h-20 flex items-center justify-center text-white shadow-inner">
                  {pin.replace(/./g, '•')}
               </div>
               <div className="grid grid-cols-3 gap-3 mb-6">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                     <button key={n} onClick={() => handleNumClick(n.toString())} className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold text-2xl shadow-sm transition-colors">
                        {n}
                     </button>
                  ))}
                  <button onClick={() => handleNumClick('clear')} className="h-16 rounded-xl bg-red-900/30 text-red-400 hover:bg-red-900/50 font-bold text-lg">C</button>
                  <button onClick={() => handleNumClick('0')} className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold text-2xl">0</button>
                  <button onClick={() => handleNumClick('del')} className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold text-lg flex items-center justify-center"><ChevronLeft/></button>
               </div>
               <div className="flex gap-3">
                  <button onClick={() => setMode('BEACON')} className="flex-1 py-4 rounded-xl bg-slate-700 text-slate-400 font-bold">Cancel</button>
                  <button onClick={handlePinSubmit} disabled={pin.length < 3 || isLoading} className="flex-1 py-4 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed">
                     {isLoading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto"/> : 'Check In/Out'}
                  </button>
               </div>
            </div>
         )}

         {mode === 'SUCCESS' && identifiedUser && (
            <div className="text-center animate-in zoom-in duration-300">
               <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl ${attendanceType === 'CHECK_IN' ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-orange-500 shadow-orange-500/50'}`}>
                  {attendanceType === 'CHECK_IN' ? <LogIn className="w-16 h-16 text-white"/> : <LogOut className="w-16 h-16 text-white"/>}
               </div>
               <h2 className="text-4xl font-bold mb-2">
                  {attendanceType === 'CHECK_IN' ? 'Welcome,' : 'Goodbye,'}
               </h2>
               <h3 className="text-2xl text-emerald-400 font-bold mb-4">{identifiedUser.crewName}</h3>
               <p className="text-slate-400 text-lg">
                  {attendanceType === 'CHECK_IN' ? 'Checked In at' : 'Checked Out at'} {format(new Date(), 'h:mm a')}
               </p>
            </div>
         )}

         {mode === 'ERROR' && (
            <div className="text-center animate-in shake duration-300">
               <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-red-500/50">
                  <XCircle className="w-16 h-16 text-white"/>
               </div>
               <h2 className="text-3xl font-bold mb-2">Error</h2>
               <p className="text-red-300 text-lg max-w-md mx-auto">{message}</p>
            </div>
         )}
      </div>
    </div>
  );
};
