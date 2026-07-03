
import React, { useState } from 'react';
import { db } from '../../../firebaseConfig';
import { Button, Card, Input, Select } from '../../../components/SharedComponents';
import { Trash2, AlertTriangle, Archive, CheckCircle, Database, Download, Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const subDays = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() - amount);
    return d;
};

const subMonths = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - amount);
    return d;
};

const subYears = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() - amount);
    return d;
};

const TARGETS = [
    { id: 'validations', name: 'Order Validations (Photos & Logs)', dateField: 'validatedAt', type: 'TIMESTAMP', risk: 'LOW' },
    { id: 'taskLogs', name: 'Task Completion Logs', dateField: 'completedAt', type: 'TIMESTAMP', risk: 'LOW' },
    { id: 'shiftAssignments', name: 'Shift Roster History', dateField: 'date', type: 'STRING', risk: 'LOW' },
    { id: 'attendanceLogs', name: 'Attendance Logs (Clock In/Out)', dateField: 'timestamp', type: 'TIMESTAMP', risk: 'HIGH' },
    { id: 'eom_votes', name: 'Employee of Month Votes', dateField: 'timestamp', type: 'TIMESTAMP', risk: 'LOW' },
];

export const SettingsAdminView: React.FC = () => {
    const [step, setStep] = useState<'CONFIG' | 'REVIEW' | 'PROCESSING' | 'DONE'>('CONFIG');
    const [targetId, setTargetId] = useState(TARGETS[0].id);
    const [retentionValue, setRetentionValue] = useState(6);
    const [retentionUnit, setRetentionUnit] = useState<'DAYS' | 'MONTHS' | 'YEARS'>('MONTHS');
    
    // Analysis Data
    const [analysisCount, setAnalysisCount] = useState<number | null>(null);
    const [backupData, setBackupData] = useState<any[]>([]);
    const [cutoffDate, setCutoffDate] = useState<Date>(new Date());
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // Deletion State
    const [confirmText, setConfirmText] = useState('');
    const [progress, setProgress] = useState({ deleted: 0, total: 0 });
    const [isDeleting, setIsDeleting] = useState(false);

    // --- LOGIC ---

    const calculateCutoff = () => {
        const now = new Date();
        if (retentionUnit === 'DAYS') return subDays(now, retentionValue);
        if (retentionUnit === 'MONTHS') return subMonths(now, retentionValue);
        return subYears(now, retentionValue);
    };

    const getTargetConfig = () => TARGETS.find(t => t.id === targetId)!;

    const runAnalysis = async () => {
        setIsAnalyzing(true);
        const config = getTargetConfig();
        const cutoff = calculateCutoff();
        setCutoffDate(cutoff);

        try {
            let query: any = db.collection(config.id);
            
            if (config.type === 'TIMESTAMP') {
                query = query.where(config.dateField, '<', cutoff);
            } else {
                // String Date YYYY-MM-DD
                const dateStr = format(cutoff, 'yyyy-MM-dd');
                query = query.where(config.dateField, '<', dateStr);
            }

            // Fetch IDs only (lightweight) or full data for backup
            const snap = await query.get();
            setAnalysisCount(snap.size);
            
            // Prepare backup data in memory (Caution: Large datasets might need optimization)
            const data = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
            setBackupData(data);
            
            setStep('REVIEW');
        } catch (error) {
            console.error(error);
            alert("Analysis failed. Check console or permissions.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const downloadBackup = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${targetId}_backup_${format(new Date(), 'yyyy-MM-dd')}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const executeDeletion = async () => {
        if (confirmText !== 'DELETE') return;
        setIsDeleting(true);
        setStep('PROCESSING');
        
        const config = getTargetConfig();
        const cutoff = calculateCutoff();
        let totalDeleted = 0;
        const totalToDel = analysisCount || 0;

        try {
            while (true) {
                // Re-query in batches
                let query = db.collection(config.id).limit(400); // 400 is safe batch size
                
                if (config.type === 'TIMESTAMP') {
                    query = query.where(config.dateField, '<', cutoff);
                } else {
                    const dateStr = format(cutoff, 'yyyy-MM-dd');
                    query = query.where(config.dateField, '<', dateStr);
                }

                const snapshot = await query.get();
                if (snapshot.empty) break;

                const batch = db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                totalDeleted += snapshot.size;
                setProgress({ deleted: totalDeleted, total: totalToDel });
            }
            setStep('DONE');
        } catch (e) {
            alert("Deletion interrupted. Please try again.");
            setStep('CONFIG'); // Reset to safe state
        } finally {
            setIsDeleting(false);
        }
    };

    // --- RENDERERS ---

    const renderConfigStep = () => (
        <div className="space-y-6 animate-in slide-in-from-right">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0"/>
                <div className="text-sm text-amber-800">
                    <p className="font-bold">Warning: Data Deletion is Permanent.</p>
                    <p>This tool permanently removes data from the database. This cannot be undone from the app.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Data Type to Clean</label>
                    <div className="space-y-2">
                        {TARGETS.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => setTargetId(t.id)}
                                className={`p-3 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${targetId === t.id ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                            >
                                <div>
                                    <div className={`font-bold text-sm ${targetId === t.id ? 'text-indigo-700' : 'text-slate-700'}`}>{t.name}</div>
                                    <div className="text-xs text-slate-400">Field: {t.dateField}</div>
                                </div>
                                {t.risk === 'HIGH' && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">High Risk</span>}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Delete Records Older Than</label>
                        <div className="flex gap-2">
                            <Input 
                                type="number" 
                                min={1} 
                                value={retentionValue} 
                                onChange={e => setRetentionValue(parseInt(e.target.value))} 
                                className="!text-lg font-bold"
                            />
                            <Select value={retentionUnit} onChange={e => setRetentionUnit(e.target.value as any)}>
                                <option value="DAYS">Days</option>
                                <option value="MONTHS">Months</option>
                                <option value="YEARS">Years</option>
                            </Select>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                            Cutoff Date: <span className="font-bold text-slate-600">{format(calculateCutoff(), 'PPP')}</span>
                        </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <Button onClick={runAnalysis} isLoading={isAnalyzing} className="!bg-indigo-600 hover:!bg-indigo-700 shadow-indigo-200">
                            Analyze & Preview
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderReviewStep = () => (
        <div className="space-y-6 animate-in slide-in-from-right">
            <div className="text-center py-6">
                <Database className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
                <h2 className="text-3xl font-bold text-slate-800">{analysisCount}</h2>
                <p className="text-slate-500 font-medium">Records Found</p>
                <div className="mt-2 text-sm text-slate-400">
                    Type: <span className="font-bold text-slate-600">{getTargetConfig().name}</span> <br/>
                    Older than: <span className="font-bold text-slate-600">{format(cutoffDate, 'PPP')}</span>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Archive className="w-5 h-5 text-indigo-500"/> Recommended: Backup Data
                </h3>
                <p className="text-sm text-slate-500">
                    We strongly recommend downloading a JSON backup of these {analysisCount} records before deletion.
                </p>
                <Button variant="secondary" onClick={downloadBackup} disabled={analysisCount === 0}>
                    <Download className="w-4 h-4 mr-2"/> Download Backup JSON
                </Button>
            </div>

            {analysisCount && analysisCount > 0 ? (
                <div className="bg-red-50 border border-red-100 p-6 rounded-xl space-y-4">
                    <h3 className="font-bold text-red-700 flex items-center gap-2">
                        <Trash2 className="w-5 h-5"/> Danger Zone
                    </h3>
                    <p className="text-sm text-red-600">
                        To confirm deletion, type the word <strong>DELETE</strong> in the box below.
                    </p>
                    <Input 
                        placeholder="Type DELETE to confirm" 
                        value={confirmText} 
                        onChange={e => setConfirmText(e.target.value)}
                        className="!border-red-200 focus:!border-red-500 !text-red-700 !font-bold"
                    />
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setStep('CONFIG')}>Cancel</Button>
                        <Button variant="danger" disabled={confirmText !== 'DELETE'} onClick={executeDeletion}>
                            Permanently Delete Records
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="secondary" onClick={() => setStep('CONFIG')}>Back to Config</Button>
            )}
        </div>
    );

    const renderProcessingStep = () => (
        <div className="text-center py-12 animate-in fade-in">
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-6"/>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Cleaning Database...</h2>
            <p className="text-slate-500 mb-8">Please do not close this window.</p>
            
            <div className="max-w-md mx-auto">
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                    <span>Deleted: {progress.deleted}</span>
                    <span>Total: {progress.total}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                    <div 
                        className="bg-indigo-600 h-full transition-all duration-300"
                        style={{ width: `${(progress.deleted / progress.total) * 100}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );

    const renderDoneStep = () => (
        <div className="text-center py-12 animate-in zoom-in">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600"/>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Cleanup Complete</h2>
            <p className="text-slate-500 mb-8">Successfully removed {progress.deleted} records.</p>
            <Button className="!w-auto" onClick={() => { setStep('CONFIG'); setConfirmText(''); setBackupData([]); setAnalysisCount(null); }}>
                Back to Maintenance
            </Button>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                    <Database className="w-6 h-6"/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">System Maintenance</h1>
                    <p className="text-slate-500 text-sm">Database cleanup and retention management</p>
                </div>
            </div>

            {/* Stepper Header */}
            <div className="flex items-center justify-between mb-8 max-w-2xl mx-auto">
                <div className={`flex flex-col items-center ${step === 'CONFIG' ? 'text-indigo-600' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${step === 'CONFIG' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</div>
                    <span className="text-xs font-bold">Configure</span>
                </div>
                <div className="h-1 flex-1 bg-slate-200 mx-4"></div>
                <div className={`flex flex-col items-center ${step === 'REVIEW' ? 'text-indigo-600' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${step === 'REVIEW' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</div>
                    <span className="text-xs font-bold">Review</span>
                </div>
                <div className="h-1 flex-1 bg-slate-200 mx-4"></div>
                <div className={`flex flex-col items-center ${step === 'PROCESSING' || step === 'DONE' ? 'text-indigo-600' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${step === 'PROCESSING' || step === 'DONE' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</div>
                    <span className="text-xs font-bold">Execute</span>
                </div>
            </div>

            <Card className="min-h-[400px]">
                {step === 'CONFIG' && renderConfigStep()}
                {step === 'REVIEW' && renderReviewStep()}
                {step === 'PROCESSING' && renderProcessingStep()}
                {step === 'DONE' && renderDoneStep()}
            </Card>
        </div>
    );
};
