import { randomUUID } from "crypto";
import {
  LlmAgent,
  Runner,
  InMemorySessionService,
  Gemini,
  isFinalResponse,
  stringifyContent,
  createEvent,
  createEventActions,
} from "@google/adk";
import { getUser } from "@/lib/supabase/auth.server";
import { getSession, updateSession } from "@/lib/supabase/queries/sessions";
import { getDocumentsByIds } from "@/lib/supabase/queries/documents";
import {
  getSessionMessages,
  createMessage,
  isMessageKind,
  type MessageKind,
} from "@/lib/supabase/queries/messages";
import { env } from "@/lib/env";
import { getUserAiConfig } from "@/lib/ai-config";
import { generateTtsBase64 } from "@/lib/tts";
import { buildAnalysisPrompt, type AnalysisOutput, type UserProfileContext } from "@/lib/prompts/analysis";
import { getUserProfile } from "@/lib/supabase/queries/profiles";
import { getPersonaSettings } from "@/lib/supabase/queries/personaSettings";
import { getMasterResume, getSubmittedResume } from "@/lib/supabase/queries/master-resume";
import { serializeMasterResume, serializeSubmittedResume } from "@/lib/utils/serializeMasterResume";
import { hasMasterResumeContent } from "@/lib/utils/masterResumeContent";
import { buildFirstQuestionPrompt, buildRespondPrompt, buildSkipPrompt, buildHintPrompt } from "@/lib/prompts/interview";
import {
  buildQuestionEvaluationPrompt,
  buildSkippedModelAnswerPrompt,
  buildSummaryEvaluationPrompt,
  type QaGroup,
  type QaTurn,
} from "@/lib/prompts/evaluation";
import {
  applyAnsweredOverrides,
  applyHintCap,
  buildFailedAnswer,
  buildSkippedAnswer,
  computeTotalScore,
  countByStatus,
  type AnswerFinal,
} from "@/lib/evaluation/postprocess";
import {
  parseQuestionEvaluation,
  parseSkippedModelAnswer,
  parseSummaryEvaluation,
  type SummaryEvaluationParsed,
} from "@/lib/evaluation/parse";
import { mapWithConcurrency } from "@/lib/evaluation/concurrency";
import { withDeadline } from "@/lib/utils/withDeadline";
import { sessionService, interviewRunner, APP_NAME } from "@/lib/agents/runners";

// Report generation fans out one Gemini call per question plus a summary call,
// so it needs far more than the platform default. Matches /api/resume/generate.
export const maxDuration = 300;

const MODEL = "gemini-2.5-flash";

// Max Gemini evaluation calls in flight at once. Keeps a long interview from
// firing a dozen simultaneous requests and tripping the API rate limit.
const EVAL_CONCURRENCY = 4;

// Per-call ceiling. Generous enough that a slow-but-healthy call is not cut
// off, tight enough that a hung one does not eat the whole function budget.
const ONESHOT_TIMEOUT_MS = 45_000;

// Wall-clock budget for the whole evaluate handler, kept under maxDuration so
// there is room left to persist the report. Once it is spent the remaining
// questions degrade to `failed` cards instead of retrying into a hard timeout.
const EVAL_BUDGET_MS = 240_000;

function makeGemini(apiKey: string, model: string) {
  return new Gemini({ model, apiKey });
}

// Gemini sometimes wraps JSON in markdown code fences despite instructions.
// Strip them before parsing.
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenceMatch ? fenceMatch[1].trim() : raw.trim();
}

// One-shot agent: no session persistence needed (analysis + evaluation).
async function runOneShot(
  instruction: string,
  userMessage: string,
  userId: string,
  apiKey: string,
  model: string,
  timeoutMs: number = ONESHOT_TIMEOUT_MS,
): Promise<string> {
  const agent = new LlmAgent({ name: "oneshot_agent", model: makeGemini(apiKey, model), instruction: () => instruction });
  const runner = new Runner({ agent, appName: APP_NAME, sessionService: new InMemorySessionService() });

  async function drain(): Promise<string> {
    let result = "";
    let eventCount = 0;
    for await (const event of runner.runEphemeral({
      userId,
      newMessage: { role: "user", parts: [{ text: userMessage }] },
    })) {
      eventCount++;
      const isFinal = isFinalResponse(event);
      console.log(`[runOneShot] event#${eventCount} author:${event.author} isFinal:${isFinal} errorCode:${event.errorCode ?? "-"} parts:${event.content?.parts?.length ?? 0}`);
      if (isFinal) result = stringifyContent(event);
    }
    return result;
  }

  return withDeadline(drain(), timeoutMs, "runOneShot");
}

