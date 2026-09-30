import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, getFirestore as firestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const getAdmin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Training service is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { db: getFirestore(), auth: getAuth() };
};
const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  try {
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, { error: 'Sign in is required.' });
    const { db, auth } = getAdmin();
    const user = await auth.verifyIdToken(token);
    const assignmentId = String(req.body?.assignmentId || '');
    const answers = req.body?.answers;
    if (!assignmentId || !answers || typeof answers !== 'object') return send(res, 400, { error: 'Invalid quiz submission.' });

    const assignmentRef = db.collection('trainingAssignments').doc(assignmentId);
    const assignmentSnap = await assignmentRef.get();
    if (!assignmentSnap.exists || assignmentSnap.data()?.employeeUid !== user.uid) return send(res, 403, { error: 'This training assignment is not yours.' });
    const assignment = assignmentSnap.data()!;
    const [moduleSnap, keySnap] = await Promise.all([
      db.collection('trainingModules').doc(assignment.moduleId).get(),
      db.collection('trainingAssessmentKeys').doc(assignment.moduleVersionId).get(),
    ]);
    if (!moduleSnap.exists || moduleSnap.data()?.status !== 'PUBLISHED' || !keySnap.exists) return send(res, 409, { error: 'This assessment is unavailable.' });
    const module = moduleSnap.data()!;
    const previous = Array.isArray(assignment.quizResults) ? assignment.quizResults : [];
    if (previous.length >= (module.quizAttemptLimit || 2)) return send(res, 429, { error: 'No quiz attempts remain. Please speak with your manager.' });
    const keys = keySnap.data()?.answers || [];
    if (!Array.isArray(keys) || !keys.length) return send(res, 409, { error: 'This quiz has not been configured yet.' });
    const correct = keys.filter((key: any) => {
      const value = answers[key.questionId];
      const submitted = Array.isArray(value) ? value.map(normalise).sort().join('|') : normalise(value);
      const expected = (key.acceptedAnswers || []).map(normalise).sort().join('|');
      return submitted === expected;
    }).length;
    const score = Math.round((correct / keys.length) * 100);
    const passed = score >= (module.minimumPassingScore || 80);
    const result = { attempt: previous.length + 1, score, passed, submittedAt: Timestamp.now() };
    const nextStatus = passed ? (module.practicalTestRequired ? 'ASSESSMENT_PENDING' : 'PASSED') : 'LEARNING';
    await assignmentRef.update({ quizResults: [...previous, result], status: nextStatus, updatedAt: FieldValue.serverTimestamp() });
    const tenantId = String(process.env.LEGACY_TENANT_ID || '').trim();
    await db.collection('trainingAudit').add({ actorId: user.uid, action: 'KNOWLEDGE_TESTED', employeeId: assignment.employeeId, employeeName: assignment.employeeName, moduleId: assignment.moduleId, moduleVersionId: assignment.moduleVersionId, outletId: assignment.outletId, previousStatus: assignment.status, newStatus: nextStatus, notes: `Quiz attempt ${result.attempt}: ${score}%`, createdAt: FieldValue.serverTimestamp(), ...(tenantId ? { tenantId } : {}) });
    return send(res, 200, { score, passed, attemptsRemaining: Math.max(0, (module.quizAttemptLimit || 2) - result.attempt), status: nextStatus });
  } catch (error: any) {
    console.error('Training quiz endpoint failed:', error?.message || error);
    return send(res, 503, { error: 'Training assessment is temporarily unavailable. Please try again later.' });
  }
}
