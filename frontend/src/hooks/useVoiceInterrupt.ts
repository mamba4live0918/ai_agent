import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInterruptConfig {
  /** RMS volume threshold for speech detection (0-1 normalized) */
  threshold?: number;
  /** Minimum sustained duration (ms) before declaring user is speaking */
  sustainedMs?: number;
  /** Called when user speech is detected (for TTS interrupt) */
  onUserSpeaking?: () => void;
  /** Check interval in ms */
  intervalMs?: number;
}

interface VoiceInterruptState {
  isUserSpeaking: boolean;
  rmsLevel: number;
  startMonitoring: (stream: MediaStream) => void;
  stopMonitoring: () => void;
}

/**
 * Monitor microphone volume and detect when the user starts speaking,
 * used to trigger TTS interruption.
 *
 * Usage:
 *   const vi = useVoiceInterrupt({ onUserSpeaking: asr.sendInterrupt });
 *   // Pass vi.startMonitoring(stream) when microphone stream is available
 */
export function useVoiceInterrupt(
  config: VoiceInterruptConfig = {},
): VoiceInterruptState {
  const { threshold = 0.08, sustainedMs = 200, onUserSpeaking, intervalMs = 50 } = config;

  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [rmsLevel, setRmsLevel] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sustainedRef = useRef(0); // accumulated ms above threshold
  const onUserSpeakingRef = useRef(onUserSpeaking);

  useEffect(() => {
    onUserSpeakingRef.current = onUserSpeaking;
  }, [onUserSpeaking]);

  const stopMonitoring = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    sustainedRef.current = 0;
    setIsUserSpeaking(false);
    setRmsLevel(0);
  }, []);

  const startMonitoring = useCallback(
    (stream: MediaStream) => {
      stopMonitoring();

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const dataArray = new Float32Array(analyser.frequencyBinCount);
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sustainedRef.current = 0;

      timerRef.current = setInterval(() => {
        const a = analyserRef.current;
        if (!a) return;

        a.getFloatTimeDomainData(dataArray);

        // RMS calculation
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setRmsLevel(rms);

        if (rms > threshold) {
          sustainedRef.current += intervalMs;
          if (sustainedRef.current >= sustainedMs && !isUserSpeaking) {
            setIsUserSpeaking(true);
            onUserSpeakingRef.current?.();
          }
        } else {
          sustainedRef.current = Math.max(0, sustainedRef.current - intervalMs);
          if (sustainedRef.current <= 0) {
            setIsUserSpeaking(false);
          }
        }
      }, intervalMs);
    },
    [threshold, sustainedMs, intervalMs, stopMonitoring, isUserSpeaking],
  );

  // Cleanup on unmount
  useEffect(() => () => stopMonitoring(), [stopMonitoring]);

  return { isUserSpeaking, rmsLevel, startMonitoring, stopMonitoring };
}
