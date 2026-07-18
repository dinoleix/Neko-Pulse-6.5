
import React from 'react';
import { MicOff } from 'lucide-react';
import { ConversationRecorderStatus } from './useConversationRecorder';

// Compact recording indicator shown inline in the crew header: a pulsing dot
// + "REC". Deliberately small (owner's choice) but always present while the
// mic is live, so recording is never covert toward staff.
export const RecChip: React.FC<{ status: ConversationRecorderStatus; pendingUploads: number }> = ({ status, pendingUploads }) => {
    if (status !== 'recording') return null;
    return (
        <span
            className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold align-middle"
            title={`Conversations are being recorded for training${pendingUploads > 0 ? ` — ${pendingUploads} chunk(s) uploading` : ''}`}
        >
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            REC
        </span>
    );
};

// The mic-blocked state stays loud: it means the admin thinks recording is on
// but nothing is being captured, and someone at the counter must fix it.
export const RecordingIndicator: React.FC<{ status: ConversationRecorderStatus; pendingUploads: number }> = ({ status }) => {
    if (status !== 'mic-blocked') return null;
    return (
        <div className="mx-[-1rem] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold">
            <MicOff className="w-4 h-4" />
            Conversation recording is ON but the microphone is blocked — allow mic access in the browser.
        </div>
    );
};