/**
 * Ensures the ADK interview session exists in the InMemorySessionService.
 *
 * On a warm instance the session is already present and nothing happens.
 * On a cold start the session is gone — we reconstruct it by replaying the
 * stored conversation history from Supabase so that the LLM sees the full
 * context when runAsync() is called.
 */
async function ensureAdkSession(params: {
  adkSessionId: string;
  userId: string;
  state: Record<string, unknown>;
  sessionId: string; // Supabase session ID (for message lookup)
}): Promise<void> {
  const { adkSessionId, userId, state, sessionId } = params;

  const existing = await sessionService.getSession({
    appName: APP_NAME,
    userId,
    sessionId: adkSessionId,
  });

  if (existing) return; // Already in memory — nothing to do.

  // Cold start: recreate the ADK session and replay stored messages.
  const adkSession = await sessionService.createSession({
    appName: APP_NAME,
    userId,
    sessionId: adkSessionId,
    state,
  });

  const allMessages = await getSessionMessages(sessionId);
  // Replay only the last 30 messages to keep the ADK session lean on cold starts.
  // The interview agent already has the full question list in its system prompt,
  // so earlier context loss does not affect question progression.
  const messages = allMessages.slice(-30);
  let invocationIndex = 0;

  for (const msg of messages) {
    // Skipped turns have empty content by design; replay a stand-in so the
    // agent still sees that the question went unanswered.
    const replayText = msg.kind === "skipped" ? "(질문을 건너뛰었습니다)" : msg.content;
    if (!replayText) continue;

    const isUser = msg.role === "user";
    const event = createEvent({
      invocationId: `replay-${invocationIndex++}`,
      author: isUser ? "user" : "interview_agent",
      content: {
        role: isUser ? "user" : "model",
        parts: [{ text: replayText }],
      },
      actions: createEventActions(),
      timestamp: new Date(msg.created_at).getTime() / 1000,
    });

    await sessionService.appendEvent({ session: adkSession, event });
  }
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { apiKey, model } = await getUserAiConfig(user.id);

  const body = await req.json() as {
    type: string;
    sessionId: string;
    userMessage?: string;
    kind?: unknown;
  };
  const { type, sessionId, userMessage } = body;

  // The client declares whether the answer it is submitting was copied from a
  // shown model answer. Anything unrecognised falls back to a plain answer;
  // `interviewer` is server-owned and never accepted from a client.
  const userKind: MessageKind =
    isMessageKind(body.kind) && body.kind !== "interviewer" ? body.kind : "answer";

  const session = await getSession(sessionId);
  if (!session || session.user_id !== user.id) {
    return new Response("Not Found", { status: 404 });
  }

  // Fetch resume texts, user profile, persona settings, master resume, and submitted resume in parallel
  const [documents, profileData, personaSettings, masterResume, submittedResume] = await Promise.all([
    getDocumentsByIds(session.resume_ids ?? []),
    getUserProfile(user.id).catch(() => null),
    getPersonaSettings(user.id).catch(() => []),
    getMasterResume(user.id).catch(() => null),
    session.submitted_resume_id
      ? getSubmittedResume(session.submitted_resume_id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const currentPersona = (session.persona ?? "explorer") as "explorer" | "pressure" | "technical";
  const customInstructions =
    personaSettings.find((s) => s.persona === currentPersona)?.custom_instructions ?? "";

  // Build labeled document sections by type for richer prompt context.
  const documentSections = documents
    .filter((d) => d.normalized_text || d.parsed_text)
    .map((d) => {
      const label =
        d.type === "resume" ? "이력서"
        : d.type === "portfolio" ? "포트폴리오"
        : "GitHub 링크";
      return `[${label}: ${d.file_name ?? d.id}]\n${d.normalized_text ?? d.parsed_text}`;
    });

  // Build resumeTexts with priority: submitted resume > master resume > uploaded documents.
  // Submitted resume (if any) is placed first so agents treat it as the highest-priority context.
  const baseSections = masterResume && hasMasterResumeContent(masterResume)
    ? [`[마스터 이력서]\n${serializeMasterResume(masterResume)}`, ...documentSections]
    : documentSections;
  // content_json is the canonical form; content_md is only populated on rows
  // written before the structured format landed. Reading just content_md meant
  // every newly generated submitted resume was silently dropped from context.
  const submittedResumeText = submittedResume
    ? submittedResume.content_json
      ? serializeSubmittedResume(submittedResume.content_json)
      : submittedResume.content_md
    : "";
  const resumeTexts =
    submittedResume && submittedResumeText.trim()
      ? [
          `[제출용 이력서 - ${submittedResume.company_name} ${submittedResume.position}]\n${submittedResumeText}`,
          ...baseSections,
        ]
      : baseSections;
  const userProfile: UserProfileContext | undefined = profileData
    ? {
        name: profileData.name,
        jobCategory: profileData.job_category,
        yearsOfExperience: profileData.years_of_experience,
        techStack: profileData.tech_stack,
        skills: profileData.skills,
      }
    : undefined;

  // ── ANALYZE ──────────────────────────────────────────────────────────────
  if (type === "analyze") {
    const prompt = buildAnalysisPrompt({
      jdText: session.jd_text ?? "",
      resumeTexts,
      persona: session.persona ?? "explorer",
      durationMinutes: session.duration_minutes ?? 30,
      userProfile,
    });

    const raw = await runOneShot(prompt, "분석을 시작하세요.", user.id, apiKey, model);

    let analysisJson: AnalysisOutput;
    try {
      analysisJson = JSON.parse(extractJson(raw)) as AnalysisOutput;
    } catch {
      console.error("[analyze] raw:", JSON.stringify(raw));
      return Response.json({ error: "분석 결과 파싱 실패. 다시 시도해주세요." }, { status: 500 });
    }

    // Create the persistent ADK interview session with all per-interview state.
    const totalSeconds = (session.duration_minutes ?? 30) * 60;
    const adkSessionId = randomUUID();

    await sessionService.createSession({
      appName: APP_NAME,
      userId: user.id,
      sessionId: adkSessionId,
      state: {
        persona: session.persona ?? "explorer",
        jdText: session.jd_text ?? "",
        resumeTexts,
        analysisJson,
        remainingSeconds: totalSeconds,
        totalSeconds,
        userProfile: userProfile ?? null,
        customInstructions,
      },
    });

    // Persist analysis + ADK session ID in Supabase.
    await updateSession(sessionId, {
      analysis_json: analysisJson as unknown as Record<string, unknown>,
      adk_session_id: adkSessionId,
    });

    // Generate the first question via the interview agent (persistent session).
    const firstMsgRaw = await (async () => {
      let result = "";
      for await (const event of interviewRunner.runAsync({
        userId: user.id,
        sessionId: adkSessionId,
        newMessage: {
          role: "user",
          parts: [{ text: buildFirstQuestionPrompt(analysisJson) }],
        },
      })) {
        if (isFinalResponse(event)) result = stringifyContent(event);
      }
      return result;
    })();

    let firstMessage = firstMsgRaw;
    try {
      const parsed = JSON.parse(extractJson(firstMsgRaw)) as { message: string };
      firstMessage = parsed.message;
    } catch { /* use raw text */ }

    const firstQuestion = analysisJson.questions[0];
    const [, audioBase64] = await Promise.all([
      createMessage({
        session_id: sessionId,
        role: "interviewer",
        content: firstMessage,
        question_id: firstQuestion?.id,
        depth: 0,
        kind: "interviewer",
      }),
      generateTtsBase64(firstMessage),
    ]);

    return Response.json({ analysisJson, firstMessage, audioBase64 });
  }

  // ── RESPOND ──────────────────────────────────────────────────────────────
  if (type === "respond" && userMessage) {
    const analysisJson = session.analysis_json as unknown as AnalysisOutput | null;
    const adkSessionId = session.adk_session_id;

    if (!analysisJson || !adkSessionId) {
      return Response.json({ error: "면접 분석 데이터가 없습니다." }, { status: 400 });
    }

    // Hint usage is recorded in `kind`, so `content` is always the answer text
    // exactly as the user submitted it — nothing to strip before either the
    // agent call or evaluation.
    await createMessage({ session_id: sessionId, role: "user", content: userMessage, kind: userKind });

    const agentUserMessage = userMessage;

    // Ensure ADK session exists (handles cold-start reconstruction).
    const totalSeconds = (session.duration_minutes ?? 30) * 60;
    await ensureAdkSession({
      adkSessionId,
      userId: user.id,
      state: {
        persona: session.persona ?? "explorer",
        jdText: session.jd_text ?? "",
        resumeTexts,
        analysisJson,
        remainingSeconds: session.remaining_seconds ?? totalSeconds,
        totalSeconds,
        userProfile: userProfile ?? null,
        customInstructions,
      },
      sessionId,
    });

    let accumulated = "";
    for await (const event of interviewRunner.runAsync({
      userId: user.id,
      sessionId: adkSessionId,
      newMessage: {
        role: "user",
        parts: [{ text: buildRespondPrompt(agentUserMessage) }],
      },
    })) {
      if (isFinalResponse(event)) accumulated = stringifyContent(event);
    }

    let message = accumulated;
    let nextQuestionId: string | undefined;
    try {
      const parsed = JSON.parse(extractJson(accumulated)) as { message: string; next_question_id?: string | null };
      message = parsed.message;
      if (parsed.next_question_id) nextQuestionId = parsed.next_question_id;
    } catch { /* use raw */ }

    const [, audioBase64] = await Promise.all([
      createMessage({ session_id: sessionId, role: "interviewer", content: message, question_id: nextQuestionId, kind: "interviewer" }),
      generateTtsBase64(message),
    ]);

    return Response.json({ message, audioBase64 });
  }

  // ── HINT ─────────────────────────────────────────────────────────────────
  if (type === "hint") {
    const analysisJson = session.analysis_json as unknown as AnalysisOutput | null;
    const adkSessionId = session.adk_session_id;
    if (!analysisJson || !adkSessionId) {
      return Response.json({ error: "면접 분석 데이터가 없습니다." }, { status: 400 });
    }

    // Find current question from last interviewer message
    const messages = await getSessionMessages(sessionId);
    const currentQuestionId = [...messages].reverse().find((m) => m.question_id)?.question_id;
    const currentQuestionMeta = analysisJson.questions.find((q) => q.id === currentQuestionId);
    const lastInterviewerMsg = [...messages].reverse().find((m) => m.role === "interviewer");

    // Generate model answer and return — client will send it as a user message via respond.
    // Pass the last 6 messages as context so the hint agent knows what project/topic is being discussed.
    const recentMessages = messages.slice(-6).map((m) => ({ role: m.role, content: m.content ?? "" }));
    const hintPromptText = buildHintPrompt({
      currentQuestion: lastInterviewerMsg?.content ?? "",
      questionIntent: currentQuestionMeta?.intent ?? "",
      goodAnswerTips: currentQuestionMeta?.good_answer_tips ?? "",
      resumeTexts,
      recentMessages,
      userProfile,
    });
    const hintText = await runOneShot(hintPromptText, "모범 답안을 작성해주세요.", user.id, apiKey, model);

    return Response.json({ hint: hintText });
  }

  // ── SKIP ─────────────────────────────────────────────────────────────────
  if (type === "skip") {
    const analysisJson = session.analysis_json as unknown as AnalysisOutput | null;
    const adkSessionId = session.adk_session_id;
    if (!analysisJson || !adkSessionId) {
      return Response.json({ error: "면접 분석 데이터가 없습니다." }, { status: 400 });
    }

    // A skipped question carries no answer text — `kind` is the whole record.
    await createMessage({ session_id: sessionId, role: "user", content: "", kind: "skipped" });

    const totalSeconds = (session.duration_minutes ?? 30) * 60;
    await ensureAdkSession({
      adkSessionId,
      userId: user.id,
      state: {
        persona: session.persona ?? "explorer",
        jdText: session.jd_text ?? "",
        resumeTexts,
        analysisJson,
        remainingSeconds: session.remaining_seconds ?? totalSeconds,
        totalSeconds,
        userProfile: userProfile ?? null,
        customInstructions,
      },
      sessionId,
    });

    let accumulated = "";
    for await (const event of interviewRunner.runAsync({
      userId: user.id,
      sessionId: adkSessionId,
      newMessage: { role: "user", parts: [{ text: buildSkipPrompt() }] },
    })) {
      if (isFinalResponse(event)) accumulated = stringifyContent(event);
    }

    let message = accumulated;
    let nextQuestionId: string | undefined;
    try {
      const parsed = JSON.parse(extractJson(accumulated)) as { message: string; next_question_id?: string | null };
      message = parsed.message;
      if (parsed.next_question_id) nextQuestionId = parsed.next_question_id;
    } catch { /* use raw */ }

    const [, audioBase64] = await Promise.all([
      createMessage({ session_id: sessionId, role: "interviewer", content: message, question_id: nextQuestionId, kind: "interviewer" }),
      generateTtsBase64(message),
    ]);

    return Response.json({ message, audioBase64 });
  }

  // ── EVALUATE ─────────────────────────────────────────────────────────────
  if (type === "evaluate") {
    const analysisJson = session.analysis_json as unknown as AnalysisOutput | null;
    const messages = await getSessionMessages(sessionId);
    const safeAnalysis = analysisJson ?? { analysis: { jd_keywords: [], strengths: [], preferred_gaps: [] }, questions: [] };

    // Group messages by question_id (no LLM call needed).
    let activeQid: string | null = null;
    const groupMap = new Map<string, QaGroup>();

    for (const msg of messages) {
      if (msg.question_id) activeQid = msg.question_id;
      if (!activeQid) continue;

      if (!groupMap.has(activeQid)) {
        const meta = safeAnalysis.questions.find((q) => q.id === activeQid);
        groupMap.set(activeQid, {
          question_id: activeQid,
          question: meta?.question ?? "",
          intent: meta?.intent ?? "",
          good_answer_tips: meta?.good_answer_tips ?? "",
          turns: [] as QaTurn[],
          used_hint: false,
          skipped: false,
        });
      }

      const group = groupMap.get(activeQid)!;
      const content = msg.content ?? "";
      group.turns.push({ speaker: msg.role === "interviewer" ? "interviewer" : "user", content });
      if (msg.role === "user") {
        if (msg.kind === "hint_shown") group.used_hint = true;
        if (msg.kind === "skipped") group.skipped = true;
      }
    }

    const qaGroups = Array.from(groupMap.values());
    const jdKeywords = safeAnalysis.analysis.jd_keywords;
    const evaluatorUserId = user.id;

    // Hard stop for the whole handler. Each call gets whatever is left of the
    // budget, capped at ONESHOT_TIMEOUT_MS, so retries can never run past the
    // function's own limit and lose an otherwise-complete report.
    const budgetEndsAt = Date.now() + EVAL_BUDGET_MS;
    const remainingBudgetMs = () => budgetEndsAt - Date.now();
    const callTimeoutMs = () => Math.min(ONESHOT_TIMEOUT_MS, remainingBudgetMs());

    // Stage 1: Evaluate each question group individually.
    //
    // Skipped questions are not scored — only a reference answer is generated
    // for them. Everything else retries up to 3 times and, on final failure,
    // degrades to a `failed` record instead of throwing, so one bad answer
    // cannot wipe out the entire report.
    async function evaluateOneGroup(g: QaGroup): Promise<AnswerFinal> {
      if (g.skipped) {
        // Best-effort: a skipped question still ships if this call fails, it
        // just carries a placeholder instead of a real model answer.
        try {
          const prompt = buildSkippedModelAnswerPrompt({ qaGroup: g, resumeTexts, jdKeywords });
          const raw = await runOneShot(
            prompt, "모범 답안을 작성해주세요.", evaluatorUserId, apiKey, model, callTimeoutMs(),
          );
          const parsed = parseSkippedModelAnswer(JSON.parse(extractJson(raw)));
          return buildSkippedAnswer({
            question_id: g.question_id,
            question: g.question,
            intent: parsed.intent,
            model_answers: parsed.model_answers,
          });
        } catch (err) {
          console.error(`[evaluate] skipped-question model answer failed for ${g.question_id}:`, err);
          return buildSkippedAnswer({ question_id: g.question_id, question: g.question });
        }
      }

      const prompt = buildQuestionEvaluationPrompt({ qaGroup: g, resumeTexts, jdKeywords });
      for (let attempt = 0; attempt < 3; attempt++) {
        if (remainingBudgetMs() <= 0) {
          console.error(`[evaluate] budget exhausted before attempt ${attempt + 1} for ${g.question_id}`);
          break;
        }
        try {
          const raw = await runOneShot(
            prompt, "평가를 시작하세요.", evaluatorUserId, apiKey, model, callTimeoutMs(),
          );
          const parsed = parseQuestionEvaluation(JSON.parse(extractJson(raw)), g.question_id);
          return g.used_hint ? applyHintCap(parsed) : applyAnsweredOverrides(parsed);
        } catch (err) {
          console.error(`[evaluate] group ${g.question_id} attempt ${attempt + 1} failed:`, err);
        }
      }

      console.error(`[evaluate] group ${g.question_id} exhausted all attempts — degrading to failed card`);
      return buildFailedAnswer({ question_id: g.question_id, question: g.question });
    }

    const questionResults = await mapWithConcurrency(qaGroups, EVAL_CONCURRENCY, evaluateOneGroup);

    // If literally nothing could be evaluated there is no report worth
    // showing — fail loudly rather than render an empty one.
    const counts = countByStatus(questionResults);
    if (counts.total > 0 && counts.responded === 0 && counts.failed > 0) {
      return Response.json(
        { error: "답변 평가에 모두 실패했습니다. 잠시 후 리포트 생성을 다시 시도해주세요." },
        { status: 500 },
      );
    }

    const totalScore = computeTotalScore(questionResults);

    // Stage 2: Generate overall summary (with retry logic).
    let summaryResult: SummaryEvaluationParsed | undefined;
    let lastSummaryError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (remainingBudgetMs() <= 0) {
        console.error(`[evaluate] budget exhausted before summary attempt ${attempt + 1}`);
        break;
      }
      try {
        const summaryPrompt = buildSummaryEvaluationPrompt({
          questionResults,
          analysisJson: safeAnalysis,
          resumeTexts,
          totalScore,
          hintCount: counts.hinted,
          skippedCount: counts.skipped,
          failedCount: counts.failed,
        });
        const raw = await runOneShot(
          summaryPrompt, "종합 평가를 시작하세요.", evaluatorUserId, apiKey, model, callTimeoutMs(),
        );
        summaryResult = parseSummaryEvaluation(JSON.parse(extractJson(raw)));
        break;
      } catch (err) {
        lastSummaryError = err;
        console.error(`[evaluate] summary attempt ${attempt + 1} failed:`, err);
      }
    }
    if (!summaryResult) {
      console.error("[evaluate] summary final error:", lastSummaryError);
      return Response.json({ error: "종합 평가 실패. 다시 시도해주세요." }, { status: 500 });
    }

    // Combine stage 1 + stage 2 into EvaluationOutput shape.
    const qaGroupMap = new Map(qaGroups.map((g) => [g.question_id, g]));
    const answers = questionResults.map((r) => ({
      ...r,
      turns: qaGroupMap.get(r.question_id)?.turns ?? [],
    }));

    const reportJson = {
      // Server-computed, not LLM-reported: skipped and failed questions are
      // excluded from the mean.
      total_score: totalScore,
      summary: summaryResult.summary,
      strengths: summaryResult.strengths,
      strength_keywords: summaryResult.strength_keywords,
      improvements: summaryResult.improvements,
      improvement_keywords: summaryResult.improvement_keywords,
      answers,
    };

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error: reportError } = await supabase.from("interview_reports").upsert(
      {
        session_id: sessionId,
        total_score: reportJson.total_score,
        summary: reportJson.summary,
        report_json: reportJson,
      },
      { onConflict: "session_id" },
    );
    if (reportError) {
      console.error("[evaluate] failed to persist report:", reportError);
      return Response.json(
        { error: "리포트 저장에 실패했습니다. 리포트 생성을 다시 시도해주세요." },
        { status: 500 },
      );
    }

    return Response.json({ reportJson });
  }

  return Response.json({ error: "알 수 없는 요청 타입입니다." }, { status: 400 });
}
