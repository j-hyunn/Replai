import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import InterviewMockup from "@/components/about/InterviewMockup";
import {
  BrainCircuit,
  FileText,
  MessageSquare,
  BarChart3,
  Clock,
  Target,
  Zap,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

export const metadata = {
  title: "Replai — AI 모의면접 서비스",
  description:
    "AI 면접관과 언제든지 면접 연습. IT 직군 이직 준비를 위한 AI 스페셜리스트 모의면접 서비스입니다.",
};

const problems = [
  {
    emoji: "😞",
    title: "혼자 연습하면 한계가 있어요",
    description: "거울 앞 혼자 중얼거리거나, 예상 질문지만 반복해도 실전과의 괴리감은 줄지 않습니다.",
  },
  {
    emoji: "🤷",
    title: "피드백을 받기 어려워요",
    description: "지인에게 부탁하기 민망하고, 전문 코치는 비용이 부담스럽습니다.",
  },
  {
    emoji: "⏰",
    title: "시간과 장소에 제약이 있어요",
    description: "스터디나 스피치 학원은 일정을 맞추기 어렵고, 원하는 순간에 바로 연습할 수 없습니다.",
  },
];

const steps = [
  {
    number: "01",
    title: "이력서 & JD 입력",
    description:
      "이력서·포트폴리오를 업로드하고 지원하는 공고의 JD를 붙여넣으세요. AI가 두 문서를 함께 분석합니다.",
    icon: FileText,
  },
  {
    number: "02",
    title: "AI 면접관과 대화",
    description:
      "탐색형 또는 압박형 페르소나를 선택하고 실전 면접을 시작하세요. 꼬리질문도 자연스럽게 이어집니다.",
    icon: MessageSquare,
  },
  {
    number: "03",
    title: "점수 & 피드백 리포트 확인",
    description:
      "면접 종료 후 답변별 점수와 개선점, 모범 답안을 담은 리포트를 즉시 받아볼 수 있습니다.",
    icon: BarChart3,
  },
];

const features = [
  {
    icon: Target,
    title: "JD 맞춤 질문 생성",
    description:
      "단순 예상 질문지가 아닙니다. AI가 JD의 키워드와 이력서의 강점·약점을 교차 분석해 나에게 꼭 맞는 질문을 생성합니다.",
  },
  {
    icon: BrainCircuit,
    title: "꼬리질문 최대 4 depth",
    description:
      "면접관은 답변이 불명확하면 파고듭니다. Replai도 동일하게 최대 4단계 꼬리질문으로 실전 감각을 키웁니다.",
  },
  {
    icon: Zap,
    title: "두 가지 면접관 페르소나",
    description:
      "탐색형 면접관은 경험을 깊이 탐색하고, 압박형 면접관은 실전처럼 강도 높게 질문합니다. 두 스타일 모두 대비하세요.",
  },
  {
    icon: Clock,
    title: "언제든, 어디서든",
    description:
      "새벽 2시에도, 출근길 지하철 안에서도. 면접 전날 긴장될 때 바로 켜서 연습할 수 있습니다.",
  },
];

const targets = [
  "프론트엔드 개발자",
  "백엔드 개발자",
  "풀스택 개발자",
  "프로덕트 매니저",
  "UX 디자이너",
  "AI 엔지니어",
  "인프라 엔지니어",
  "데이터 엔지니어",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <Image src="/logo.svg" alt="Replai" width={28} height={28} />
            Replai
          </Link>
          <Button asChild size="sm">
            <Link href="/login">시작하기</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent to-background px-6 pb-0 pt-20">
        <div className="mx-auto max-w-5xl">
          {/* Text */}
          <div className="mb-12 text-center">
            <Badge variant="secondary" className="mb-6 text-primary border-primary/20 bg-accent">
              IT 직군 이직 준비를 위한 AI 모의면접
            </Badge>
            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
              면접,{" "}
              <span className="text-primary">더 이상 혼자</span>
              <br />
              준비하지 마세요
            </h1>
            <p className="mb-10 text-lg text-muted-foreground md:text-xl">
              회사별 포지션 이해를 갖춘 AI 면접관과
              <br />
              면접을 진행하고 피드백을 받아보세요.
            </p>
            <div className="flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="gap-2 px-8 mb-4">
                <Link href="/login">
                  무료로 시작하기
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">Google 계정으로 30초 만에 시작</p>
            </div>
          </div>

          {/* Mockup screenshot */}
          <div className="relative mx-auto max-w-4xl">
            {/* Glow effect behind mockup */}
            <div
              className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl opacity-40 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 60%, color-mix(in srgb, var(--primary) 30%, transparent), transparent 70%)",
              }}
            />
            <InterviewMockup />
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-2xl font-bold md:text-3xl">
              면접 준비, 이런 어려움 있으셨나요?
            </h2>
            <p className="text-muted-foreground">
              많은 분들이 같은 문제로 어려움을 겪고 있습니다.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {problems.map((p) => (
              <Card key={p.title} className="border-border">
                <CardContent className="pt-6">
                  <div className="mb-3 text-3xl">{p.emoji}</div>
                  <h3 className="mb-2 font-semibold">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator className="mx-auto max-w-5xl" />

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-2xl font-bold md:text-3xl">3단계로 끝나는 면접 준비</h2>
            <p className="text-muted-foreground">복잡한 설정 없이 바로 시작할 수 있습니다.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-bold text-primary/20">{step.number}</span>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                      <Icon className="size-5 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-2xl font-bold md:text-3xl">왜 Replai인가요?</h2>
            <p className="text-muted-foreground">
              단순한 예상 질문 모음이 아닌, 진짜 면접에 가까운 경험을 제공합니다.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="border-border bg-card">
                  <CardContent className="flex gap-4 pt-6">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="mb-1 font-semibold">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Target Users */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-2xl font-bold md:text-3xl">이런 분들께 딱 맞습니다</h2>
            <p className="text-muted-foreground">IT 직군 이직을 준비하는 모든 분들을 위해 만들었습니다.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {targets.map((target) => (
              <div
                key={target}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
              >
                <CheckCircle2 className="size-4 text-primary" />
                {target}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary px-6 py-24 text-center text-primary-foreground">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            지금 바로 면접 연습을 시작하세요
          </h2>
          <p className="mb-10 text-primary-foreground/80 md:text-lg">
            무료로 제공됩니다. 신용카드 없이 Google 계정만으로 시작할 수 있습니다.
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="gap-2 px-10 font-semibold text-primary"
          >
            <Link href="/login">
              무료로 시작하기
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <Image src="/logo.svg" alt="Replai" width={22} height={22} />
            Replai
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="mailto:lab.jehyun@gmail.com" className="hover:text-foreground transition-colors">
              lab.jehyun@gmail.com
            </a>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              개인정보 처리방침
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
