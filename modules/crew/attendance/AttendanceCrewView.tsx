import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../../firebaseConfig';
import { attendanceService } from '../../../services/attendanceService';
import { CurrentUser, AttendanceLog, LeaveRequest, ShiftAssignment, CrewMember, AttendanceConfig } from '../../../types';
import { Button, Card, Input, Badge, Select, TextArea } from '../../../components/SharedComponents';
import { QrCode, Camera, LogIn, LogOut, XCircle, Plus, Info, Calendar } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import jsQR from 'jsqr';
import { formatInTimeZone, getShiftedDate, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';

export const AttendanceCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
   const [activeTab, setActiveTab] = useState<'LOGS' | 'LEAVES'>('LOGS');
   const [logs, setLogs] = useState<AttendanceLog[]>([]);
   const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
   const [assignments, setAssignments] = useState<ShiftAssignment[]>([]); 
   const [myProfile, setMyProfile] = useState<CrewMember | null>(null);
   const [attConfig, setAttConfig] = useState<AttendanceConfig | null>(null);
   
   const [isRequesting, setIsRequesting] = useState(false);
   const [newLeave, setNewLeave] = useState<Partial<LeaveRequest>>({
      type: 'CASUAL',
      startDate: '',
      endDate: '',
      reason: ''
   });
   const [isLoading, setIsLoading] = useState(false);
   const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
   const [scanStatus, setScanStatus] = useState("Align Kiosk QR in frame");
   const [isScanning, setIsScanning] = useState(false);
   const videoRef = useRef<HTMLVideoElement>(null);
   const scanIntervalRef = useRef<any>(null);

   useEffect(() => {
      attendanceService.getAppConfig().then(cfg => {
          if (cfg) setTimezone(cfg.timezone || DEFAULT_TIMEZONE);
      });
      attendanceService.getConfig().then(cfg => {
          setAttConfig(cfg);
      });
      loadData();
      return () => stopScanner();
   }, [currentUser]);

   const loadData = async () => {
       const dbId = currentUser.dbId;
       const uid = currentUser.uid;
       const targetId = dbId || uid;

       try {
           const [logsData, leavesData, shiftsData, crewData] = await Promise.all([
               attendanceService.getCrewLogs(targetId),
               attendanceService.getCrewLeaves(targetId),
               attendanceService.getCrewShifts(dbId, uid),
               db.collection('crew').doc(targetId).get()
           ]);

           setLogs(logsData);
           setLeaves(leavesData);
           setAssignments(shiftsData);
           if (crewData.exists) {
               setMyProfile({...crewData.data(), id: crewData.id} as CrewMember);
           }
       } catch (e) {
           console.error("Crew Load Error", e);
       }
   };

   // --- SCANNER LOGIC ---
   const startScanner = async () => {
       setIsScanning(true);
       setScanStatus("Camera Starting...");
       try {
           let stream;
           try {
               stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
           } catch (e) {
               stream = await navigator.mediaDevices.getUserMedia({ video: true });
           }

           if (videoRef.current) {
               videoRef.current.srcObject = stream;
               videoRef.current.setAttribute('playsinline', 'true');
               videoRef.current.play();
               
               scanIntervalRef.current = setInterval(() => {
                   if (!videoRef.current) return;
                   const canvas = document.createElement('canvas');
                   canvas.width = videoRef.current.videoWidth;
                   canvas.height = videoRef.current.videoHeight;
                   if (canvas.width === 0) return;
                   const ctx = canvas.getContext('2d');
                   if (!ctx) return;
                   ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                   const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                   const decoder = (jsQR as any).default || jsQR;
                   if (decoder) {
                       const code = decoder(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
                       if (code) handleScanResult(code.data);
                       else setScanStatus("Scanning...");
                   }
               }, 500);
           }
       } catch (e) {
           alert("Could not access camera.");
           setIsScanning(false);
       }
   };

   const stopScanner = () => {
       if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
       if (videoRef.current && videoRef.current.srcObject) {
           (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
       }
       setIsScanning(false);
   };

   const handleScanResult = async (data: string) => {
       try {
           const payload = JSON.parse(data);
           if (payload.type === 'NEKO_KIOSK_AUTH' && payload.timestamp) {
               if (Math.abs(Date.now() - payload.timestamp) > 60000) {
                   setScanStatus("Expired QR. Refresh Kiosk.");
                   return;
               }
               stopScanner();
               await logAttendance(payload.outletId);
           }
       } catch (e) {}
   };

   const logAttendance = async (outletId: string) => {
       const targetId = currentUser.dbId || currentUser.uid;
       
       // Option 1: 5-minute cooldown guardrail
       if (logs.length > 0) {
           const lastLogTime = logs[0].timestamp?.toDate ? logs[0].timestamp.toDate() : new Date();
           if (differenceInMinutes(new Date(), lastLogTime) < 5) {
               alert("Already logged recently! Please wait 5 minutes between check-in/out actions.");
               return;
           }
       }

       let type: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN';
       if (logs.length > 0 && logs[0].type === 'CHECK_IN') {
           const lastTime = logs[0].timestamp?.toDate ? logs[0].timestamp.toDate() : new Date();
           if (differenceInMinutes(new Date(), lastTime) < 960) type = 'CHECK_OUT';
       }

       try {
           await attendanceService.logAttendance({
               crewId: targetId,
               crewName: currentUser.name,
               outletId: outletId,
               type: type,
               method: 'QR_SCAN', 
           });
           alert(type === 'CHECK_IN' ? "Welcome! Checked In." : "Goodbye! Checked Out.");
           loadData();
       } catch (e) {
           alert("Failed to log attendance.");
       }
   };

   const submitLeave = async () => {
       if(!newLeave.startDate || !newLeave.endDate || !newLeave.reason) {
           alert("Please fill all fields");
           return;
       }
       setIsLoading(true);
       try {
           await attendanceService.submitLeave({
               crewId: currentUser.dbId || currentUser.uid,
               crewName: currentUser.name || 'Unknown',
               outletId: currentUser.outletId || '',
               type: newLeave.type as any,
               startDate: newLeave.startDate!,
               endDate: newLeave.endDate!,
               reason: newLeave.reason!,
               status: 'PENDING'
           });
           setIsRequesting(false);
           setNewLeave({ type: 'CASUAL', startDate: '', endDate: '', reason: '' });
           loadData();
           alert("Leave request submitted");
       } catch(e) {
           alert("Error submitting leave request");
       } finally {
           setIsLoading(false);
       }
   };

   const availableBalance = myProfile ? attendanceService.calculateLeaveBalance(myProfile, leaves) : 0;

   return (
      <div className="space-y-6">
         {isScanning && (
             <div className="fixed inset-0 z-[100] bg-black flex flex-col">
                 <div className="flex-1 relative">
                     <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline></video>
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <div className="w-64 h-64 border-4 border-emerald-500 rounded-2xl border-dashed"></div>
                     </div>
                     <div className="absolute top-8 left-0 right-0 text-center">
                         <span className="bg-black/60 text-white px-4 py-2 rounded-full font-bold">{scanStatus}</span>
                     </div>
                 </div>
                 <div className="p-6 bg-slate-900">
                     <Button variant="secondary" onClick={stopScanner} className="w-full">
                         <XCircle className="w-5 h-5 mr-2"/> Cancel Scan
                     </Button>
                 </div>
             </div>
         )}

         <div className="flex justify-between items-center">
             <h1 className="text-2xl font-bold">My Attendance</h1>
         </div>

         {/* LARGE SCAN CARD */}
         <div 
            onClick={startScanner}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-2xl shadow-xl shadow-indigo-200 cursor-pointer transition-transform active:scale-95 flex items-center justify-between"
         >
             <div className="flex items-center gap-4">
                 <div className="p-3 bg-white/20 rounded-xl">
                     <QrCode className="w-8 h-8"/>
                 </div>
                 <div>
                     <h3 className="text-xl font-bold">Scan Kiosk</h3>
                     <p className="text-indigo-200 text-sm">Check In or Out</p>
                 </div>
             </div>
             <Camera className="w-6 h-6 opacity-50"/>
         </div>

         {/* LEAVE BALANCE SUMMARY CARD - OPTIONAL DISPLAY */}
         {attConfig?.showLeaveBalanceInApp !== false && (
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                 <div className="flex justify-between items-center mb-4">
                     <div className="flex items-center gap-2">
                         <Calendar className="w-5 h-5 text-indigo-500"/>
                         <span className="font-bold text-slate-700">Available Leave Balance</span>
                     </div>
                     <Badge variant="success" className="!text-lg !py-1 !px-4">{availableBalance} Days</Badge>
                 </div>
                 <div className="flex gap-3 bg-indigo-50 p-3 rounded-2xl border border-indigo-100/50 text-indigo-800">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-60"/>
                    <p className="text-[10px] leading-tight opacity-80">
                        You earn 1.5 days for every 31 days worked since your joining or last reset date. This balance includes all approved leaves taken recently.
                    </p>
                 </div>
             </div>
         )}

         <div className="flex bg-white rounded-xl p-1 border border-slate-200">
            <button onClick={() => setActiveTab('LOGS')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'LOGS' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500'}`}>History</button>
            <button onClick={() => setActiveTab('LEAVES')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'LEAVES' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500'}`}>Leaves</button>
         </div>

         {activeTab === 'LOGS' && (
            <Card title="Recent Activity">
               <div className="space-y-3">
                  {logs.map(l => {
                      let latenessElement = null;
                      if (l.type === 'CHECK_IN') {
                          const logTime = l.timestamp.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
                          const logTimeTz = getShiftedDate(logTime, timezone);
                          const dateStr = format(logTimeTz, 'yyyy-MM-dd');
                          const shift = assignments.find(a => a.date === dateStr);
                          if (shift && !shift.isDayOff && shift.startTime) {
                              const [h, m] = shift.startTime.split(':').map(Number);
                              const shiftStart = new Date(logTimeTz);
                              shiftStart.setHours(h, m, 0, 0);
                              const diff = differenceInMinutes(logTimeTz, shiftStart);
                              if (diff > 0) {
                                  latenessElement = <Badge variant="danger" className="ml-2 !text-[10px]">Late +{diff}m</Badge>;
                              } else {
                                  latenessElement = <Badge variant="success" className="ml-2 !text-[10px] !bg-emerald-100 !text-emerald-700">On Time</Badge>;
                              }
                          }
                      }

                      return (
                         <div key={l.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-3">
                               <div className={`p-2 rounded-lg ${l.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                  {l.type === 'CHECK_IN' ? <LogIn className="w-5 h-5"/> : <LogOut className="w-5 h-5"/>}
                               </div>
                               <div>
                                  <div className="font-bold text-slate-700 flex items-center">
                                      {l.type === 'CHECK_IN' ? 'Check In' : 'Check Out'}
                                      {latenessElement}
                                  </div>
                                  <div className="text-xs text-slate-400">{formatInTimeZone(l.timestamp.toDate(), 'MMM d, yyyy', timezone)}</div>
                               </div>
                            </div>
                            <div className="text-right">
                               <div className="font-mono font-bold text-slate-800">{formatInTimeZone(l.timestamp.toDate(), 'h:mm a', timezone)}</div>
                               <Badge variant="neutral" className="!text-[10px]">{l.method}</Badge>
                            </div>
                         </div>
                      );
                  })}
                  {logs.length === 0 && <p className="text-center text-slate-400 py-4">No recent records.</p>}
               </div>
            </Card>
         )}

         {activeTab === 'LEAVES' && (
            <div className="space-y-6">
               {!isRequesting ? (
                  <Button onClick={() => setIsRequesting(true)}>
                     <Plus className="w-4 h-4 mr-2"/> New Leave Request
                  </Button>
               ) : (
                  <Card title="New Request" className="border-2 border-indigo-100">
                     <div className="space-y-4">
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Leave Type</label>
                           <Select value={newLeave.type} onChange={e => setNewLeave({...newLeave, type: e.target.value as any})}>
                              <option value="CASUAL">Casual Leave</option>
                              <option value="SICK">Sick Leave</option>
                              <option value="VACATION">Vacation</option>
                           </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">From</label>
                              <Input type="date" value={newLeave.startDate} onChange={e => setNewLeave({...newLeave, startDate: e.target.value})} />
                           </div>
                           <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">To</label>
                              <Input type="date" value={newLeave.endDate} onChange={e => setNewLeave({...newLeave, endDate: e.target.value})} />
                           </div>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Reason</label>
                           <TextArea placeholder="Why are you taking leave?" value={newLeave.reason} onChange={e => setNewLeave({...newLeave, reason: e.target.value})} />
                        </div>
                        <div className="flex gap-2">
                           <Button variant="secondary" onClick={() => setIsRequesting(false)}>Cancel</Button>
                           <Button onClick={submitLeave} isLoading={isLoading}>Submit Request</Button>
                        </div>
                     </div>
                  </Card>
               )}

               <div className="space-y-3">
                  {leaves.map(l => (
                     <div key={l.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                           <div>
                              <div className="font-bold text-slate-800">{l.type} Leave</div>
                              <div className="text-xs text-slate-500">
                                 {format(new Date(l.startDate), 'MMM d')} - {format(new Date(l.endDate), 'MMM d, yyyy')}
                              </div>
                           </div>
                           <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>
                              {l.status}
                           </Badge>
                        </div>
                        <p className="text-sm text-slate-600 italic">"{l.reason}"</p>
                     </div>
                  ))}
                  {leaves.length === 0 && <p className="text-center text-slate-400 py-4">No leave history.</p>}
               </div>
            </div>
         )}
      </div>
   );
};