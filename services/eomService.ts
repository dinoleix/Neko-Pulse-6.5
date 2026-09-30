
import { db, firebase } from '../firebaseConfig';
import { EOMCycle, CrewMember, CrewDirectoryEntry, EOMVote, EOMScore, EOMResult } from '../types';
import { currentTenantId, tenantPayload, withTenant } from './tenantScope';

const tenantDocumentId = (tenantId: string | undefined, id: string) => tenantId ? `${tenantId}_${id}` : id;
const nomineeDirectory = async () => {
    const tenantId = await currentTenantId();
    return tenantId
        ? db.collection('tenantSettings').doc(tenantId).collection('crewDirectory')
        : db.collection('crewDirectory');
};

export const eomService = {
    // --- CYCLES ---
    getCycles: async (): Promise<EOMCycle[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('eom_cycles'), tenantId).get();
        return snap.docs.map(d => d.data() as EOMCycle).sort((a, b) => b.id.localeCompare(a.id));
    },

    getActiveCycle: async (): Promise<EOMCycle | null> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('eom_cycles')
            .where('status', 'in', ['OPEN', 'VOTING']), tenantId)
            .limit(1)
            .get();
        return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id } as EOMCycle;
    },

    // Optimized: Remove server-side sort on 'id' when filtering by 'status' to avoid composite index
    getPastWinners: async (): Promise<EOMCycle[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('eom_cycles')
            .where('status', '==', 'COMPLETED'), tenantId)
            .limit(20)
            .get();
            
        const cycles = snap.docs.map(d => d.data() as EOMCycle);
        // Sort descending by ID (YYYY-MM string) in memory
        return cycles.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10);
    },

    createCycle: async (cycle: EOMCycle) => {
        const tenantId = await currentTenantId();
        return await db.collection('eom_cycles').doc(tenantDocumentId(tenantId, cycle.id)).set(await tenantPayload(cycle));
    },

    updateCycleStatus: async (id: string, status: EOMCycle['status']) => {
        const tenantId = await currentTenantId();
        return await db.collection('eom_cycles').doc(tenantDocumentId(tenantId, id)).update({ status });
    },

    finalizeWinner: async (cycleId: string, winnerId: string, winnerName: string) => {
        const tenantId = await currentTenantId();
        return await db.collection('eom_cycles').doc(tenantDocumentId(tenantId, cycleId)).update({
            status: 'COMPLETED',
            winnerId,
            winnerName,
            calculatedAt: new Date()
        });
    },

    // --- CREW ---
    getActiveCrew: async (): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('crew').where('active', '==', true), tenantId).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    // Crew-safe nominee list: /crew is manager-or-self readable (it holds login
    // codes), so the voting screen reads the /crewDirectory mirror instead.
    getNomineeDirectory: async (): Promise<CrewDirectoryEntry[]> => {
        const snap = await (await nomineeDirectory()).where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewDirectoryEntry));
    },

    // --- VOTES ---
    castVote: async (cycleId: string, voterId: string, nomineeId: string) => {
        // Deterministic ID + create-only rules = one vote per person per
        // cycle, enforced server-side. A second cast is permission-denied.
        const tenantId = await currentTenantId();
        return await db.collection('eom_votes').doc(tenantDocumentId(tenantId, `${cycleId}_${voterId}`)).set(await tenantPayload({
            cycleId,
            voterId,
            nomineeId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }));
    },

    // altId: legacy votes may be stored under the crew doc ID instead of the
    // auth UID; check both so old voters don't see the ballot again.
    getMyVote: async (cycleId: string, voterId: string, altId?: string): Promise<string | null> => {
        const tenantId = await currentTenantId();
        const fetch = (id: string) => withTenant(db.collection('eom_votes')
            .where('cycleId', '==', cycleId)
            .where('voterId', '==', id), tenantId)
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
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('eom_votes').where('cycleId', '==', cycleId), tenantId).get();
        return snap.docs.map(d => d.data() as EOMVote);
    },

    // --- SCORES ---
    saveMgmtScore: async (cycleId: string, nomineeId: string, score: number) => {
        const tenantId = await currentTenantId();
        const docId = tenantDocumentId(tenantId, `${cycleId}_${nomineeId}`);
        return await db.collection('eom_scores').doc(docId).set(await tenantPayload({
            cycleId,
            nomineeId,
            score,
            managerId: 'ADMIN_OVERRIDE' // Simplification for now
        }));
    },

    getScoresForCycle: async (cycleId: string): Promise<EOMScore[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('eom_scores').where('cycleId', '==', cycleId), tenantId).get();
        return snap.docs.map(d => d.data() as EOMScore);
    }
};
