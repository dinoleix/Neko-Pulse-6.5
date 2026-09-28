
import React, { useRef, useState, useEffect } from 'react';
import { AttendanceConfig, CrewMember } from '../types';
import { Clock, RefreshCw, LogIn, LogOut, XCircle, ChevronLeft, Grid3x3, MapPin, LockKeyhole, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getShiftedDate, DEFAULT_TIMEZONE } from '../utils/dateFormatter';

interface KioskViewProps {
  defaultOutletId?: string;
}

type KioskStore = { outletId: string; name: string };
const KIOSK_OUTLET_STORAGE_KEY = 'neko-pulse.kiosk-outlet-id';

const readKioskResponse = async (response: Response) => {
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { /* handled below with a useful kiosk message */ }
  if (!response.ok) {
    if (response.status === 404) throw new Error('Time Clock service is not running locally. Open the deployed app once the secure kiosk service is configured.');
    throw new Error(payload.error || 'Time Clock is temporarily unavailable. Please contact a manager.');
  }
  if (!text) throw new Error('Time Clock returned an empty response. Please contact a manager.');
  if (!payload || typeof payload !== 'object') throw new Error('Time Clock returned an invalid response. Please contact a manager.');
  return payload;
};

export const KioskView: React.FC<KioskViewProps> = ({ defaultOutletId }) => {

  const [time, setTime] = useState(new Date());
  const [mode, setMode] = useState<'BEACON' | 'PIN' | 'SUCCESS' | 'ERROR'>('BEACON');
  const [message, setMessage] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [identifiedUser, setIdentifiedUser] = useState<CrewMember | null>(null);
  const [attendanceType, setAttendanceType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [stores, setStores] = useState<KioskStore[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState(defaultOutletId || '');
  const [isConfiguringLocation, setIsConfiguringLocation] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [setupError, setSetupError] = useState('');
  
  // Configuration State
  const [kioskConfig, setKioskConfig] = useState<AttendanceConfig>({ enableQrScan: true, enablePinCode: true, permittedPinCrewIds: [] });

  // Dynamic QR State
  const [qrUrl, setQrUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The browser has no Firestore access. This endpoint returns only the safe
  // kiosk configuration, while PIN validation and attendance writes stay on
  // the server.
  useEffect(() => {
    let active = true;
    fetch('/api/kiosk-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'config' }) })
      .then(async response => {
        const payload = await readKioskResponse(response);
        if (!active) return;
        const availableStores = Array.isArray(payload.stores) ? payload.stores as KioskStore[] : [];
        const savedOutletId = window.localStorage.getItem(KIOSK_OUTLET_STORAGE_KEY) || '';
        const hasValidSavedOutlet = availableStores.some(store => store.outletId === savedOutletId);
        const preferredOutletId = hasValidSavedOutlet
          ? savedOutletId
          : (availableStores.some(store => store.outletId === defaultOutletId) ? defaultOutletId : availableStores[0]?.outletId || '');
        setStores(availableStores);
        setSelectedOutletId(preferredOutletId);
        // A new device chooses its outlet once. If the saved store is later
        // closed, setup is shown again rather than clocking staff to it.
        setIsConfiguringLocation(!hasValidSavedOutlet && availableStores.length > 1);
        if (availableStores.length === 1 && preferredOutletId) {
          window.localStorage.setItem(KIOSK_OUTLET_STORAGE_KEY, preferredOutletId);
        }
        setKioskConfig(payload.attendanceConfig || { enableQrScan: true, enablePinCode: true, permittedPinCrewIds: [] });
        setTimezone(payload.timezone || DEFAULT_TIMEZONE);
        setIsReady(true);
      })
      .catch(error => { if (active) setSetupError(error.message || 'Time Clock is unavailable.'); });
    return () => { active = false; };
  }, []);

  // Get time in target timezone
  const displayTime = getShiftedDate(time, timezone);

  // QR Rotator (Every 10 seconds)
  useEffect(() => {
      if (mode !== 'BEACON' || !isReady || !selectedOutletId) return;

      const rotateQr = () => {
          const payload = JSON.stringify({
              type: 'NEKO_KIOSK_AUTH',
              outletId: selectedOutletId,
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
  }, [mode, isReady, selectedOutletId]);

  const handlePinSubmit = async () => {
    if (pin.length < 4) return;
    setIsLoading(true);
    await processAttendance(pin);
    setPin('');
  };

  const saveKioskLocation = () => {
    if (!selectedOutletId) return;
    window.localStorage.setItem(KIOSK_OUTLET_STORAGE_KEY, selectedOutletId);
    setIsConfiguringLocation(false);
  };

  const resetKioskLocation = () => {
    window.localStorage.removeItem(KIOSK_OUTLET_STORAGE_KEY);
    setIsConfiguringLocation(true);
  };

  const processAttendance = async (code: string) => {
    setIsLoading(true);
    try {
      if (!selectedOutletId) throw new Error('Choose a store before using the Time Clock.');
      const response = await fetch('/api/kiosk-attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clock', crewCode: code, outletId: selectedOutletId }),
      });
      const result = await readKioskResponse(response);
      setAttendanceType(result.type);
      setIdentifiedUser({ crewName: result.crewName } as CrewMember);
      setMode('SUCCESS');
      
      setTimeout(() => {
        setMode('BEACON');
        setIdentifiedUser(null);
      }, 3000);

    } catch (e: any) {
      console.error('Kiosk time-clock request failed:', e);
      setMessage(e.message || 'Time Clock request failed.');
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
                <p className="text-slate-400 text-sm">24-hour staff time clock</p>
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
         
         {!isReady && <div className="text-center max-w-md"><RefreshCw className="w-10 h-10 animate-spin text-emerald-400 mx-auto mb-4" /><h2 className="text-2xl font-bold">Preparing Time Clock</h2><p className="text-slate-400 mt-2">{setupError || 'Loading the secure kiosk configuration…'}</p></div>}

         {isReady && mode === 'BEACON' && (
            <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
               {isConfiguringLocation ? (
                 <div className="w-full max-w-md rounded-3xl border border-emerald-400/30 bg-slate-800 p-8 shadow-2xl shadow-emerald-500/10">
                   <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15"><MapPin className="h-7 w-7 text-emerald-400" /></div>
                   <h2 className="text-center text-2xl font-bold">Set kiosk location</h2>
                   <p className="mt-2 text-center text-sm text-slate-400">Choose this device’s store once. It will stay locked until you reset it.</p>
                   <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-slate-400">This kiosk is at</label>
                   <select value={selectedOutletId} onChange={event => setSelectedOutletId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white font-semibold"><option value="" disabled>Select store</option>{stores.map(store => <option key={store.outletId} value={store.outletId}>{store.name}</option>)}</select>
                   <button onClick={saveKioskLocation} disabled={!selectedOutletId} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 font-bold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">Confirm this location</button>
                 </div>
               ) : <>
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
                   {kioskConfig.enablePinCode && selectedOutletId && (
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
                   <LockKeyhole className="w-4 h-4 text-emerald-500"/>
                   Kiosk location: <span className="font-mono font-bold text-white">{stores.find(store => store.outletId === selectedOutletId)?.name || 'Select a store'}</span>
               </div>
               <button onClick={resetKioskLocation} className="-mt-4 flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-300"><RotateCcw className="h-3.5 w-3.5" />Reset kiosk location</button>
               </>}
            </div>
         )}

         {isReady && mode === 'PIN' && (
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

         {isReady && mode === 'SUCCESS' && identifiedUser && (
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

         {isReady && mode === 'ERROR' && (
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
