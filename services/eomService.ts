
import { db, firebase } from '../firebaseConfig';
import { EOMCycle, CrewMember, EOMVote, EOMScore, EOMResult } from '../types';

export const eomService = {
    // --- CYCLES ---
    getCycles: async (): Promise<EOMCycle[]> => {
        const snap = await db.collection('eom_cycles').orderBy('id', 'desc').get();
        return snap.docs.map(d => d.data() as EOMCycle);
    },

    getActiveCycle: async (): Promise<EOMCycle | null> => {
        const snap = await db.collection('eom_cycles')
            .where('status', 'in', ['OPEN', 'VOTING']) 
            .limit(1)
            .get();
        return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id } as EOMCycle;
    },

    // Optimized: Remove server-side sort on 'id' when filtering by 'status' to avoid composite index
    getPastWinners: async (): Promise<EOMCycle[]> => {
        const snap = await db.collection('eom_cycles')
            .where('status', '==', 'COMPLETED')
            .limit(20)
            .get();
            
        const cycles = snap.docs.map(d => d.data() as EOMCycle);
        // Sort descending by ID (YYYY-MM string) in memory
        return cycles.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10);
    },

    createCycle: async (cycle: EOMCycle) => {
        return await db.collection('eom_cycles').doc(cycle.id).set(cycle);
    },

    updateCycleStatus: async (id: string, status: EOMCycle['status']) => {
        return await db.collection('eom_cycles').doc(id).update({ status });
    },

    finalizeWinner: async (cycleId: string, winnerId: string, winnerName: string) => {
        return await db.collection('eom_cycles').doc(cycleId).update({
            status: 'COMPLETED',
            winnerId,
            winnerName,
            calculatedAt: new Date()
        });
    },

    // --- CREW ---
    getActiveCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    // --- VOTES ---
    castVote: async (cycleId: string, voterId: string, nomineeId: string) => {
        return await db.collection('eom_votes').add({
            cycleId,
            voterId,
            nomineeId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    getMyVote: async (cycleId: string, voterId: string): Promise<string | null> => {
        const snap = await db.collection('eom_votes')
            .where('cycleId', '==', cycleId)
            .where('voterId', '==', voterId)
            .limit(1)
            .get();
        return snap.empty ? null : snap.docs[0].data().nomineeId;
    },

    getVotesForCycle: async (cycleId: string): Promise<EOMVote[]> => {
        const snap = await db.collection('eom_votes').where('cycleId', '==', cycleId).get();
        return snap.docs.map(d => d.data() as EOMVote);
    },

    // --- SCORES ---
    saveMgmtScore: async (cycleId: string, nomineeId: string, score: number) => {
        const docId = `${cycleId}_${nomineeId}`;
        return await db.collection('eom_scores').doc(docId).set({
            cycleId,
            nomineeId,
            score,
            managerId: 'ADMIN_OVERRIDE' // Simplification for now
        });
    },

    getScoresForCycle: async (cycleId: string): Promise<EOMScore[]> => {
        const snap = await db.collection('eom_scores').where('cycleId', '==', cycleId).get();
        return snap.docs.map(d => d.data() as EOMScore);
    }
};
