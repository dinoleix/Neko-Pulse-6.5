
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../../firebaseConfig'; // For timezone retrieval if needed
import { taskService } from '../../../services/taskService';
import { CurrentUser, Task, TaskLog, TaskConfig, TaskFrequency, TaskProofType } from '../../../types';
import { Button, Card, Badge, AudioRecorder, TextArea } from '../../../components/SharedComponents';
import { ClipboardList, CheckCircle, ChevronLeft, X, Camera, Mic, AlignLeft, BellRing } from 'lucide-react';
import { format, getDate, isSameDay, endOfDay } from 'date-fns';
import { formatInTimeZone, getShiftedDate, getCurrentTimeInTimeZone, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';
import { compressImage } from '../../../services/imageService';

// --- SOUND LIBRARY ---
const SOUND_LIBRARY = [
   { id: 'BEEP', name: 'Classic Beep', url: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
   { id: 'SCIFI', name: 'Red Alert (Sci-Fi)', url: 'https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg' },
   { id: 'BUGLE', name: 'Wake Up Bugle', url: 'https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg' },
   { id: 'CARTOON', name: 'Silly Boing', url: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg' },
   { id: 'MAGIC', name: 'Magic Chime', url: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg' },
   { id: 'ROOSTER', name: 'Rooster Crow', url: 'https://actions.google.com/sounds/v1/animals/rooster_crow.ogg' },
   { id: 'CAT', name: 'Cat Meow', url: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3' }
];

export const TaskCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [logs, setLogs] = useState<TaskLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
    
    // Alert System State
    const [alertConfig, setAlertConfig] = useState<TaskConfig>({ alertEnabled: false, alertType: 'BOTH', alertDurationMinutes: 5, alertSoundId: 'BEEP' });
    const [activeAlert, setActiveAlert] = useState<Task | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Submission State
    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [proofText, setProofText] = useState('');
    const [proofPhoto, setProofPhoto] = useState<Blob | null>(null);
    const [proofAudio, setProofAudio] = useState<Blob | null>(null);

    useEffect(() => {
        // Load timezone and alert config
        db.collection('settings').doc('appConfig').get().then(doc => {
             if(doc.exists) setTimezone(doc.data()?.timezone || DEFAULT_TIMEZONE);
        });
        
        const loadConfig = async () => {
            const cfg = await taskService.getConfig();
            setAlertConfig(cfg);
        };
        loadConfig();
        
        loadMyTasks();
    }, [currentUser]);

    // ALERT SYSTEM LOGIC
    useEffect(() => {
        if (!alertConfig.alertEnabled) return;

        const checkAlerts = () => {
            if (activeAlert) return; // Don't trigger if one is already showing

            const nowTz = getCurrentTimeInTimeZone(timezone);
            const timeStr = format(nowTz, 'HH:mm');
            const dayName = format(nowTz, 'EEEE');
            const dayNum = getDate(nowTz);

            // Find a task that matches NOW
            const dueTask = tasks.find(t => {
                // Check Schedule
                let applies = false;
                if (t.frequency === TaskFrequency.DAILY) applies = true;
                if (t.frequency === TaskFrequency.WEEKLY && t.repeatDays?.includes(dayName)) applies = true;
                if (t.frequency === TaskFrequency.MONTHLY && Number(t.repeatDate) === dayNum) applies = true;
                
                if (!applies) return false;

                // Check Time Slot
                if (t.timeSlots?.includes(timeStr)) {
                    // Check if already done for this slot/day
                    // Note: 'Anytime' logs count as done. We check if there is ANY log today for this task.
                    // Ideally, we should check per slot, but based on previous logic 'Anytime' satisfies the task.
                    const isDone = logs.some(l => l.taskId === t.id);
                    return !isDone;
                }
                return false;
            });

            if (dueTask) {
                triggerAlert(dueTask);
            }
        };

        const interval = setInterval(checkAlerts, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, [tasks, logs, timezone, alertConfig, activeAlert]);

    const triggerAlert = (task: Task) => {
        setActiveAlert(task);
        if (alertConfig.alertType === 'SOUND' || alertConfig.alertType === 'BOTH') {
            const soundDef = SOUND_LIBRARY.find(s => s.id === alertConfig.alertSoundId);
            if (soundDef) {
                audioRef.current = new Audio(soundDef.url);
                audioRef.current.loop = true;
                audioRef.current.play().catch(e => console.error("Auto-play prevented", e));
            }
        }
    };

    const dismissAlert = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setActiveAlert(null);
    };

    const loadMyTasks = async () => {
        try {
            const [allTasks, rawLogs] = await Promise.all([
                taskService.getActiveTasks(),
                taskService.getTodaysLogs(currentUser.outletId!)
            ]);

            // Use store timezone to determine "Today"
            const nowTz = getCurrentTimeInTimeZone(timezone); 
            const todayDayName = format(nowTz, 'EEEE');
            const todayDate = getDate(nowTz);

            // Filter tasks relevant to current user/outlet AND scheduled for today
            const relevantTasks = allTasks.filter(t => {
                const matchesOutlet = t.outletId === currentUser.outletId;
                const matchesAssignee = t.assignedCrewIds?.length ? t.assignedCrewIds.includes(currentUser.uid) : true;
                
                if (!matchesOutlet || !matchesAssignee) return false;

                // Schedule Check
                if (t.frequency === TaskFrequency.DAILY) return true;
                if (t.frequency === TaskFrequency.WEEKLY) return t.repeatDays?.includes(todayDayName);
                if (t.frequency === TaskFrequency.MONTHLY) return Number(t.repeatDate) === todayDate;
                
                return false;
            });

            // Filter logs to match "Today" in Store Time
            const todaysLogs = rawLogs.filter(l => {
                const logDate = l.completedAt.toDate ? l.completedAt.toDate() : new Date(l.completedAt);
                const logDateTz = getShiftedDate(logDate, timezone);
                return isSameDay(logDateTz, nowTz);
            });

            setTasks(relevantTasks);
            setLogs(todaysLogs);
        } catch (e) {
            console.error("Task Load Error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenTask = (t: Task) => {
        setActiveTask(t);
        setProofText('');
        setProofPhoto(null);
        setProofAudio(null);
    };

    // Determine which selected proof types are still missing for the active task.
    const getMissingProofs = (task: Task): TaskProofType[] => {
        const required = task.proofTypes?.filter(p => p !== TaskProofType.NONE) ?? [];
        return required.filter(type => {
            if (type === TaskProofType.PHOTO) return !proofPhoto;
            if (type === TaskProofType.AUDIO) return !proofAudio;
            if (type === TaskProofType.TEXT) return !proofText.trim();
            return false;
        });
    };

    const handleSubmit = async () => {
        if (!activeTask) return;

        // Enforce that every selected proof type is provided before closing.
        const missing = getMissingProofs(activeTask);
        if (missing.length > 0) {
            const labels = missing.map(m => m.charAt(0) + m.slice(1).toLowerCase()).join(', ');
            alert(`Please provide the required proof before completing: ${labels}.`);
            return;
        }

        setSubmittingId(activeTask.id!);

        try {
            const proofData = [];
            
            if (activeTask.proofTypes?.includes(TaskProofType.PHOTO) && proofPhoto) {
                const url = await taskService.uploadProof(proofPhoto, 'IMAGE');
                proofData.push({ type: TaskProofType.PHOTO, value: url });
            }

            if (activeTask.proofTypes?.includes(TaskProofType.TEXT) && proofText) {
                proofData.push({ type: TaskProofType.TEXT, value: proofText });
            }

            if (activeTask.proofTypes?.includes(TaskProofType.AUDIO) && proofAudio) {
                 const url = await taskService.uploadProof(proofAudio, 'AUDIO');
                 proofData.push({ type: TaskProofType.AUDIO, value: url });
            }
            
            // Legacy/Fallback proofValue
            const legacyValue = proofData.length > 0 ? proofData[0].value : 'Checked';
            const legacyType = proofData.length > 0 ? proofData[0].type : TaskProofType.NONE;

            await taskService.submitLog({
                taskId: activeTask.id!,
                taskTitle: activeTask.title,
                crewId: currentUser.uid,
                crewName: currentUser.name || 'Crew',
                outletId: currentUser.outletId || '',
                scheduledTime: 'Anytime', 
                status: 'completed',
                proofType: legacyType,
                proofValue: legacyValue,
                proofData: proofData,
                completedAt: new Date() // Placeholder, service sets server timestamp
            });

            setActiveTask(null);
            loadMyTasks();
        } catch (e) {
            alert("Failed to submit task.");
        } finally {
            setSubmittingId(null);
        }
    };

    // Helper to check if task is done for a specific time slot (or generally if no slots)
    const isTaskDone = (taskId: string, slot?: string) => {
        return logs.some(l => l.taskId === taskId && (!slot || l.scheduledTime === slot));
    };

    if (loading) return <div className="p-8 text-center">Loading Tasks...</div>;

    // ALERT OVERLAY
    if (activeAlert) {
        return (
            <div className={`fixed inset-0 z-50 flex items-center justify-center p-6 ${alertConfig.alertType === 'FLASH' || alertConfig.alertType === 'BOTH' ? 'bg-red-500 animate-pulse' : 'bg-black/80'}`}>
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-4 border-red-500 animate-bounce">
                    <BellRing className="w-16 h-16 text-red-500 mx-auto mb-4 animate-ping" />
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">TASK DUE!</h1>
                    <p className="text-xl text-slate-600 font-bold mb-6">{activeAlert.title}</p>
                    <div className="space-y-3">
                        <Button onClick={() => { dismissAlert(); handleOpenTask(activeAlert); }} className="!bg-red-600 hover:!bg-red-700 !text-lg !py-4 shadow-red-200">
                            Complete Now
                        </Button>
                        <Button variant="secondary" onClick={dismissAlert}>
                            Dismiss
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (activeTask) {
        return (
            <div className="max-w-md mx-auto animate-in slide-in-from-right">
                <Button variant="secondary" onClick={() => setActiveTask(null)} className="mb-4 !w-auto">
                    <ChevronLeft className="w-4 h-4 mr-1"/> Back
                </Button>
                <Card title={activeTask.title}>
                    <p className="text-slate-500 mb-6">{activeTask.instructions || "No additional instructions."}</p>
                    
                    <div className="space-y-6">
                        {activeTask.proofTypes?.includes(TaskProofType.PHOTO) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Photo Proof</label>
                                {proofPhoto ? (
                                    <div className="relative">
                                        <img src={URL.createObjectURL(proofPhoto)} className="w-full h-48 object-cover rounded-lg" />
                                        <button onClick={() => setProofPhoto(null)} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"><X className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50">
                                        <Camera className="w-8 h-8 text-slate-400 mb-2"/>
                                        <span className="text-xs font-bold text-slate-500">Tap to Take Photo</span>
                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                                            if(e.target.files?.[0]) setProofPhoto(await compressImage(e.target.files[0], 0.7));
                                        }} />
                                    </label>
                                )}
                            </div>
                        )}

                        {activeTask.proofTypes?.includes(TaskProofType.TEXT) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Notes</label>
                                <TextArea placeholder="Add notes here..." value={proofText} onChange={e => setProofText(e.target.value)} />
                            </div>
                        )}

                        {activeTask.proofTypes?.includes(TaskProofType.AUDIO) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Audio Note</label>
                                <AudioRecorder onRecordingComplete={setProofAudio} />
                            </div>
                        )}

                        {(() => {
                            const missing = getMissingProofs(activeTask);
                            const labels = missing.map(m => m.charAt(0) + m.slice(1).toLowerCase()).join(', ');
                            return (
                                <div>
                                    <Button onClick={handleSubmit} isLoading={!!submittingId} disabled={missing.length > 0}>
                                        Complete Task
                                    </Button>
                                    {missing.length > 0 && (
                                        <p className="text-xs text-amber-600 text-center font-bold mt-2">
                                            Required before completing: {labels}
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </Card>
            </div>
        );
    }

    // STATS CALCULATION
    const totalTasks = tasks.length;
    // Calculate done count based on simple 'is done at all today' logic for now
    // If strict time slot tracking is needed, we would flatten tasks by slots first.
    const completedCount = tasks.reduce((acc, t) => acc + (isTaskDone(t.id!) ? 1 : 0), 0);
    const pendingCount = totalTasks - completedCount;
    const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    return (
        <div className="space-y-4">
             {/* SUMMARY CARD */}
             <div className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Today's Progress</h2>
                        <p className="text-xs text-slate-500">{formatInTimeZone(new Date(), 'EEEE, MMMM d', timezone)}</p>
                    </div>
                    <div className="text-2xl font-bold text-indigo-600">{completionRate}%</div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-1000 ease-out" style={{ width: `${completionRate}%` }}></div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-slate-700">{totalTasks}</div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Total</div>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div className="text-xl font-bold text-emerald-600">{completedCount}</div>
                        <div className="text-[10px] text-emerald-400 uppercase font-bold">Done</div>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                        <div className="text-xl font-bold text-amber-600">{pendingCount}</div>
                        <div className="text-[10px] text-amber-400 uppercase font-bold">Pending</div>
                    </div>
                </div>
            </div>

             {tasks.map(t => {
                 const isDone = isTaskDone(t.id!); 
                 return (
                     <div key={t.id} onClick={() => !isDone && handleOpenTask(t)} className={`bg-white p-4 rounded-xl border flex justify-between items-center ${isDone ? 'border-emerald-200 bg-emerald-50 opacity-75' : 'border-slate-100 shadow-sm cursor-pointer hover:border-indigo-200'}`}>
                         <div className="flex items-center gap-3">
                             <div className={`p-3 rounded-lg ${isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                 {isDone ? <CheckCircle className="w-6 h-6"/> : <ClipboardList className="w-6 h-6"/>}
                             </div>
                             <div>
                                 <h3 className={`font-bold ${isDone ? 'text-emerald-800' : 'text-slate-800'}`}>{t.title}</h3>
                                 <div className="text-xs text-slate-500 flex gap-2">
                                     {t.timeSlots?.length ? t.timeSlots.join(', ') : 'Anytime'}
                                 </div>
                             </div>
                         </div>
                         {isDone && <Badge variant="success">Done</Badge>}
                     </div>
                 );
             })}
             {tasks.length === 0 && <p className="text-center text-slate-400 py-8">No tasks scheduled for today.</p>}
        </div>
    );
};
