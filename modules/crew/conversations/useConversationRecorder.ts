
import { useEffect, useRef, useState } from 'react';
import { CurrentUser, ConversationConfig } from '../../../types';
import { conversationService } from '../../../services/conversationService';

export type ConversationRecorderStatus = 'off' | 'recording' | 'mic-blocked';

// Background recorder for the counter tablet. It follows the admin's remote
// switch (settings/conversationConfig.recordingEnabled) and, while enabled,
// records the mic in self-contained chunks of chunkMinutes each.
//
// Chunking is done by stopping and restarting the MediaRecorder — NOT via
// timeslice — because timeslice fragments only play as part of the original
// stream; each uploaded file must be independently playable.
export const useConversationRecorder = (currentUser: CurrentUser, active: boolean) => {
    const [status, setStatus] = useState<ConversationRecorderStatus>('off');
    const [pendingUploads, setPendingUploads] = useState(0);

    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const rotateTimerRef = useRef<any>(null);
    const enabledRef = useRef(false);
    const configRef = useRef<ConversationConfig | null>(null);
    const userRef = useRef(currentUser);
    userRef.current = currentUser;

    useEffect(() => {
        if (!active) return;

        const publishState = (state: 'recording' | 'stopped' | 'mic-blocked') => {
            const u = userRef.current;
            conversationService.setDeviceStatus(u.uid, { state, name: u.name || 'Counter', outletId: u.outletId });
        };

        const uploadWithRetry = (blob: Blob, startedAt: Date, durationSec: number, attempt = 0) => {
            const u = userRef.current;
            conversationService.uploadChunk(blob, {
                durationSec,
                recordedById: u.uid,
                recordedByName: u.name || 'Counter',
                outletId: u.outletId,
                startedAt
            }).then(() => {
                setPendingUploads(p => Math.max(0, p - 1));
            }).catch(err => {
                // Keep the blob in memory and back off; a chunk is ~1-2MB so a
                // long offline stretch stays well within tablet memory.
                console.warn(`chunk upload failed (attempt ${attempt + 1}):`, err?.code || err?.message);
                const delay = Math.min(60_000, 5_000 * Math.pow(2, attempt));
                setTimeout(() => uploadWithRetry(blob, startedAt, durationSec, attempt + 1), delay);
            });
        };

        const beginChunk = () => {
            const stream = streamRef.current;
            if (!stream || !enabledRef.current) return;

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined;
            // 32kbps Opus is plenty for speech: ~1.2MB per 5-minute chunk,
            // far under the 10MB storage-rule cap.
            const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
            recorderRef.current = recorder;
            const chunkStarted = new Date();
            const parts: BlobPart[] = [];

            recorder.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
            recorder.onstop = () => {
                const durationSec = Math.round((Date.now() - chunkStarted.getTime()) / 1000);
                // Ignore sub-3s fragments from rapid toggles.
                if (durationSec >= 3 && parts.length > 0) {
                    const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
                    setPendingUploads(p => p + 1);
                    uploadWithRetry(blob, chunkStarted, durationSec);
                }
                if (enabledRef.current && streamRef.current) beginChunk();
            };

            recorder.start();
            const chunkMs = Math.max(1, configRef.current?.chunkMinutes || 5) * 60_000;
            rotateTimerRef.current = setTimeout(() => {
                if (recorder.state !== 'inactive') recorder.stop();
            }, chunkMs);
        };

        const start = async () => {
            if (streamRef.current) return;
            try {
                streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                setStatus('recording');
                publishState('recording');
                beginChunk();
            } catch (err) {
                console.warn('Conversation recorder: mic unavailable', err);
                enabledRef.current = false;
                setStatus('mic-blocked');
                publishState('mic-blocked');
            }
        };

        const stop = (publish: boolean) => {
            clearTimeout(rotateTimerRef.current);
            const recorder = recorderRef.current;
            if (recorder && recorder.state !== 'inactive') recorder.stop(); // flushes the final partial chunk
            recorderRef.current = null;
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            setStatus('off');
            if (publish) publishState('stopped');
        };

        const unsubscribe = conversationService.subscribeConfig(cfg => {
            configRef.current = cfg;
            if (cfg.recordingEnabled && !enabledRef.current) {
                enabledRef.current = true;
                start();
            } else if (!cfg.recordingEnabled && enabledRef.current) {
                enabledRef.current = false;
                stop(true);
            }
        });

        return () => {
            unsubscribe();
            if (enabledRef.current) {
                enabledRef.current = false;
                stop(true);
            }
        };
    }, [active]);

    return { status, pendingUploads };
};
