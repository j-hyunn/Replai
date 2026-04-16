import Image from "next/image";
import { Lightbulb, Mic, Pause, Play, SendHorizontal, SkipForward, Volume2 } from "lucide-react";

const messages = [
  {
    role: "interviewer" as const,
    content:
      "React에서 상태 관리를 어떻게 접근하시나요? 최근 프로젝트에서 어떤 방법을 사용하셨는지 구체적으로 말씀해 주세요.",
  },
  {
    role: "user" as const,
    content:
      "최근 프로젝트에서는 서버 상태와 클라이언트 상태를 분리하는 전략을 택했습니다. 서버 데이터는 TanStack Query로 캐싱하고, 전역 UI 상태는 Zustand로 관리했습니다. 팀원들도 각 상태가 어디서 관리되는지 명확히 알 수 있어 유지보수가 쉬워졌습니다.",
  },
  {
    role: "interviewer" as const,
    content:
      "TanStack Query로 서버 상태를 캐싱한다고 하셨는데, stale time이나 cache time은 어떤 기준으로 설정하셨나요?",
  },
];

export default function InterviewMockup() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border/60 shadow-2xl shadow-primary/10">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/70 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-border" />
          <div className="size-3 rounded-full bg-border" />
          <div className="size-3 rounded-full bg-border" />
        </div>
        <div className="mx-auto flex h-6 w-64 items-center justify-center rounded-md bg-background px-3">
          <span className="truncate text-xs text-muted-foreground">
            replai.vercel.app/interview/...
          </span>
        </div>
      </div>

      {/* Page: sidebar background */}
      <div
        className="flex flex-col gap-3 p-3"
        style={{ background: "rgba(248, 248, 255, 1)" }}
      >
        {/* Header card — matches: mx-4 mt-4 rounded-xl border bg-card px-5 h-16 */}
        <div className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4">
          {/* Logo button (InterviewExitDialog) */}
          <Image src="/logo.svg" alt="Replai" width={22} height={22} className="shrink-0" />

          {/* Vertical separator */}
          <div className="h-4 w-px bg-border shrink-0" />

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <span className="truncate hidden sm:block">김지현</span>
            <span className="hidden sm:block">/</span>
            <span className="truncate hidden sm:block">모의 인터뷰</span>
            <span className="hidden sm:block">/</span>
            <span className="truncate text-foreground font-medium">면접 진행 중</span>
          </nav>

          {/* End button */}
          <div className="ml-auto shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            면접 종료
          </div>
        </div>

        {/* Interview panels — matches: flex gap-4 */}
        <div className="flex h-[480px] gap-3">
          {/* Left: AI panel — flex-[3] rounded-xl border bg-card */}
          <div className="flex flex-[3] flex-col overflow-hidden rounded-xl border bg-card">
            {/* Panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <span className="text-xs font-semibold">경험 탐색형 모의면접</span>
              <div className="inline-flex h-6 w-[4.5rem] items-center justify-center gap-1 rounded-full bg-primary px-2 text-[11px] font-semibold tabular-nums text-primary-foreground">
                <svg
                  className="size-2.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="w-9 text-center leading-none">24:31</span>
              </div>
            </div>

            {/* AI blob */}
            <div className="flex flex-1 items-center justify-center overflow-hidden">
              <style>{`
                @keyframes lp-blob-float {
                  0%,100% { transform: scale(1) translate(0,0); }
                  25% { transform: scale(1.08) translate(8px,-8px); }
                  50% { transform: scale(0.94) translate(-6px,6px); }
                  75% { transform: scale(1.04) translate(-7px,-4px); }
                }
                @keyframes lp-blob-glow {
                  0%,100% { opacity: .7; }
                  50% { opacity: 1; }
                }
                .lp-blob-outer { animation: lp-blob-float 4.5s ease-in-out infinite; }
                .lp-blob-glow  { animation: lp-blob-glow  2.5s ease-in-out infinite; }
              `}</style>
              <div className="lp-blob-outer relative">
                <div
                  className="lp-blob-glow absolute inset-0 rounded-full blur-3xl scale-125"
                  style={{
                    background:
                      "radial-gradient(circle, color-mix(in srgb, var(--primary) 15%, transparent) 0%, transparent 70%)",
                  }}
                />
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 42% 36%, color-mix(in srgb,var(--primary) 25%,white) 0%, color-mix(in srgb,var(--primary) 55%,white) 40%, var(--primary) 70%, var(--primary) 100%)",
                    boxShadow:
                      "0 0 40px 14px color-mix(in srgb,var(--primary) 30%,transparent), 0 0 80px 30px color-mix(in srgb,var(--primary) 15%,transparent), inset 0 0 30px 8px rgba(255,255,255,.2)",
                  }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex shrink-0 items-center justify-center gap-3 py-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Pause className="size-4" />
              </div>
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
                <Play className="size-4" />
              </div>
            </div>
          </div>

          {/* Right: Chat panel — flex-[2] rounded-xl border bg-card */}
          <div className="flex flex-[2] flex-col overflow-hidden rounded-xl border bg-card">
            {/* Chat header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-xs font-semibold">대화 내용</span>
              <div className="flex items-center gap-2">
                <Volume2 className="size-3.5 text-foreground" />
                <span className="text-[10px] text-muted-foreground">직접 입력</span>
                {/* Switch: off */}
                <div className="relative inline-flex h-4 w-7 items-center rounded-full bg-muted-foreground/30">
                  <div className="absolute left-0.5 size-3 rounded-full bg-white shadow-sm" />
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden space-y-3 px-3 py-3">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "interviewer" && (
                    <div className="mb-1 flex items-center gap-1.5">
                      <Image src="/logo.svg" alt="Replai" width={16} height={16} />
                      <span className="text-[10px] font-medium">리플레이</span>
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-2.5 py-2 text-[11px] leading-relaxed ${
                      msg.role === "interviewer"
                        ? "bg-muted text-foreground"
                        : "ml-6 bg-primary/10 text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <Image src="/logo.svg" alt="Replai" width={16} height={16} />
                  <span className="text-[10px] font-medium">리플레이</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-2.5">
                  <style>{`
                    @keyframes lp-dot {
                      0%,80%,100% { opacity:.25; transform:scaleY(.6); }
                      40% { opacity:1; transform:scaleY(1); }
                    }
                    .lp-dot { animation: lp-dot 1.2s ease-in-out infinite; }
                    .lp-dot:nth-child(2) { animation-delay:.2s; }
                    .lp-dot:nth-child(3) { animation-delay:.4s; }
                  `}</style>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="lp-dot size-1.5 rounded-full bg-muted-foreground/60" />
                  ))}
                </div>
              </div>
            </div>

            {/* Input area — voice mode (직접 입력 OFF) */}
            <div className="shrink-0 space-y-2 border-t border-border p-3">
              {/* Chip buttons */}
              <div className="flex gap-2">
                <div className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">
                  <Lightbulb className="size-2.5" />
                  모범 답안 제시
                </div>
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  <SkipForward className="size-2.5" />
                  질문 건너뛰기
                </div>
              </div>
              {/* Voice / send row */}
              <div className="flex items-end gap-2">
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/50 py-2.5 text-xs font-medium text-muted-foreground">
                  <Mic className="size-3.5" />
                  말하기
                </div>
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-md bg-primary/40 text-primary-foreground">
                  <SendHorizontal className="size-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
