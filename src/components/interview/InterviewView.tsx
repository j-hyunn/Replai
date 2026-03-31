"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, SendHorizontal, Hourglass, ClipboardList, RotateCcw, Loader2, Lightbulb, SkipForward, Mic } from "lucide-react";
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
  const [directInput, setDirectInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHinting, setIsHinting] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRanRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sendOnStopRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

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
        const data = await res.json() as { firstMessage: string };
        setMessages([{ role: "interviewer", content: data.firstMessage }]);
        setIsPlaying(true);
      } catch (e) {
        setAnalysisError(e instanceof Error ? e.message : "면접 준비 중 오류가 발생했습니다.");
      } finally {
        setIsAnalyzing(false);
      }
    }

    runAnalysis();
  }, [session.id, session.analysis_json]);

  // Listen for exit event (일시정지)
  const handleExit = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await saveRemainingSecondsAction(session.id, secondsLeftRef.current);
    router.push("/interview");
  }, [session.id, router]);

  // Listen for end event (면접 종료)
  const handleEnd = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await updateSessionStatusAction(session.id, "completed");
    router.push("/interview");
  }, [session.id, router]);

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
      if (!res.ok || !res.body) throw new Error("응답 실패");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        let displayText = accumulated;
        try {
          const cleaned = accumulated.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
          const parsed = JSON.parse(cleaned) as { message: string };
          displayText = parsed.message;
        } catch { /* streaming */ }
        setMessages((prev) => [...prev.slice(0, -1), { role: "interviewer", content: displayText }]);
      }
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
      if (!res.ok || !res.body) throw new Error("skip 실패");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        let displayText = accumulated;
        try {
          const cleaned = accumulated.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
          const parsed = JSON.parse(cleaned) as { message: string };
          displayText = parsed.message;
        } catch { /* streaming */ }
        setMessages((prev) => [...prev.slice(0, -1), { role: "interviewer", content: displayText }]);
      }
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
    analysisRanRef.current = false;
    // Trigger re-analysis
    setTimeout(() => {
      analysisRanRef.current = false;
      // Force re-run by re-creating the effect
      setAnalysisError(null);
    }, 0);
  }

  const isLowTime = secondsLeft < totalSeconds * 0.2;
  const title = session.persona ? `${PERSONA_LABELS[session.persona]} 모의면접` : "모의면접";

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
            <Button
              className="w-full gap-2"
              onClick={() => router.push(`/report/${session.id}`)}
            >
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

          {isAnalyzing ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm">면접을 준비하고 있어요...</p>
            </div>
          ) : analysisError ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <p className="text-sm text-destructive">{analysisError}</p>
              <Button size="sm" variant="outline" onClick={() => { analysisRanRef.current = false; setAnalysisError(null); }}>
                다시 시도
              </Button>
            </div>
          ) : (
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
          )}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">직접 입력</span>
            <Switch checked={directInput} onCheckedChange={setDirectInput} />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isAnalyzing && messages.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">면접관이 준비 중이에요...</span>
            </div>
          )}
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
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">·</span>
                    <span className="animate-pulse delay-75">·</span>
                    <span className="animate-pulse delay-150">·</span>
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
