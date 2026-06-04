import { useState, useRef, useCallback, useEffect } from 'react';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  isPartial: boolean;
  speaker: string;
  speaker_name: string;
  segment_id: string;      // unique per VAD segment, used for upsert
  calibrated: boolean;     // true = Nano calibration applied
}

export type ConnectionState = 'idle' | 'connecting' | 'streaming' | 'disconnected';

export interface CoachTip {
  trigger: string;
  action: string;
  content: string;
}

export interface UseRealtimeASRState {
  isRecording: boolean;
  connectionState: ConnectionState;
  transcript: TranscriptSegment[];
  error: string | null;
  coachTip: CoachTip | null;
  start: () => Promise<void>;
  stop: () => void;
  sendInterrupt: () => void;
  sendCustomerProfile: (profile: string) => void;
  mediaStream: MediaStream | null;
}

const MAX_RECONNECT = 3;
const TARGET_SAMPLE_RATE = 16000; // 16 kHz PCM mono — matches backend ASR
const BUFFER_SIZE = 512;          // 512 samples = 32 ms per chunk

function getWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE || '/api';
  const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  const token = localStorage.getItem('token');
  return `${wsBase}/ws/realtime/session?token=${token || ''}`;
}

/**
 * Convert a Float32Array of audio samples (-1.0 … 1.0) to Int16 PCM bytes.
 */
function float32ToInt16PCM(float32Array: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16.buffer;
}

/**
 * Real-time ASR hook — captures raw PCM audio from the microphone via
 * AudioContext + ScriptProcessorNode and streams it over WebSocket.
 */
export function useRealtimeASR(): UseRealtimeASRState {
  const [isRecording, setIsRecording] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [coachTip, setCoachTip] = useState<CoachTip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalStopRef = useRef(false);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  /** Fully tear down audio, socket, and reconnect timer. */
  const stop = useCallback(() => {
    intentionalStopRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMediaStream(null);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRecording(false);
    setConnectionState('idle');
    reconnectCountRef.current = 0;
  }, []);

  /** Create a WebSocket wired for message receipt and auto-reconnect. */
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
            const seg: TranscriptSegment = {
              start: data.start ?? 0,
              end: data.end ?? 0,
              text: data.text ?? '',
              confidence: data.confidence ?? 0,
              isPartial: data.is_partial ?? false,
              speaker: data.speaker ?? '',
              speaker_name: data.speaker_name ?? data.speaker ?? '',
              segment_id: data.segment_id ?? '',
              calibrated: data.calibrated ?? false,
            };

            setTranscript((prev) => {
              // Upsert by segment_id: replace if exists, append if new
              const idx = prev.findIndex(
                (s) => s.segment_id && s.segment_id === seg.segment_id
              );
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = seg;
                return updated;
              }
              return [...prev, seg];
            });
          } else if (data.type === 'coach_tip') {
            setCoachTip({
              trigger: data.trigger || '',
              action: data.action || '',
              content: data.content || '',
            });
          } else if (data.type === 'error') {
            setError(data.message || '转录服务出错');
          }
        } catch {
          // Non-JSON messages are silently ignored
        }
      };

      ws.onclose = () => {
        if (intentionalStopRef.current) {
          setConnectionState('idle');
          return;
        }
        setConnectionState('disconnected');

        if (reconnectCountRef.current < MAX_RECONNECT && isRecordingRef.current) {
          const delay = Math.pow(2, reconnectCountRef.current) * 1000;
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
        // onclose fires after this
      };

      return ws;
    },
    [stop],
  );

  /** Request microphone, spin up AudioContext + ScriptProcessor for raw PCM. */
  const start = useCallback(async () => {
    if (isRecordingRef.current || wsRef.current || audioCtxRef.current) {
      stop();
    }

    setError(null);
    setTranscript([]);
    intentionalStopRef.current = false;
    reconnectCountRef.current = 0;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('当前浏览器不支持录音，请使用 HTTPS 或 localhost 访问，或在桌面端 Chrome/Edge 打开');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      setMediaStream(stream);

      // AudioContext at the target sample rate for raw PCM capture.
      // Note: {sampleRate} constructor option is Chrome/Safari only; Firefox
      // ignores it and uses the default hardware rate. The backend always
      // expects 16 kHz PCM, so if AudioContext.sampleRate != TARGET_SAMPLE_RATE
      // we log a warning and accept the mismatch (browser resampling may help).
      const audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      if (audioCtx.sampleRate !== TARGET_SAMPLE_RATE) {
        console.warn(
          `AudioContext sampleRate is ${audioCtx.sampleRate}, expected ${TARGET_SAMPLE_RATE}. ` +
          `Audio may sound wrong to the ASR backend.`,
        );
      }

      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode: bufferSize samples per channel per callback.
      // Needs both input AND output connected for onaudioprocess to fire.
      const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);

      // Route through a silent gain node to avoid feedback through speakers.
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      processorRef.current = processor;

      setConnectionState('connecting');
      const ws = createWebSocket(getWsUrl());
      wsRef.current = ws;

      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const pcm = float32ToInt16PCM(inputData);
        wsRef.current.send(pcm);
      };

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
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendInterrupt = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, []);

  const sendCustomerProfile = useCallback((profile: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_customer', profile }));
    }
  }, []);

  return {
    isRecording,
    connectionState,
    transcript,
    error,
    coachTip,
    start,
    stop,
    sendInterrupt,
    sendCustomerProfile,
    mediaStream,
  };
}
