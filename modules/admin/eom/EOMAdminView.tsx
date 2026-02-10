
import React, { useState, useEffect } from 'react';
import { eomService } from '../../../services/eomService';
import { CrewMember, EOMCycle, EOMResult } from '../../../types';
import { Button, Card, Input, Badge } from '../../../components/SharedComponents';
import { Trophy, Vote, Award, Crown, AlertCircle, BarChart3, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export const EOMAdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'CYCLES' | 'SCORING' | 'RESULTS'>('CYCLES');
    const [cycles, setCycles] = useState<EOMCycle[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    
    // Create Cycle State
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [isProcessing, setIsProcessing] = useState(false);

    // Scoring State
    const [scoringCycleId, setScoringCycleId] = useState<string>('');
    const [mgmtScores, setMgmtScores] = useState<Record<string, number>>({});

    // Results State
    const [calculationResults, setCalculationResults] = useState<EOMResult[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [cyclesData, crewData] = await Promise.all([
            eomService.getCycles(),
            eomService.getActiveCrew()
        ]);
        setCycles(cyclesData);
        setCrew(crewData);
    };

    const createCycle = async () => {
        if (cycles.some(c => c.id === selectedMonth)) {
            alert("Cycle already exists for this month.");
            return;
        }

        const newCycle: EOMCycle = {
            id: selectedMonth,
            monthName: format(new Date(selectedMonth + "-01"), 'MMMM yyyy'),
            status: 'OPEN'
        };

        await eomService.createCycle(newCycle);
        loadData();
        alert("Voting Period Opened!");
    };

    const updateStatus = async (cycleId: string, status: EOMCycle['status']) => {
        await eomService.updateCycleStatus(cycleId, status);
        loadData();
    };

    const loadScoringData = async (cycleId: string) => {
        setScoringCycleId(cycleId);
        const scores = await eomService.getScoresForCycle(cycleId);
        
        const existing: Record<string, number> = {};
        scores.forEach(s => {
            existing[s.nomineeId] = s.score;
        });
        setMgmtScores(existing);
        setActiveTab('SCORING');
    };

    const saveScore = async (nomineeId: string, score: number) => {
        setMgmtScores(prev => ({ ...prev, [nomineeId]: score }));
        await eomService.saveMgmtScore(scoringCycleId, nomineeId, score);
    };

    const calculateWinner = async (cycleId: string) => {
        if (!cycleId) { alert("No cycle selected."); return; }
        setIsProcessing(true);

        try {
            const [cycleVotes, cycleScores] = await Promise.all([
                eomService.getVotesForCycle(cycleId),
                eomService.getScoresForCycle(cycleId)
            ]);

            const voteCounts: Record<string, number> = {};
            let maxVotes = 0;
            cycleVotes.forEach(v => {
                const nid = v.nomineeId?.trim();
                if (nid) {
                    voteCounts[nid] = (voteCounts[nid] || 0) + 1;
                    if (voteCounts[nid] > maxVotes) maxVotes = voteCounts[nid];
                }
            });

            if (cycleVotes.length === 0) {
                alert("Warning: No votes found for this cycle. Calculation will be based on management scores only.");
            }

            const maxRawScore = 10; 

            const results: EOMResult[] = crew.map(c => {
                const votesReceived = voteCounts[c.id!] || 0;
                const mgmtScore = cycleScores.find(s => s.nomineeId === c.id!)?.score || 0;

                const normVote = maxVotes > 0 ? (votesReceived / maxVotes) * 100 : 0;
                const normMgmt = (mgmtScore / maxRawScore) * 100;

                const final = (normVote * 0.8) + (normMgmt * 0.2);

                return {
                    nomineeId: c.id!,
                    nomineeName: c.crewName,
                    voteCount: votesReceived,
                    voteScoreNormalized: normVote,
                    mgmtScoreRaw: mgmtScore,
                    mgmtScoreNormalized: normMgmt,
                    finalScore: parseFloat(final.toFixed(2))
                };
            });

            results.sort((a,b) => b.finalScore - a.finalScore);
            setCalculationResults(results);
            setActiveTab('RESULTS');

        } catch (e: any) {
            console.error("Calculation Error:", e);
            alert(`Error calculating results: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const confirmWinner = async (e: React.MouseEvent, result: EOMResult) => {
        e.stopPropagation();
        
        let targetCycleId = scoringCycleId;
        if (!targetCycleId) {
            const activeCycle = cycles.find(c => c.status === 'SCORING' || c.status === 'VOTING');
            if (activeCycle) targetCycleId = activeCycle.id;
        }

        if (!targetCycleId) {
             alert("System Error: Could not identify the active Cycle ID.");
             return;
        }

        if (!window.confirm(`Declare ${result.nomineeName} as the Winner for cycle ${targetCycleId}? \n\nThis will CLOSE the cycle.`)) return;
        
        setIsProcessing(true);
        try {
             await eomService.finalizeWinner(targetCycleId, result.nomineeId, result.nomineeName);
             alert("Winner Declared Successfully!");
             await loadData();
             setActiveTab('CYCLES');
        } catch (err: any) {
            alert("Failed to confirm winner: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Trophy className="w-8 h-8 text-amber-500"/> Employee of the Month
                </h2>
                <div className="flex bg-white rounded-xl p-1 shadow-sm">
                    <button onClick={() => setActiveTab('CYCLES')} className={`px-4 py-2 text-sm font-bold rounded-lg ${activeTab === 'CYCLES' ? 'bg-amber-100 text-amber-800' : 'text-slate-500'}`}>Cycles</button>
                    <button onClick={() => setActiveTab('SCORING')} className={`px-4 py-2 text-sm font-bold rounded-lg ${activeTab === 'SCORING' ? 'bg-amber-100 text-amber-800' : 'text-slate-500'}`}>Scoring</button>
                    <button onClick={() => setActiveTab('RESULTS')} className={`px-4 py-2 text-sm font-bold rounded-lg ${activeTab === 'RESULTS' ? 'bg-amber-100 text-amber-800' : 'text-slate-500'}`}>Results</button>
                </div>
            </div>

            {activeTab === 'CYCLES' && (
                <div className="space-y-6">
                    <Card title="Manage Cycles">
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Period</label>
                                <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                            </div>
                            <Button className="!w-auto" onClick={createCycle}>Start New Cycle</Button>
                        </div>
                    </Card>
                    <div className="grid gap-4">
                        {cycles.map(c => (
                            <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg">{c.monthName}</h3>
                                        <Badge variant={c.status === 'COMPLETED' ? 'success' : c.status === 'OPEN' ? 'success' : 'warning'}>{c.status}</Badge>
                                    </div>
                                    {c.winnerName && <div className="text-amber-600 font-bold text-sm mt-1 flex items-center gap-1"><Crown className="w-4 h-4"/> Winner: {c.winnerName}</div>}
                                </div>
                                <div className="flex gap-2">
                                    {c.status === 'OPEN' && (
                                        <Button variant="secondary" className="!w-auto !py-1 !text-xs" onClick={() => updateStatus(c.id, 'SCORING')}>Stop Voting & Start Scoring</Button>
                                    )}
                                    {c.status === 'SCORING' && (
                                        <Button variant="primary" className="!w-auto !py-1 !text-xs !bg-amber-500" onClick={() => loadScoringData(c.id)}>Input Scores</Button>
                                    )}
                                    {c.status === 'COMPLETED' && (
                                        <Button variant="outline" className="!w-auto !py-1 !text-xs" disabled>Closed</Button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {cycles.length === 0 && <p className="text-slate-400 text-center py-8">No cycles found.</p>}
                    </div>
                </div>
            )}

            {activeTab === 'SCORING' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-4 bg-amber-50 p-4 rounded-xl text-amber-800 border border-amber-100">
                        <AlertCircle className="w-6 h-6"/>
                        <div>
                            <p className="font-bold">Scoring Phase: {scoringCycleId}</p>
                            <p className="text-sm">Rate each employee from 1-10. This counts for 20% of the final score.</p>
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-4">Employee</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4 text-center">Mgmt Score (1-10)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {crew.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-bold text-black">{c.crewName}</td>
                                        <td className="p-4 text-slate-500">{c.role}</td>
                                        <td className="p-4 flex justify-center">
                                            <input 
                                                type="number" 
                                                min="0" max="10" 
                                                className="w-16 p-2 border rounded-lg text-center font-bold"
                                                value={mgmtScores[c.id!] || 0}
                                                onChange={(e) => saveScore(c.id!, parseInt(e.target.value))}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="flex justify-end">
                        <Button className="!w-auto !bg-indigo-600" onClick={() => calculateWinner(scoringCycleId)} isLoading={isProcessing}>
                            <BarChart3 className="w-4 h-4 mr-2"/> Calculate Final Results
                        </Button>
                    </div>
                </div>
            )}

            {activeTab === 'RESULTS' && (
                <div className="space-y-6 animate-in slide-in-from-right">
                    <div className="bg-indigo-900 text-white p-6 rounded-3xl text-center shadow-2xl">
                        <h3 className="text-indigo-200 font-bold uppercase tracking-widest text-xs mb-2">Projected Winner</h3>
                        {calculationResults.length > 0 ? (
                            <div>
                                <div className="text-4xl font-bold mb-2">{calculationResults[0].nomineeName}</div>
                                <div className="text-2xl font-mono text-amber-400">{calculationResults[0].finalScore.toFixed(1)} Pts</div>
                                <div className="mt-6">
                                    <button 
                                        type="button"
                                        onClick={(e) => confirmWinner(e, calculationResults[0])} 
                                        disabled={isProcessing}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 mx-auto shadow-lg shadow-amber-900/30 transition-transform active:scale-95 disabled:opacity-50"
                                    >
                                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Crown className="w-5 h-5"/>}
                                        {isProcessing ? "Publishing..." : "Confirm & Publish Winner"}
                                    </button>
                                </div>
                            </div>
                        ) : <p>No data calculated</p>}
                    </div>

                    <Card title="Calculation Breakdown">
                         <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-3">Rank</th>
                                        <th className="p-3">Name</th>
                                        <th className="p-3 text-center">Votes (80%)</th>
                                        <th className="p-3 text-center">Mgmt (20%)</th>
                                        <th className="p-3 text-right">Final Score</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {calculationResults.map((r, i) => (
                                        <tr key={r.nomineeId} className={i===0 ? 'bg-amber-50' : ''}>
                                            <td className="p-3 font-bold text-slate-400">#{i+1}</td>
                                            <td className="p-3 font-bold text-black">{r.nomineeName}</td>
                                            <td className="p-3 text-center">
                                                <div className="text-xs text-slate-500">{r.voteCount} votes</div>
                                                <div className="font-mono text-indigo-600 font-bold">{r.voteScoreNormalized.toFixed(0)}</div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="text-xs text-slate-500">{r.mgmtScoreRaw}/10</div>
                                                <div className="font-mono text-emerald-600 font-bold">{r.mgmtScoreNormalized.toFixed(0)}</div>
                                            </td>
                                            <td className="p-3 text-right font-bold text-lg">{r.finalScore.toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
