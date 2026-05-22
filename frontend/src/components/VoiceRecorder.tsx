import { useState, useRef, useCallback } from 'react';
import { uploadConversationAudio } from '../services/api';

interface Props {
  customerId?: string;
  onUploadComplete: (conversation: import('../types').SalesConversation) => void;
}

export default function VoiceRecorder({ customerId, onUploadComplete }: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'uploading' | 'error'>('idle');
  const [duration, setDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    setError('');
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        handleUpload();
      };
      recorder.start(250);
      setState('recording');
      let seconds = 0;
      timerRef.current = window.setInterval(() => { seconds++; setDuration(seconds); }, 1000);
    } catch {
      setState('error');
      setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
    }
  }, [customerId]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleUpload = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (blob.size === 0) { setState('idle'); setDuration(0); return; }
    setState('uploading');
    setUploadProgress(0);
    try {
      const conv = await uploadConversationAudio(blob, customerId, duration, setUploadProgress);
      setState('idle');
      setDuration(0);
      onUploadComplete(conv);
    } catch (e: unknown) {
      setState('error');
      setError(e instanceof Error ? e.message : '上传失败');
    }
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col items-center py-10">
      {state === 'idle' && (
        <button onClick={startRecording} className="w-20 h-20 rounded-full bg-[#238636] hover:bg-[#2ea043] flex items-center justify-center transition-all duration-200 shadow-lg shadow-[#238636]/25 active:scale-95">
          <svg className="w-8 h-8 text-white" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/>
            <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5Z"/>
          </svg>
        </button>
      )}

      {state === 'requesting' && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-[#21262d] animate-pulse flex items-center justify-center">
            <svg className="w-8 h-8 text-[#8b949e]" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5Z"/></svg>
          </div>
          <span className="text-sm text-[#8b949e]">请求麦克风权限...</span>
        </div>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-[#f85149] flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
            </div>
            <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-[#f85149] animate-ping opacity-20" />
          </div>
          <span className="text-2xl font-mono text-[#e6edf3] tabular-nums">{formatTime(duration)}</span>
          <button onClick={stopRecording} className="px-4 py-2 rounded-md bg-[#f85149] hover:bg-[#da3633] text-white text-sm font-medium transition-colors">
            停止录音
          </button>
        </div>
      )}

      {state === 'uploading' && (
        <div className="flex flex-col items-center gap-3 w-64">
          <span className="text-sm text-[#8b949e]">上传中...</span>
          <div className="w-full bg-[#21262d] rounded-full h-2">
            <div className="bg-[#238636] h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="text-xs text-[#484f58]">{uploadProgress}%</span>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-[#21262d] flex items-center justify-center border border-[#f85149]">
            <svg className="w-8 h-8 text-[#f85149]" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm1.78-4.78a.75.75 0 0 1-1.06 1.06L8 9.06l-.72.72a.75.75 0 1 1-1.06-1.06L6.94 8l-.72-.72a.75.75 0 0 1 1.06-1.06L8 6.94l.72-.72a.75.75 0 1 1 1.06 1.06L9.06 8l.72.72Z"/></svg>
          </div>
          <p className="text-sm text-[#f85149] text-center max-w-xs">{error}</p>
          <button onClick={() => setState('idle')} className="px-3 py-1.5 text-xs text-[#e6edf3] bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-colors">重试</button>
        </div>
      )}

      {state === 'idle' && (
        <p className="mt-3 text-xs text-[#484f58]">点击开始录音</p>
      )}
    </div>
  );
}
