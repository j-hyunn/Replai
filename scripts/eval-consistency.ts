/**
 * Variance probe for evaluation determinism.
 *
 * Runs the same fixed QaGroup through `evaluateAnswer` N times and
 * reports per-score standard deviation. Lets you see whether anchor
 * rubric + temperature=0 + structured output actually tightened the
 * spread compared to the old single-call free-text path.
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx scripts/eval-consistency.ts
 *
 * Not wired into CI. Run manually before/after a prompt change to
 * verify it didn't regress consistency.
 */
import { evaluateAnswer } from "../src/lib/evaluation/run";
import type { QaGroup } from "../src/lib/prompts/evaluation";
import type { AnalysisOutput } from "../src/lib/prompts/analysis";

const N_RUNS = 5;
const MODEL = process.env.EVAL_MODEL ?? "gemini-2.5-flash";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("ERROR: set GOOGLE_API_KEY before running.");
  process.exit(1);
}

const fixedAnalysis: AnalysisOutput = {
  analysis: {
    jd_keywords: ["TypeScript", "Next.js", "API 설계"],
    strengths: ["풀스택 경험", "성능 개선 경험"],
    preferred_gaps: ["대규모 트래픽 대응", "결제 시스템 경험"],
  },
  questions: [
    {
      id: "q1",
      question: "자기소개와 함께 본인이 가장 자랑스러운 프로젝트 하나를 설명해주세요.",
      type: "common",
      intent: "역할 명확성, 성과 측정, 기술 선택 이유",
      good_answer_tips: "구체적 수치, 본인의 역할, 기술 결정 근거",
      depth: 0,
      source: "common",
    },
  ],
};

const fixedQaGroup: QaGroup = {
  question_id: "q1",
  question:
    "자기소개와 함께 본인이 가장 자랑스러운 프로젝트 하나를 설명해주세요.",
  intent: fixedAnalysis.questions[0].intent,
  good_answer_tips: fixedAnalysis.questions[0].good_answer_tips,
  turns: [
    {
      speaker: "interviewer",
      content:
        "자기소개와 함께 본인이 가장 자랑스러운 프로젝트 하나를 설명해주세요.",
    },
    {
      speaker: "user",
      content:
        "저는 5년차 백엔드 개발자이고, Replai 서비스에서 인터뷰 평가 파이프라인을 담당했습니다. " +
        "Gemini API 호출을 단건 N회 병렬 호출로 재구조화해 평가 결정성을 끌어올렸고, " +
        "기존 일괄 호출 대비 평균 점수 분산이 약 절반으로 줄었습니다. " +
        "TypeScript와 Next.js 기반이며 Supabase를 데이터 레이어로 사용했습니다.",
    },
  ],
  used_hint: false,
  skipped: false,
};

const fixedResumeTexts = [
  "[이력서] 5년차 백엔드 개발자. Replai에서 인터뷰 평가 파이프라인 재설계.\n" +
    "- 평가 결정성 개선: 일괄 호출 → 단건 N회 병렬 호출. 응답 시간 30% 단축.\n" +
    "- 회귀 방지 단위테스트 27개 작성.\n" +
    "- TypeScript / Next.js (App Router) / Supabase.",
];

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

async function main(): Promise<void> {
  console.log(`Running ${N_RUNS} evaluations against ${MODEL}...`);

  const results: Array<{
    logic: number;
    specificity: number;
    job_fit: number;
    average: number;
    status: string;
  }> = [];

  for (let i = 0; i < N_RUNS; i++) {
    process.stdout.write(`  run ${i + 1}/${N_RUNS}... `);
    const start = Date.now();
    const result = await evaluateAnswer({
      qaGroup: fixedQaGroup,
      analysisJson: fixedAnalysis,
      resumeTexts: fixedResumeTexts,
      apiKey: apiKey!,
      model: MODEL,
    });
    const elapsed = Date.now() - start;
    results.push({
      logic: result.scores.logic,
      specificity: result.scores.specificity,
      job_fit: result.scores.job_fit,
      average: result.average,
      status: result.status,
    });
    console.log(
      `done in ${elapsed}ms (logic=${result.scores.logic}, specificity=${result.scores.specificity}, job_fit=${result.scores.job_fit}, avg=${result.average}, status=${result.status})`,
    );
  }

  const logic = results.map((r) => r.logic);
  const specificity = results.map((r) => r.specificity);
  const job_fit = results.map((r) => r.job_fit);
  const average = results.map((r) => r.average);

  console.log("\n=== Variance Report ===");
  console.log(`runs: ${N_RUNS}, model: ${MODEL}`);
  console.log(
    `logic       — min ${Math.min(...logic)}, max ${Math.max(...logic)}, stdev ${stdev(logic).toFixed(2)}`,
  );
  console.log(
    `specificity — min ${Math.min(...specificity)}, max ${Math.max(...specificity)}, stdev ${stdev(specificity).toFixed(2)}`,
  );
  console.log(
    `job_fit     — min ${Math.min(...job_fit)}, max ${Math.max(...job_fit)}, stdev ${stdev(job_fit).toFixed(2)}`,
  );
  console.log(
    `average     — min ${Math.min(...average)}, max ${Math.max(...average)}, stdev ${stdev(average).toFixed(2)}`,
  );
}

main().catch((err) => {
  console.error("eval-consistency failed:", err);
  process.exit(1);
});
