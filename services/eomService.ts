
import { db, firebase } from '../firebaseConfig';
import { EOMCycle, CrewMember, CrewDirectoryEntry, EOMVote, EOMScore, EOMResult } from '../types';

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

    // Crew-safe nominee list: /crew is manager-or-self readable (it holds login
    // codes), so the voting screen reads the /crewDirectory mirror instead.
    getNomineeDirectory: async (): Promise<CrewDirectoryEntry[]> => {
        const snap = await db.collection('crewDirectory').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewDirectoryEntry));
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

    // altId: legacy votes may be stored under the crew doc ID instead of the
    // auth UID; check both so old voters don't see the ballot again.
    getMyVote: async (cycleId: string, voterId: string, altId?: string): Promise<string | null> => {
        const fetch = (id: string) => db.collection('eom_votes')
            .where('cycleId', '==', cycleId)
            .where('voterId', '==', id)
            .limit(1)
            .get();

        const snap = await fetch(voterId);
        if (!snap.empty) return snap.docs[0].data().nomineeId;

        if (altId && altId !== voterId) {
            const altSnap = await fetch(altId);
            if (!altSnap.empty) return altSnap.docs[0].data().nomineeId;
        }
        return null;
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
