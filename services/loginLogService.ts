
import { db, firebase } from '../firebaseConfig';
import { LoginLog } from '../types';

const COLLECTION = 'loginLogs';

// Parse the user agent into a short, human-readable device summary.
const describeDevice = (ua: string): string => {
    if (!ua) return 'Unknown device';

    let os = 'Unknown OS';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Browser';
    // Order matters: Edge/Chrome both contain "Chrome"; check the more specific first.
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/CriOS/i.test(ua)) browser = 'Chrome';
    else if (/FxiOS|Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua)) browser = 'Safari';

    return `${os} · ${browser}`;
};

export const loginLogService = {
    // Fire-and-forget: records a successful login. Never throws — a failed
    // audit write must not block the user from getting into the app.
    record: (entry: Omit<LoginLog, 'id' | 'timestamp' | 'device' | 'userAgent'>) => {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        const payload: any = {
            ...entry,
            device: describeDevice(ua),
            userAgent: ua,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        };
        // Strip undefined fields (Firestore rejects them).
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        db.collection(COLLECTION).add(payload).catch(err => {
            console.warn('Login log write failed (non-blocking):', err);
        });
    },

    // Admin: fetch recent login records, newest first.
    getRecent: async (max: number = 500): Promise<LoginLog[]> => {
        const snap = await db.collection(COLLECTION)
            .orderBy('timestamp', 'desc')
            .limit(max)
            .get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as LoginLog));
    },
};
