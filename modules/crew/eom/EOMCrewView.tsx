
import React, { useState, useEffect } from 'react';
import { eomService } from '../../../services/eomService';
import { CrewDirectoryEntry, CurrentUser, EOMCycle } from '../../../types';
import { Trophy, Vote, Award, Crown, CheckCircle, Calendar, ThumbsUp, Loader2 } from 'lucide-react';

export const EOMCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const [activeCycle, setActiveCycle] = useState<EOMCycle | null>(null);
    const [nominees, setNominees] = useState<CrewDirectoryEntry[]>([]);
    const [myVote, setMyVote] = useState<string | null>(null);
    const [pastWinners, setPastWinners] = useState<EOMCycle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI State for voting interaction
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [isVoting, setIsVoting] = useState(false);

    const dbId = currentUser.dbId || currentUser.uid;

    useEffect(() => {
        const load = async () => {
            try {
                // 1. Get Open Cycle
                const cycle = await eomService.getActiveCycle();
                
                if (cycle) {
                    setActiveCycle(cycle);
                    // New votes are keyed by auth UID; pass dbId so legacy votes still count
                    const votedNominee = await eomService.getMyVote(cycle.id, currentUser.uid, dbId);
                    if (votedNominee) setMyVote(votedNominee);
                }

                // 2. Get Nominees (Coworkers, exclude self) — from the staff-readable
                // directory mirror; crew accounts can't list the /crew collection.
                const directory = await eomService.getNomineeDirectory();
                setNominees(directory.filter(c => c.id !== dbId && c.id !== currentUser.uid));

                // 3. Past Winners
                const winners = await eomService.getPastWinners();
                setPastWinners(winners);

            } catch (error) {
                console.error("EOM Load Error", error);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [dbId]);

    const handleVoteClick = async (nomineeId: string) => {
        if (!activeCycle) return;
        
        // Step 1: Confirmation
        if (confirmId !== nomineeId) {
            setConfirmId(nomineeId);
            setTimeout(() => setConfirmId(null), 3000);
            return;
        }

        // Step 2: Submit
        setIsVoting(true);
        try {
            // voterId must be the auth UID — security rules check it on create
            await eomService.castVote(activeCycle.id, currentUser.uid, nomineeId);
            setMyVote(nomineeId);
        } catch (e: any) {
            alert(`Failed to vote: ${e.message}`);
        } finally {
            setIsVoting(false);
            setConfirmId(null);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-64"><div className="animate-spin mb-2"><Crown className="w-8 h-8 text-amber-400"/></div>Loading Awards...</div>;

    return (
        <div className="space-y-8 pb-12">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-xl shadow-amber-200">
                <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-full">
                        <Trophy className="w-8 h-8 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Employee of the Month</h2>
                        <p className="text-amber-100 opacity-90">Recognize excellence in your team.</p>
                    </div>
                </div>
            </div>

            {/* Active Voting Section */}
            {activeCycle ? (
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Vote className="w-5 h-5 text-indigo-500"/>
                        Voting for {activeCycle.monthName}
                    </h3>

                    {myVote ? (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl text-center">
                            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600">
                                <CheckCircle className="w-8 h-8"/>
                            </div>
                            <h4 className="text-lg font-bold text-emerald-800">You have voted!</h4>
                            <p className="text-emerald-600">Thanks for participating.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {nominees.map(n => (
                                <div key={n.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center hover:border-indigo-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 text-lg">
                                            {n.crewName[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-700">{n.crewName}</div>
                                            <div className="text-xs text-slate-400">{n.role}</div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); handleVoteClick(n.id!); }}
                                        disabled={isVoting || (confirmId !== null && confirmId !== n.id)}
                                        className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all active:scale-95 ${
                                            confirmId === n.id 
                                                ? 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse' 
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                        } disabled:opacity-50 disabled:scale-100`}
                                    >
                                        {isVoting && confirmId === n.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin"/>
                                        ) : confirmId === n.id ? (
                                            "Confirm?"
                                        ) : (
                                            <>
                                                <ThumbsUp className="w-4 h-4"/> Vote
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-2"/>
                    <p className="text-slate-500 font-bold">Voting is currently closed.</p>
                    <p className="text-xs text-slate-400">Check back later.</p>
                </div>
            )}

            {/* Hall of Fame */}
            {pastWinners.length > 0 && (
                <div>
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-500"/> Hall of Fame
                    </h3>
                    <div className="space-y-3">
                        {pastWinners.map(w => (
                            <div key={w.id} className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                                    <Crown className="w-6 h-6"/>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase">{w.monthName}</div>
                                    <div className="font-bold text-lg text-slate-800">{w.winnerName}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
