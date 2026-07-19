
import React, { useState, useEffect } from 'react';
import { conversationService } from '../../../services/conversationService';
import { storeService } from '../../../services/storeService';
import { ConversationConfig, ConversationRecording, ConversationCoaching, Store } from '../../../types';
import { Button, Card, Badge, Select } from '../../../components/SharedComponents';
import { Mic, MicOff, GraduationCap, Sparkles, Trash2, Loader2, Radio, AlertTriangle, BookMarked, Play } from 'lucide-react';
import { format } from 'date-fns';

export const ConversationAdminView: React.FC = () => {
    const [tab, setTab] = useState<'recordings' | 'training'>('recordings');
    const [config, setConfig] = useState<ConversationConfig | null>(null);
    const [recordings, setRecordings] = useState<ConversationRecording[]>([]);
    const [training, setTraining] = useState<ConversationRecording[]>([]);
    const [deviceStatuses, setDeviceStatuses] = useState<any[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [outletFilter, setOutletFilter] = useState<string>('ALL');
    const [daysBack, setDaysBack] = useState(7);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const cfg = await conversationService.getConfig();
                setConfig(cfg);
                // Lazy retention cleanup: audio expires via the GCS lifecycle
                // rule; this prunes the orphaned Firestore docs.
                conversationService.cleanupExpired(cfg.retentionDays).catch(e => console.warn('cleanup failed:', e));
                await Promise.all([loadRecordings(daysBack), loadTraining(), loadStatuses()]);
                setStores((await storeService.getStores()).filter(s => s.isActive));
            } catch (e) {
                console.error('Conversations init failed:', e);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    const loadRecordings = async (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        setRecordings(await conversationService.listByDate(start, end));
    };

    const loadTraining = async () => setTraining(await conversationService.listTraining());
    const loadStatuses = async () => setDeviceStatuses(await conversationService.getDeviceStatuses());

    const changeDays = async (days: number) => {
        setDaysBack(days);
        await loadRecordings(days);
    };

    const saveConfig = async (updates: Partial<ConversationConfig>) => {
        if (!config) return;
        const next = { ...config, ...updates };
        setIsSavingConfig(true);
        try {
            await conversationService.saveConfig(next);
            setConfig(next);
        } catch (e: any) {
            alert(`Failed to save: ${e?.message || 'Unknown error'}`);
        } finally {
            setIsSavingConfig(false);
        }
    };

    const analyze = async (rec: ConversationRecording) => {
        setBusyId(rec.id!);
        try {
            await conversationService.analyze(rec);
            await Promise.all([loadRecordings(daysBack), loadTraining()]);
        } catch (e: any) {
            alert(`Analysis failed: ${e?.message || 'Unknown error'}`);
        } finally {
            setBusyId(null);
        }
    };

    const toggleTraining = async (rec: ConversationRecording) => {
        setBusyId(rec.id!);
        try {
            if (rec.isTraining) await conversationService.unmarkTraining(rec);
            else await conversationService.markAsTraining(rec);
            await Promise.all([loadRecordings(daysBack), loadTraining()]);
        } catch (e: any) {
            alert(`Failed: ${e?.message || 'Unknown error'}`);
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (rec: ConversationRecording) => {
        if (!confirm('Delete this recording permanently?')) return;
        setBusyId(rec.id!);
        try {
            await conversationService.remove(rec);
            await Promise.all([loadRecordings(daysBack), loadTraining()]);
        } finally {
            setBusyId(null);
        }
    };

    if (isLoading || !config) return <div className="p-8 text-center text-emerald-600 font-bold flex items-center justify-center gap-2"><Loader2 className="animate-spin"/> Loading Conversations...</div>;

    // Client-side outlet filter: recordings carry the counter session's
    // outletId. Legacy/missing outletId rows only appear under "All Stores".
    const byOutlet = (r: ConversationRecording) => outletFilter === 'ALL' || r.outletId === outletFilter;
    const visibleTraining = training.filter(byOutlet);

    const grouped = recordings.filter(byOutlet).reduce<Record<string, ConversationRecording[]>>((acc, r) => {
        const day = r.startedAt?.toDate ? format(r.startedAt.toDate(), 'EEEE, d MMM yyyy') : 'Unknown date';
        (acc[day] = acc[day] || []).push(r);
        return acc;
    }, {});

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

            {/* CONTROL CARD */}
            <Card title="Counter Recording Control">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <button
                        onClick={() => saveConfig({ recordingEnabled: !config.recordingEnabled })}
                        disabled={isSavingConfig}
                        className={`flex items-center gap-4 px-6 py-4 rounded-2xl border-2 transition-all ${config.recordingEnabled ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}
                    >
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg ${config.recordingEnabled ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`}>
                            {config.recordingEnabled ? <Mic className="w-7 h-7"/> : <MicOff className="w-7 h-7"/>}
                        </div>
                        <div className="text-left">
                            <div className="font-bold text-slate-800">{config.recordingEnabled ? 'Recording is ON' : 'Recording is OFF'}</div>
                            <div className="text-xs text-slate-500">Tap to turn {config.recordingEnabled ? 'off' : 'on'} — the counter tablet follows instantly</div>
                        </div>
                    </button>

                    <div className="flex gap-4 flex-1">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Chunk Length</label>
                            <Select value={config.chunkMinutes} onChange={e => saveConfig({ chunkMinutes: Number(e.target.value) })}>
                                {[3, 5, 10].map(m => <option key={m} value={m}>{m} minutes</option>)}
                            </Select>
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Keep For</label>
                            {/* Display-only intent: actual audio expiry is the GCS lifecycle rule (see plan/docs) */}
                            <Select value={config.retentionDays} onChange={e => saveConfig({ retentionDays: Number(e.target.value) })}>
                                {[7, 14, 30].map(d => <option key={d} value={d}>{d} days</option>)}
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Tablet status */}
                <div className="mt-4 flex flex-wrap gap-2">
                    {deviceStatuses.length === 0 && <span className="text-xs text-slate-400">No counter tablet has reported yet.</span>}
                    {deviceStatuses.map(s => (
                        <span key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${s.state === 'recording' ? 'bg-red-100 text-red-700' : s.state === 'mic-blocked' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {s.state === 'recording' ? <Radio className="w-3.5 h-3.5"/> : s.state === 'mic-blocked' ? <AlertTriangle className="w-3.5 h-3.5"/> : <MicOff className="w-3.5 h-3.5"/>}
                            {s.name}{s.outletId ? ` @ ${s.outletId}` : ''} — {s.state}{s.updatedAt?.toDate ? ` (${format(s.updatedAt.toDate(), 'd MMM HH:mm')})` : ''}
                        </span>
                    ))}
                </div>

                <p className="mt-4 text-xs text-slate-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
                    Make sure the "conversations may be recorded for training" notice is visibly posted at the counter before turning this on.
                </p>
            </Card>

            {/* TABS */}
            <div className="flex gap-2">
                <button onClick={() => setTab('recordings')} className={`px-5 py-2.5 rounded-xl text-sm font-bold ${tab === 'recordings' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white text-slate-500'}`}>
                    Recordings
                </button>
                <button onClick={() => setTab('training')} className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${tab === 'training' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white text-slate-500'}`}>
                    <GraduationCap className="w-4 h-4"/> Training Library ({visibleTraining.length})
                </button>
                <div className="ml-auto flex gap-2">
                    {stores.length > 1 && (
                        <div className="w-44">
                            <Select value={outletFilter} onChange={e => setOutletFilter(e.target.value)} className="!py-2">
                                <option value="ALL">All Stores</option>
                                {stores.map(s => <option key={s.outletId} value={s.outletId}>{s.name}</option>)}
                            </Select>
                        </div>
                    )}
                    {tab === 'recordings' && (
                        <div className="w-40">
                            <Select value={daysBack} onChange={e => changeDays(Number(e.target.value))} className="!py-2">
                                <option value={1}>Today</option>
                                <option value={7}>Last 7 days</option>
                                <option value={30}>Last 30 days</option>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            {/* LISTS */}
            {tab === 'recordings' && (
                Object.keys(grouped).length === 0 ? (
                    <Card><p className="text-center text-slate-400 py-8">No recordings in this period.</p></Card>
                ) : (
                    (Object.entries(grouped) as [string, ConversationRecording[]][]).map(([day, recs]) => (
                        <Card key={day} title={day}>
                            <div className="space-y-4">
                                {recs.map(rec => (
                                    <RecordingRow key={rec.id} rec={rec} busy={busyId === rec.id} onAnalyze={analyze} onToggleTraining={toggleTraining} onDelete={remove}/>
                                ))}
                            </div>
                        </Card>
                    ))
                )
            )}

            {tab === 'training' && (
                <Card title="Training Library">
                    {visibleTraining.length === 0 ? (
                        <p className="text-center text-slate-400 py-8">No training clips{outletFilter !== 'ALL' ? ' for this store' : ''} yet. Flag a recording with the <BookMarked className="w-4 h-4 inline"/> button to keep it here permanently.</p>
                    ) : (
                        <div className="space-y-4">
                            {visibleTraining.map(rec => (
                                <RecordingRow key={rec.id} rec={rec} busy={busyId === rec.id} onAnalyze={analyze} onToggleTraining={toggleTraining} onDelete={remove}/>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

const RecordingRow: React.FC<{
    rec: ConversationRecording;
    busy: boolean;
    onAnalyze: (r: ConversationRecording) => void;
    onToggleTraining: (r: ConversationRecording) => void;
    onDelete: (r: ConversationRecording) => void;
}> = ({ rec, busy, onAnalyze, onToggleTraining, onDelete }) => {
    const [showDetail, setShowDetail] = useState(false);
    // Newer docs carry no downloadUrl (the counter session can't mint one);
    // the URL is resolved here on demand rather than for every listed row —
    // each mint costs a Storage read plus the rules' cross-service lookups.
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const audioSrc = rec.trainingUrl || rec.downloadUrl || resolvedUrl;
    const mins = Math.floor(rec.durationSec / 60);
    const secs = rec.durationSec % 60;

    const loadAudio = async () => {
        setIsLoadingAudio(true);
        try {
            setResolvedUrl(await conversationService.resolveAudioUrl(rec));
        } catch (e: any) {
            alert(`Could not load audio — it may have expired. (${e?.message || 'Unknown error'})`);
        } finally {
            setIsLoadingAudio(false);
        }
    };

    return (
        <div className="border border-slate-100 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[110px]">
                    <div className="font-bold text-slate-800 text-sm">
                        {rec.startedAt?.toDate ? format(rec.startedAt.toDate(), 'HH:mm') : '—'}
                        <span className="text-slate-400 font-normal ml-1">({mins}:{secs < 10 ? '0' : ''}{secs})</span>
                    </div>
                    <div className="text-xs text-slate-400">{rec.recordedByName}{rec.outletId ? ` · ${rec.outletId}` : ''}</div>
                </div>

                {/* Training clips outlive the expiring conversations/ object, so prefer trainingUrl */}
                {audioSrc ? (
                    <audio controls preload="none" autoPlay={resolvedUrl !== null} src={audioSrc} className="h-10 flex-1 min-w-[200px] rounded-lg"/>
                ) : (
                    <button
                        onClick={loadAudio}
                        disabled={isLoadingAudio}
                        className="h-10 flex-1 min-w-[200px] rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-600 text-xs font-bold flex items-center justify-center gap-2"
                    >
                        {isLoadingAudio ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>}
                        {isLoadingAudio ? 'Loading…' : 'Play'}
                    </button>
                )}

                <div className="flex items-center gap-2">
                    {rec.status === 'analyzed' ? (
                        <Button variant="secondary" className="!w-auto !py-2 !text-xs" onClick={() => setShowDetail(v => !v)}>
                            <Sparkles className="w-4 h-4"/> {showDetail ? 'Hide' : 'View'} Coaching
                        </Button>
                    ) : (
                        <Button variant="secondary" className="!w-auto !py-2 !text-xs" isLoading={busy} onClick={() => onAnalyze(rec)}>
                            <Sparkles className="w-4 h-4"/> Analyze
                        </Button>
                    )}
                    <button
                        title={rec.isTraining ? 'Remove from training library' : 'Save as training clip (kept forever)'}
                        onClick={() => onToggleTraining(rec)}
                        disabled={busy}
                        className={`p-2.5 rounded-xl ${rec.isTraining ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-emerald-100'}`}
                    >
                        <BookMarked className="w-4 h-4"/>
                    </button>
                    <button title="Delete recording" onClick={() => onDelete(rec)} disabled={busy} className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100">
                        <Trash2 className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {rec.isTraining && <Badge variant="success" className="mt-2 inline-block">Training Clip</Badge>}

            {showDetail && rec.status === 'analyzed' && (
                <div className="mt-4 grid md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Transcript</h4>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-4 max-h-64 overflow-y-auto">{rec.transcript || '—'}</p>
                    </div>
                    {rec.coaching && <CoachingPanel coaching={rec.coaching}/>}
                </div>
            )}
        </div>
    );
};

const CoachingPanel: React.FC<{ coaching: ConversationCoaching }> = ({ coaching }) => {
    const rubric: { label: string; value: number }[] = [
        { label: 'Greeting', value: coaching.greeting },
        { label: 'Friendliness', value: coaching.friendliness },
        { label: 'Clarity', value: coaching.clarity },
        { label: 'Upsell Attempt', value: coaching.upsellAttempt },
        { label: 'Closing', value: coaching.closing }
    ];
    const barColor = (v: number) => v >= 8 ? 'bg-emerald-500' : v >= 5 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center justify-between">
                AI Coaching
                <Badge variant={coaching.overallScore >= 8 ? 'success' : coaching.overallScore >= 5 ? 'warning' : 'danger'}>
                    Overall {coaching.overallScore}/10
                </Badge>
            </h4>
            <div className="space-y-2 mb-3">
                {rubric.map(r => (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                        <span className="w-28 text-slate-500 font-bold">{r.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${barColor(r.value)}`} style={{ width: `${Math.min(100, Math.max(0, r.value * 10))}%` }}/>
                        </div>
                        <span className="w-8 text-right font-bold text-slate-700">{r.value}</span>
                    </div>
                ))}
            </div>
            {coaching.tips?.length > 0 && (
                <ul className="text-sm text-slate-700 bg-emerald-50 rounded-xl p-4 space-y-1.5 list-disc list-inside">
                    {coaching.tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
            )}
        </div>
    );
};
