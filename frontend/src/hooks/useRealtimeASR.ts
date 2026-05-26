import { useState, useRef, useCallback, useEffect } from 'react';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  isPartial: boolean;
}

export type ConnectionState = 'idle' | 'connecting' | 'streaming' | 'disconnected';

export interface UseRealtimeASRState {
  isRecording: boolean;
  connectionState: ConnectionState;
  transcript: TranscriptSegment[];
  partialText: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const MAX_RECONNECT = 3;

/** Derive the WebSocket URL from VITE_API_BASE, stripping /api and using ws:// */
function getWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';
  const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  const token = localStorage.getItem('token');
  return `${wsBase}/ws/realtime/session?token=${token || ''}`;
}

/**
 * Custom hook that manages a real-time WebSocket ASR connection.
 *
 * Captures audio from the microphone via MediaRecorder, sends raw audio
 * chunks over a WebSocket, and accumulates JSON transcript segments.
 */
export function useRealtimeASR(): UseRealtimeASRState {
  const [isRecording, setIsRecording] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Mutable refs to avoid stale closures in event handlers
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalStopRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Keep the ref in sync so the reconnect callback sees the latest value
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  /** Fully tear down: stop media, close socket, reset state. */
  const stop = useCallback(() => {
    intentionalStopRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRecording(false);
    setConnectionState('idle');
    setPartialText('');
    reconnectCountRef.current = 0;
  }, []);

  /** Create and wire up a WebSocket, returning it so the caller can store it. */
  const createWebSocket = useCallback(
    (url: string): WebSocket => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setConnectionState('streaming');
        setError(null);
        reconnectCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'transcript') {
            if (data.isPartial) {
              setPartialText(data.text ?? '');
            } else {
              setTranscript((prev) => [
                ...prev,
                {
                  start: data.start ?? 0,
                  end: data.end ?? 0,
                  text: data.text ?? '',
                  confidence: data.confidence ?? 0,
                  isPartial: false,
                },
              ]);
              setPartialText('');
            }
          } else if (data.type === 'error') {
            setError(data.message || '转录服务出错');
          }
        } catch {
          // Non-JSON messages (e.g. binary echo) are silently ignored
        }
      };

      ws.onclose = () => {
        if (intentionalStopRef.current) {
          setConnectionState('idle');
          return;
        }

        setConnectionState('disconnected');

        // Auto-reconnect with exponential backoff
        if (reconnectCountRef.current < MAX_RECONNECT && isRecordingRef.current) {
          const delay = Math.pow(2, reconnectCountRef.current) * 1000; // 1 s, 2 s, 4 s
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (!intentionalStopRef.current && isRecordingRef.current) {
              wsRef.current = createWebSocket(getWsUrl());
            }
          }, delay);
        } else if (reconnectCountRef.current >= MAX_RECONNECT) {
          setError('连接断开，已达最大重连次数。请检查网络后重新开始。');
          stop();
        }
      };

      ws.onerror = () => {
        // onclose will fire after this; we handle state transitions there
      };

      return ws;
    },
    [stop],
  );

  /** Request microphone, spin up MediaRecorder, open WebSocket. */
  const start = useCallback(async () => {
    // Stop any previous session first
    if (isRecordingRef.current || wsRef.current || recorderRef.current) {
      stop();
    }

    setError(null);
    setTranscript([]);
    setPartialText('');
    intentionalStopRef.current = false;
    reconnectCountRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Select a supported MIME type, falling back to browser default
      let mimeType = '';
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        '',
      ];
      for (const t of candidates) {
        if (t === '' || MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      setConnectionState('connecting');
      const ws = createWebSocket(getWsUrl());
      wsRef.current = ws;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      // timeslice of 100 ms — the hook fires ondataavailable every ~100 ms
      recorder.start(100);
      setIsRecording(true);
    } catch (err: unknown) {
      const e = err as DOMException;
      let message: string;
      if (e?.name === 'NotAllowedError') {
        message = '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风';
      } else if (e?.name === 'NotFoundError') {
        message = '未找到麦克风设备';
      } else {
        message = `启动录音失败: ${e?.message || '未知错误'}`;
      }
      setError(message);
      setConnectionState('idle');
    }
  }, [stop, createWebSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isRecording,
    connectionState,
    transcript,
    partialText,
    error,
    start,
    stop,
  };
}
