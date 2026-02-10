

import React, { useState, useRef } from 'react';
import { Loader2, X, Share2, Download, Mic, Square, Play } from 'lucide-react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline', isLoading?: boolean }> = ({ 
  children, variant = 'primary', className = '', isLoading, disabled, ...props 
}) => {
  // Increased border radius to rounded-2xl for softer look
  const baseStyle = "w-full py-3.5 px-6 rounded-2xl font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-sm tracking-wide";
  
  const variants = {
    // Vibrant Emerald Green primary button
    primary: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-xl shadow-emerald-200 border border-transparent",
    // Softer secondary button
    secondary: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-transparent",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
    outline: "bg-transparent border-2 border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700",
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${disabled || isLoading ? 'opacity-60 pointer-events-none grayscale' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input 
    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:outline-none focus:ring-0 focus:border-emerald-400 transition-all text-slate-800 placeholder:text-slate-400 font-medium disabled:opacity-50"
    {...props}
  />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea 
    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:outline-none focus:ring-0 focus:border-emerald-400 transition-all text-slate-800 placeholder:text-slate-400 font-medium disabled:opacity-50 min-h-[120px] resize-y"
    {...props}
  />
);

export const Checkbox: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input 
    type="checkbox" 
    className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
    {...props} 
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <div className="relative">
    <select 
      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:outline-none focus:ring-0 focus:border-emerald-400 transition-all text-slate-800 font-medium appearance-none"
      {...props}
    />
    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
      ▼
    </div>
  </div>
);

// Increased radius to rounded-3xl and removed harsh borders for "Float" effect
export const Card: React.FC<{ children: React.ReactNode, className?: string, title?: string }> = ({ children, className = '', title }) => (
  <div className={`bg-white rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-5 border-b border-slate-50">
        <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode, variant?: 'success' | 'warning' | 'neutral' | 'danger' }> = ({ children, variant = 'neutral', className = '', ...props }) => {
  const styles = {
    success: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-100 text-amber-700 border border-amber-200",
    danger: "bg-red-100 text-red-700 border border-red-200",
    neutral: "bg-slate-100 text-slate-600 border border-slate-200"
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${styles[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};

export const FullScreenImageViewer: React.FC<{ src: string, alt?: string, children: React.ReactNode }> = ({ src, alt, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  if (!src) return <>{children}</>;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proof-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed", err);
      window.open(src, '_blank');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSharing(true);
    try {
      // 1. Fetch blob to share actual file if possible (Mobile native share)
      const response = await fetch(src);
      const blob = await response.blob();
      const file = new File([blob], "order_proof.jpg", { type: "image/jpeg" });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Order Proof',
          text: 'Here is the packing photo for the order.'
        });
      } else {
        // 2. Fallback for Desktop: Open WhatsApp Web or Copy Link
        const text = encodeURIComponent(`Here is the order proof photo: ${src}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
      }
    } catch (err) {
      console.error("Share failed", err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer">
        {children}
      </div>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          {/* Toolbar */}
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <button 
              className="p-3 bg-white/10 text-white rounded-full hover:bg-emerald-500 hover:text-white transition-all backdrop-blur-md"
              onClick={handleShare}
              disabled={isSharing}
              title="Share via WhatsApp"
            >
              {isSharing ? <Loader2 className="w-6 h-6 animate-spin"/> : <Share2 className="w-6 h-6" />}
            </button>
            <button 
              className="p-3 bg-white/10 text-white rounded-full hover:bg-emerald-500 hover:text-white transition-all backdrop-blur-md"
              onClick={handleDownload}
              title="Save to Phone"
            >
              <Download className="w-6 h-6" />
            </button>
            <button 
              className="p-3 bg-white/10 text-white rounded-full hover:bg-red-500 hover:text-white transition-all backdrop-blur-md ml-2"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <img 
            src={src} 
            alt={alt || 'Full screen view'} 
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </>
  );
};

export const AudioRecorder: React.FC<{ onRecordingComplete: (blob: Blob) => void }> = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        onRecordingComplete(blob);
        stream.getTracks().forEach(track => track.stop()); // Stop mic
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimer(0);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } catch (err) {
      console.error("Mic error", err);
      alert("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
      {!audioBlob && !isRecording && (
        <button 
          onClick={startRecording}
          className="flex flex-col items-center gap-2 group"
        >
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-200 transition-transform group-hover:scale-110">
            <Mic className="w-8 h-8" />
          </div>
          <span className="text-sm font-bold text-slate-500">Tap to Record</span>
        </button>
      )}

      {isRecording && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-2xl font-mono font-bold text-red-500 animate-pulse">
            {formatTime(timer)}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase tracking-widest">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
            Recording
          </div>
          <button 
            onClick={stopRecording}
            className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2"
          >
            <Square className="w-4 h-4 fill-white" /> Stop
          </button>
        </div>
      )}

      {audioBlob && (
        <div className="w-full flex items-center gap-3">
          <audio controls src={URL.createObjectURL(audioBlob)} className="w-full h-10 rounded-lg" />
          <button 
            onClick={deleteRecording}
            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};