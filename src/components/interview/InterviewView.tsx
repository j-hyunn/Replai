"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, SendHorizontal, Hourglass, ClipboardList, RotateCcw, Loader2, Lightbulb, SkipForward, Mic, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { saveRemainingSecondsAction, updateSessionStatusAction } from "@/app/(main)/interview/actions";
import type { InterviewSession } from "@/lib/supabase/queries/sessions";
import type { InterviewMessage } from "@/lib/supabase/queries/messages";

const PERSONA_LABELS: Record<string, string> = {
  explorer: "경험 탐색형",
  pressure: "심층 압박형",
};

interface Message {
  role: "interviewer" | "user";
  content: string;
}

interface InterviewViewProps {
  session: InterviewSession;
  existingMessages: InterviewMessage[];
}

export default function InterviewView({ session, existingMessages }: InterviewViewProps) {
  const router = useRouter();
  const totalSeconds = (session.duration_minutes ?? 30) * 60;
  const initialSeconds = session.remaining_seconds ?? totalSeconds;

  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const secondsLeftRef = useRef(initialSeconds);
  const [isPlaying, setIsPlaying] = useState(false); // starts false until analysis done
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [directInput, setDirectInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHinting, setIsHinting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [thinkingMsgIndex, setThinkingMsgIndex] = useState(0);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const [analysisKey, setAnalysisKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRanRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sendOnStopRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  const isEvaluatingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  // TTS cleanup on unmount
  useEffect(() => {
    return () => { stopTts(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTts() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    pendingAudioRef.current = null;
    setIsSpeaking(false);
  }

  function playBase64Audio(base64: string) {
    if (!ttsEnabledRef.current || isEvaluatingRef.current || !base64) return;
    stopTts();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = 1.3;
    audioRef.current = audio;
    setIsSpeaking(true);
    audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
    audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
    audio.play().catch(() => setIsSpeaking(false));
  }

  function toggleTts() {
    const next = !ttsEnabledRef.current;
    ttsEnabledRef.current = next;
    setTtsEnabled(next);
    if (!next) stopTts();
  }

  // Analysis on mount
  useEffect(() => {
    if (analysisRanRef.current) return;
    analysisRanRef.current = true;

    async function runAnalysis() {
      // Resume: use existing messages if analysis already done
      if (session.analysis_json && existingMessages.length > 0) {
        setMessages(existingMessages.map((m) => ({ role: m.role, content: m.content ?? "" })));
        setIsPlaying(true);
        return;
      }

      setIsAnalyzing(true);
      setAnalysisError(null);
      try {
        const res = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "analyze", sessionId: session.id }),
        });
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          throw new Error(err.error ?? "분석 실패");
        }
        const data = await res.json() as { firstMessage: string; audioBase64?: string | null };
        setMessages([{ role: "interviewer", content: data.firstMessage }]);
        if (data.audioBase64) pendingAudioRef.current = data.audioBase64;
        setIsPlaying(true);
      } catch (e) {
        setAnalysisError(e instanceof Error ? e.message : "면접 준비 중 오류가 발생했습니다.");
      } finally {
        setIsAnalyzing(false);
      }
    }

    runAnalysis();
  }, [session.id, session.analysis_json, analysisKey]);

  const LOADING_MESSAGES = [
    "면접관이 면접을 준비하고 있어요",
    "면접관이 지원자님의 이력서를 확인하고 있어요.",
    "면접관이 포트폴리오를 읽는 중이에요.",
  ] as const;

  const THINKING_MESSAGES = [
    "면접관이 생각중이에요...",
    "면접관이 다음 질문을 준비하고 있어요...",
  ] as const;

  useEffect(() => {
    if (!isAnalyzing) return;
    const id = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  useEffect(() => {
    if (!isEvaluating) return;
    setEvalElapsed(0);
    const id = setInterval(() => setEvalElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [isEvaluating]);

  useEffect(() => {
    if (!isSending) return;
    const id = setInterval(() => {
      setThinkingMsgIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [isSending]);

  // Stop TTS when interview is paused
  useEffect(() => {
    if (!isPlaying) stopTts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Play pending TTS after analysis loading screen transitions to interview UI
  useEffect(() => {
    if (!isAnalyzing && pendingAudioRef.current) {
      const audio = pendingAudioRef.current;
      pendingAudioRef.current = null;
      playBase64Audio(audio);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnalyzing]);

  // Listen for exit event (일시정지)
  const handleExit = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await saveRemainingSecondsAction(session.id, secondsLeftRef.current);
    router.push("/interview");
  }, [session.id, router]);

  // Listen for end event (면접 종료) — opens confirmation modal
  const handleEnd = useCallback(() => {
    setIsPlaying(false);
    setEndConfirmOpen(true);
  }, []);

  async function goToReport() {
    isEvaluatingRef.current = true;
    stopTts();
    setIsEvaluating(true);
    try {
      await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "evaluate", sessionId: session.id }),
      });
    } finally {
      setIsEvaluating(false);
      router.push(`/report/${session.id}`);
    }
  }

  async function handleEndAndFeedback() {
    setEndConfirmOpen(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    await updateSessionStatusAction(session.id, "completed");
    await goToReport();
  }

  async function handleEndAndExit() {
    setEndConfirmOpen(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    await saveRemainingSecondsAction(session.id, secondsLeftRef.current);
    router.push("/interview");
  }

  useEffect(() => {
    window.addEventListener("interview:exit", handleExit);
    window.addEventListener("interview:end", handleEnd);
    return () => {
      window.removeEventListener("interview:exit", handleExit);
      window.removeEventListener("interview:end", handleEnd);
    };
  }, [handleExit, handleEnd]);

  // Timer
  useEffect(() => {
    if (!isPlaying) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          updateSessionStatusAction(session.id, "completed");
          setTimeUpOpen(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, session.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // displayText: shown in chat bubble
  // apiText: sent to API (and saved to DB) — defaults to displayText
  async function sendMessage(displayText: string, apiText?: string) {
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: displayText },
      { role: "interviewer", content: "" },
    ]);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "respond", sessionId: session.id, userMessage: apiText ?? displayText }),
      });
      if (!res.ok) throw new Error("응답 실패");
      const { message, audioBase64 } = await res.json() as { message: string; audioBase64: string | null };
      setMessages((prev) => [...prev.slice(0, -1), { role: "interviewer", content: message }]);
      if (audioBase64) playBase64Audio(audioBase64);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "interviewer", content: "응답 중 오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isSending || isHinting) return;
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(text);
  }

  async function handleHint() {
    if (isSending || isHinting || isAnalyzing) return;
    setIsHinting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hint", sessionId: session.id }),
      });
      if (!res.ok) throw new Error("hint 생성 실패");
      const { hint } = await res.json() as { hint: string };
      // Display clean hint in chat; store with marker so evaluator can apply penalty
      await sendMessage(hint, `[모범 답안] ${hint}`);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "interviewer", content: "모범 답안을 생성하는 중 오류가 발생했습니다." },
      ]);
    } finally {
      setIsHinting(false);
    }
  }

  async function handleSkip() {
    if (isSending || isHinting || isAnalyzing) return;
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "질문을 건너뛰겠습니다." },
      { role: "interviewer", content: "" },
    ]);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "skip", sessionId: session.id }),
      });
      if (!res.ok) throw new Error("skip 실패");
      const { message, audioBase64 } = await res.json() as { message: string; audioBase64: string | null };
      setMessages((prev) => [...prev.slice(0, -1), { role: "interviewer", content: message }]);
      if (audioBase64) playBase64Audio(audioBase64);
    } catch {
      setMessages((prev) => [...prev.slice(0, -1), { role: "interviewer", content: "오류가 발생했습니다. 다시 시도해주세요." }]);
    } finally {
      setIsSending(false);
    }
  }

  function playBeep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* AudioContext not available */ }
  }

  async function handleMicStart() {
    stopTts();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.");
      return;
    }

    audioChunksRef.current = [];
    sendOnStopRef.current = false;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());

      if (!sendOnStopRef.current) {
        audioChunksRef.current = [];
        return;
      }
      sendOnStopRef.current = false;

      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      if (blob.size < 1000) {
        toast.error("녹음된 음성이 너무 짧아요. 다시 시도해주세요.");
        return;
      }

      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.text();
          console.error("[transcribe] HTTP", res.status, body);
          throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const { transcript } = await res.json() as { transcript: string };
        if (transcript) {
          sendMessage(transcript);
        } else {
          toast.error("음성이 인식되지 않았어요. 다시 말씀해보거나 직접 입력을 사용해주세요.");
        }
      } catch (e) {
        console.error("[transcribe] error:", e);
        toast.error("음성 변환 중 오류가 발생했어요. 다시 시도해주세요.");
      } finally {
        setIsTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsListening(true);
    playBeep();
  }

  function handleMicCancel() {
    sendOnStopRef.current = false;
    mediaRecorderRef.current?.stop();
    setIsListening(false);
  }

  function handleVoiceSend() {
    sendOnStopRef.current = true;
    mediaRecorderRef.current?.stop();
    setIsListening(false);
  }

  function handleRestart() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    saveRemainingSecondsAction(session.id, null);
    setSecondsLeft(totalSeconds);
    secondsLeftRef.current = totalSeconds;
    setIsPlaying(false);
    setMessages([]);
    setDirectInput(false);
    setInputText("");
    setTimeUpOpen(false);
    setAnalysisError(null);
    analysisRanRef.current = false;
    setAnalysisKey((prev) => prev + 1); // useEffect 재실행 트리거
  }

  const isLowTime = secondsLeft < totalSeconds * 0.2;
  const title = session.persona ? `${PERSONA_LABELS[session.persona]} 모의면접` : "모의면접";

  if (isEvaluating) {
    const EVAL_STEPS = ["답변 정리", "기업/직무 특화", "전문가 평가", "리포트 생성"] as const;
    const evalStepIndex = evalElapsed < 10 ? 0 : evalElapsed < 30 ? 1 : evalElapsed < 60 ? 2 : 3;
    const mm = String(Math.floor(evalElapsed / 60)).padStart(2, "0");
    const ss = String(evalElapsed % 60).padStart(2, "0");

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        <div className="text-center space-y-2">
          <p className="text-xs font-medium text-muted-foreground tracking-widest uppercase">분석 중</p>
          <p className="text-2xl font-bold">{EVAL_STEPS[evalStepIndex]}</p>
          <p className="text-sm text-muted-foreground">면접 답변을 바탕으로 피드백 리포트를 만들고 있어요</p>
        </div>

        <div className="flex items-center gap-2">
          {EVAL_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all ${
                i < evalStepIndex
                  ? "bg-primary/15 text-primary"
                  : i === evalStepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                {i < evalStepIndex && (
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {step}
              </div>
              {i < EVAL_STEPS.length - 1 && (
                <div className={`h-px w-3 ${i < evalStepIndex ? "bg-primary/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs tabular-nums text-muted-foreground/60">{mm}:{ss} 경과</p>
      </div>
    );
  }

  if (isAnalyzing) {
    const ANALYSIS_STEPS = [
      { label: "직무 트렌드 파악 중", desc: "JD 키워드와 포지션 특성을 분석하고 있어요" },
      { label: "맞춤 질문 생성 중", desc: "이력서와 JD를 교차 분석해 질문 세트를 만들고 있어요" },
      { label: "면접 환경 구성 중", desc: "거의 다 됐어요. 잠시만 기다려 주세요" },
    ] as const;
    const current = ANALYSIS_STEPS[loadingMsgIndex];

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
        <div className="flex gap-1.5">
          {ANALYSIS_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === loadingMsgIndex ? "w-8 bg-primary" : i < loadingMsgIndex ? "w-4 bg-primary/35" : "w-4 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">{current.label}</p>
          <p className="text-sm text-muted-foreground">{current.desc}</p>
        </div>

        <p className="text-xs italic text-muted-foreground/60 max-w-xs text-center">
          &ldquo;깊게 숨을 한 번 들이쉬어 보세요. 준비된 당신이라면 충분합니다.&rdquo;
        </p>
      </div>
    );
  }

  if (analysisError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{analysisError}</p>
        <Button size="sm" variant="outline" onClick={() => { analysisRanRef.current = false; setAnalysisError(null); }}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <>
    <Dialog open={timeUpOpen} onOpenChange={setTimeUpOpen}>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-4 pt-4 pb-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Hourglass className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl text-primary">면접 시간이 종료되었어요</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              지금까지의 답변을 바탕으로 피드백 리포트를 받을 수 있어요.
              <br />
              만족스럽지 않다면 면접을 다시 시작할 수도 있어요.
            </DialogDescription>
          </div>
          <div className="flex w-full flex-col gap-2 pt-2">
            <Button className="w-full gap-2" onClick={goToReport}>
              <ClipboardList className="h-4 w-4" />
              피드백 받기
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              onClick={handleRestart}
            >
              <RotateCcw className="h-4 w-4" />
              면접 다시 시작하기
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/interview")}
            >
              나가기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-4 pt-4 pb-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ClipboardList className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl text-primary">면접을 종료할까요?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              지금 종료하면 피드백 리포트를 바로 받을 수 있어요.
              <br />
              아직 준비가 덜 됐다면 일시 정지 후 나중에 이어서 진행할 수 있어요.
            </DialogDescription>
          </div>
          <div className="flex w-full flex-col gap-2 pt-2">
            <Button className="w-full gap-2" onClick={handleEndAndFeedback}>
              <ClipboardList className="h-4 w-4" />
              종료하고 피드백 받기
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              onClick={handleEndAndExit}
            >
              <Pause className="h-4 w-4" />
              잠시 나가기
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => { setEndConfirmOpen(false); setIsPlaying(true); }}
            >
              계속 진행하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <div className="flex w-full h-full gap-4 overflow-hidden">
      {/* ── Left: AI panel ─────────────────────────────────── */}
      <div className="flex flex-[3] flex-col rounded-xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          <div
            className={`inline-flex h-7 w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums leading-none ${
              isLowTime
                ? "bg-destructive/10 text-destructive"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="w-9 text-center leading-none">{formatTime(secondsLeft)}</span>
          </div>
        </div>

        {/* AI blob area */}
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <style>{`
            @keyframes blob-float {
              0%, 100% { transform: scale(1) translate(0px, 0px); }
              25% { transform: scale(1.1) translate(12px, -12px); }
              50% { transform: scale(0.92) translate(-8px, 8px); }
              75% { transform: scale(1.06) translate(-10px, -6px); }
            }
            @keyframes blob-glow {
              0%, 100% { opacity: 0.75; }
              50% { opacity: 1; }
            }
            @keyframes mic-bar {
              from { height: 3px; }
              to { height: 100%; }
            }
            .blob-outer { animation: blob-float 4.5s ease-in-out infinite; }
            .blob-glow { animation: blob-glow 2.5s ease-in-out infinite; }
            .blob-halo {
              background: radial-gradient(circle, color-mix(in srgb, var(--primary) 15%, transparent) 0%, transparent 70%);
            }
            .blob-orb {
              width: 220px;
              height: 220px;
              border-radius: 50%;
              background: radial-gradient(
                circle at 42% 36%,
                color-mix(in srgb, var(--primary) 25%, white) 0%,
                color-mix(in srgb, var(--primary) 55%, white) 40%,
                var(--primary) 70%,
                var(--primary) 100%
              );
              box-shadow:
                0 0 60px 20px color-mix(in srgb, var(--primary) 35%, transparent),
                0 0 120px 50px color-mix(in srgb, var(--primary) 20%, transparent),
                0 0 200px 80px color-mix(in srgb, var(--primary) 8%, transparent),
                inset 0 0 40px 10px rgba(255,255,255,0.25),
                inset -15px -15px 40px 0px color-mix(in srgb, var(--primary) 15%, transparent);
            }
          `}</style>

          <div
            className="blob-outer relative"
            style={{ animationPlayState: isPlaying ? "running" : "paused" }}
          >
            <div
              className="blob-glow blob-halo absolute inset-0 rounded-full blur-3xl scale-125"
              style={{ animationPlayState: isPlaying ? "running" : "paused" }}
            />
            <div className="blob-orb" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 py-5 shrink-0">
          <button
            onClick={() => setIsPlaying(false)}
            disabled={!isPlaying || isAnalyzing}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              !isPlaying
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70 text-foreground"
            }`}
            aria-label="일시정지"
          >
            <Pause className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIsPlaying(true)}
            disabled={isPlaying || isAnalyzing}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              isPlaying
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70 text-foreground"
            }`}
            aria-label="재생"
          >
            <Play className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Right: Chat panel ──────────────────────────────── */}
      <div className="flex flex-[2] flex-col rounded-xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <span className="text-sm font-semibold">대화 내용</span>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTts}
              className={`transition-colors ${ttsEnabled ? (isSpeaking ? "text-primary" : "text-foreground") : "text-muted-foreground"}`}
              aria-label={ttsEnabled ? "음소거" : "음성 켜기"}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <span className="text-xs text-muted-foreground">직접 입력</span>
            <Switch checked={directInput} onCheckedChange={setDirectInput} />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "interviewer" && (
                <div className="flex items-center gap-2 mb-1.5">
                  <Image src="/logo.svg" alt="reHEARsal" width={24} height={24} />
                  <span className="text-xs font-medium">리허설</span>
                </div>
              )}
              <div
                className={`rounded-xl px-3 py-2 text-sm ${
                  msg.role === "interviewer"
                    ? "bg-muted text-foreground"
                    : "bg-primary/10 text-foreground ml-8"
                }`}
              >
                {msg.content || (
                  <span className="text-muted-foreground italic">
                    {THINKING_MESSAGES[thinkingMsgIndex]}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — always rendered */}
        <div className="border-t p-3 shrink-0 space-y-2">
          {/* Chip buttons — both modes */}
          <div className="flex gap-2">
            <button
              onClick={handleHint}
              disabled={isSending || isHinting || isAnalyzing}
              className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-900/40"
            >
              {isHinting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
              모범 답안 제시
            </button>
            <button
              onClick={handleSkip}
              disabled={isSending || isHinting || isAnalyzing}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="h-3 w-3" />
              질문 건너뛰기
            </button>
          </div>

          {/* Text input (직접입력 ON) */}
          {directInput ? (
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                placeholder="답변을 입력하세요..."
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="resize-none text-sm overflow-hidden"
                style={{ minHeight: "2.25rem" }}
                disabled={isSending || isAnalyzing}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending || isAnalyzing}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            /* Voice input (직접입력 OFF) */
            <div className="space-y-2">
              {isListening && (
                <>
                  <div className="flex items-center gap-[2px] h-4">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-[1px] bg-primary"
                        style={{ animation: `mic-bar 0.7s ease-in-out ${(i % 6) * 0.12}s infinite alternate` }}
                      />
                    ))}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm min-h-9">
                    <span className="text-muted-foreground">말하고 있어요...</span>
                  </div>
                </>
              )}
              <div className="flex items-end gap-2">
                <button
                  onClick={isListening ? handleMicCancel : handleMicStart}
                  disabled={isSending || isAnalyzing || !isPlaying}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isListening
                      ? "border border-red-300 bg-red-50 text-red-500 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400"
                      : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  {isListening ? "취소" : "말하기"}
                </button>
                <button
                  onClick={handleVoiceSend}
                  disabled={!isListening || isSending || isAnalyzing || isTranscribing}
                  className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
                >
                  {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
