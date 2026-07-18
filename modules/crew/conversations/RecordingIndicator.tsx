
import React from 'react';
import { Mic, MicOff, CloudUpload } from 'lucide-react';
import { ConversationRecorderStatus } from './useConversationRecorder';

// Persistent banner on the counter tablet: crew must always be able to see
// that conversation recording is live (or that the mic is blocked).
export const RecordingIndicator: React.FC<{ status: ConversationRecorderStatus; pendingUploads: number }> = ({ status, pendingUploads }) => {
    if (status === 'off') return null;

    if (status === 'mic-blocked') {
        return (
            <div className="mx-[-1rem] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold">
                <MicOff className="w-4 h-4" />
                Conversation recording is ON but the microphone is blocked — allow mic access in the browser.
            </div>
        );
    }

    return (
        <div className="mx-[-1rem] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <Mic className="w-4 h-4" />
            Conversations are being recorded for training
            {pendingUploads > 0 && (
                <span className="flex items-center gap-1 opacity-80 font-normal">
                    <CloudUpload className="w-3.5 h-3.5" /> {pendingUploads} uploading
                </span>
            )}
        </div>
    );
};
