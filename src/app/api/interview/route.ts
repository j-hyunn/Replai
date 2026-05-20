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
import { getSessionMessages, createMessage } from "@/lib/supabase/queries/messages";
import { getUserAiConfig } from "@/lib/ai-config";
import { generateTtsBase64 } from "@/lib/tts";
import { buildAnalysisPrompt, type AnalysisOutput, type UserProfileContext } from "@/lib/prompts/analysis";
import { getUserProfile } from "@/lib/supabase/queries/profiles";
import { getPersonaSettings } from "@/lib/supabase/queries/personaSettings";
import { buildFirstQuestionPrompt, buildRespondPrompt, buildSkipPrompt, buildHintPrompt } from "@/lib/prompts/interview";
import type { QaGroup as EvaluationQaGroup } from "@/lib/prompts/evaluation";
import { sessionService, interviewRunner, APP_NAME } from "@/lib/agents/runners";
import { evaluateAllAnswers, evaluateAnswer, evaluateSummary } from "@/lib/evaluation/run";
import {
  buildSkippedAnswer,
  computeTotalScore,
  countByStatus,
  type AnswerFinal,
} from "@/lib/evaluation/postprocess";
import type { MessageKind } from "@/lib/supabase/queries/messages";

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
async function runOneShot(instruction: string, userMessage: string, userId: string, apiKey: string, model: string): Promise<string> {
  const agent = new LlmAgent({ name: "oneshot_agent", model: makeGemini(apiKey, model), instruction: () => instruction });
  const runner = new Runner({ agent, appName: APP_NAME, sessionService: new InMemorySessionService() });

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
    if (!msg.content) continue;

    const isUser = msg.role === "user";
    const event = createEvent({
      invocationId: `replay-${invocationIndex++}`,
      author: isUser ? "user" : "interview_agent",
      content: {
        role: isUser ? "user" : "model",
        parts: [{ text: msg.content }],
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
    kind?: "answer" | "hint_shown";
    questionId?: string;
  };
  const { type, sessionId, userMessage } = body;

  const session = await getSession(sessionId);
  if (!session || session.user_id !== user.id) {
    return new Response("Not Found", { status: 404 });
  }

  // Fetch resume texts, user profile, and persona settings in parallel
  const [documents, profileData, personaSettings] = await Promise.all([
    getDocumentsByIds(session.resume_ids ?? []),
    getUserProfile(user.id).catch(() => null),
    getPersonaSettings(user.id).catch(() => []),
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

  // Legacy alias used by prompts — contains all document texts.
  const resumeTexts = documentSections;
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

    // Save user message with the kind declared by the client. Default is
    // 'answer' for backwards compatibility, but the client should send
    // 'hint_shown' after the user opened the hint so the evaluation
    // pipeline knows to apply the score cap.
    const userKind: MessageKind = body.kind === "hint_shown" ? "hint_shown" : "answer";
    await createMessage({
      session_id: sessionId,
      role: "user",
      content: userMessage,
      kind: userKind,
    });

    // For hint_shown turns we must NOT feed the model answer text back into
    // the interview agent as if the user had spoken it — the agent would
    // generate follow-ups assuming the user delivered that content. Send a
    // short neutral stand-in instead. The full hint text is still preserved
    // in DB (content) for the evaluator and the report UI.
    const agentUserMessage =
      userKind === "hint_shown"
        ? "사용자가 모범 답안을 참조했습니다. 다음 질문으로 자연스럽게 넘어가주세요."
        : userMessage;

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

    await createMessage({
      session_id: sessionId,
      role: "user",
      content: "",
      kind: "skipped",
    });

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
    const safeAnalysis = analysisJson ?? {
      analysis: { jd_keywords: [], strengths: [], preferred_gaps: [] },
      questions: [],
    };

    const qaGroups = groupMessagesByQuestion(messages, safeAnalysis);

    // Evaluate every question in parallel. Each call has its own retry +
    // fallback chain. Failures surface as `failed` AnswerFinal entries,
    // not thrown exceptions, so a single bad answer never breaks the
    // whole report.
    const finalized = await evaluateAllAnswers({
      qaGroups,
      analysisJson: safeAnalysis,
      resumeTexts,
      apiKey,
      model,
    });

    const reportJson = await assembleReport({
      finalized,
      qaGroups,
      analysisJson: safeAnalysis,
      resumeTexts,
      apiKey,
      model,
    });

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.from("interview_reports").upsert(
      {
        session_id: sessionId,
        total_score: reportJson.total_score,
        summary: reportJson.summary,
        report_json: reportJson,
      },
      { onConflict: "session_id" },
    );

    return Response.json({ reportJson });
  }

  // ── REEVALUATE (single question) ─────────────────────────────────────────
  if (type === "reevaluate" && body.questionId) {
    const analysisJson = session.analysis_json as unknown as AnalysisOutput | null;
    const messages = await getSessionMessages(sessionId);
    const safeAnalysis = analysisJson ?? {
      analysis: { jd_keywords: [], strengths: [], preferred_gaps: [] },
      questions: [],
    };

    const qaGroups = groupMessagesByQuestion(messages, safeAnalysis);
    const target = qaGroups.find((g) => g.question_id === body.questionId);
    if (!target) {
      return Response.json({ error: "해당 질문을 찾을 수 없습니다." }, { status: 404 });
    }

    const replacement = await evaluateAnswer({
      qaGroup: target,
      analysisJson: safeAnalysis,
      resumeTexts,
      apiKey,
      model,
    });

    // Load current report, replace just this answer, recompute totals,
    // and rebuild the summary so it stays consistent.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("interview_reports")
      .select("report_json")
      .eq("session_id", sessionId)
      .maybeSingle();

    type StoredAnswer = AnswerFinal & { turns?: Array<{ speaker: "interviewer" | "user"; content: string }> };
    const currentReport = (existing?.report_json as { answers?: StoredAnswer[] } | null) ?? null;
    const currentAnswers: StoredAnswer[] = currentReport?.answers ?? [];
    const idx = currentAnswers.findIndex((a) => a.question_id === body.questionId);
    const replacementWithTurns: StoredAnswer = {
      ...replacement,
      turns: target.turns,
    };
    const nextAnswers =
      idx >= 0
        ? currentAnswers.map((a, i) => (i === idx ? replacementWithTurns : a))
        : [...currentAnswers, replacementWithTurns];

    const reportJson = await assembleReport({
      finalized: nextAnswers,
      qaGroups,
      analysisJson: safeAnalysis,
      resumeTexts,
      apiKey,
      model,
    });

    await supabase.from("interview_reports").upsert(
      {
        session_id: sessionId,
        total_score: reportJson.total_score,
        summary: reportJson.summary,
        report_json: reportJson,
      },
      { onConflict: "session_id" },
    );

    return Response.json({ reportJson });
  }

  return Response.json({ error: "알 수 없는 요청 타입입니다." }, { status: 400 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (used by evaluate + reevaluate)
// ─────────────────────────────────────────────────────────────────────────────

// Build QaGroups from raw messages using the new `kind` column.
// question_id is propagated forward so follow-up turns inherit the parent.
// `hint_shown` / `skipped` flags now come from `kind`, not from inline
// markers in content — that removes the entire sanitization layer.
function groupMessagesByQuestion(
  messages: ReadonlyArray<{
    role: "interviewer" | "user";
    content: string | null;
    question_id: string | null;
    kind: "answer" | "hint_shown" | "skipped" | "interviewer";
  }>,
  analysis: AnalysisOutput,
): EvaluationQaGroup[] {
  let activeQid: string | null = null;
  const groupMap = new Map<string, EvaluationQaGroup>();

  for (const msg of messages) {
    if (msg.question_id) activeQid = msg.question_id;
    if (!activeQid) continue;

    if (!groupMap.has(activeQid)) {
      const meta = analysis.questions.find((q) => q.id === activeQid);
      groupMap.set(activeQid, {
        question_id: activeQid,
        question: meta?.question ?? "",
        intent: meta?.intent ?? "",
        good_answer_tips: meta?.good_answer_tips ?? "",
        turns: [],
        used_hint: false,
        skipped: false,
      });
    }

    const group = groupMap.get(activeQid)!;
    const content = msg.content ?? "";
    if (msg.kind === "skipped") {
      group.skipped = true;
      // Don't push a turn for skipped — content is empty by design.
      continue;
    }
    if (msg.kind === "hint_shown") {
      group.used_hint = true;
    }
    group.turns.push({
      speaker: msg.role === "interviewer" ? "interviewer" : "user",
      content,
    });
  }

  return Array.from(groupMap.values());
}

// Merge per-question results into a single legacy-shaped reportJson
// (so existing UI keeps working), compute total_score deterministically,
// and call evaluateSummary for the narrative fields.
async function assembleReport(input: {
  finalized: ReadonlyArray<AnswerFinal & { turns?: Array<{ speaker: "interviewer" | "user"; content: string }> }>;
  qaGroups: ReadonlyArray<EvaluationQaGroup>;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
  apiKey: string;
  model: string;
}) {
  const { finalized, qaGroups, analysisJson, resumeTexts, apiKey, model } = input;

  const turnsByQid = new Map(qaGroups.map((g) => [g.question_id, g.turns]));
  const totalScore = computeTotalScore(finalized);
  const counts = countByStatus(finalized);
  const hintCount = finalized.filter((a) => a.status === "hint_shown").length;

  // Summary call uses the already-finalized answers so it speaks the
  // same numbers the user will see.
  let summaryOut: Awaited<ReturnType<typeof evaluateSummary>> | null = null;
  try {
    summaryOut = await evaluateSummary({
      answers: finalized,
      analysisJson,
      resumeTexts,
      totalScore,
      skippedCount: counts.skipped,
      hintCount,
      apiKey,
      model,
    });
  } catch {
    summaryOut = {
      summary:
        "종합 평가 생성에 실패했습니다. 답변별 점수와 피드백은 확인 가능합니다.",
      strengths: "각 답변별 피드백을 참고해주세요.",
      strength_keywords: ["답변별 피드백 확인"],
      improvements: "각 답변별 피드백을 참고해주세요.",
      improvement_keywords: ["답변별 피드백 확인"],
    };
  }

  return {
    total_score: totalScore,
    summary: summaryOut.summary,
    strengths: summaryOut.strengths,
    strength_keywords: summaryOut.strength_keywords,
    improvements: summaryOut.improvements,
    improvement_keywords: summaryOut.improvement_keywords,
    counts,
    answers: finalized.map((a) => ({
      question_id: a.question_id,
      question: a.question,
      answer: a.answer,
      scores: a.scores,
      average: a.average,
      intent: a.intent,
      feedback: a.feedback,
      model_answers: a.model_answers,
      status: a.status,
      turns: a.turns ?? turnsByQid.get(a.question_id) ?? [],
    })),
  };
}

// Suppress unused warning for the deterministic skipped helper when the
// route file is read in isolation; it is used by the reevaluate path.
void buildSkippedAnswer;
