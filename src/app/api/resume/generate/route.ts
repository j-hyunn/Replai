export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/auth.server";
import { getMasterResume, createSubmittedResume } from "@/lib/supabase/queries/master-resume";
import { getUserAiConfig } from "@/lib/ai-config";
import type { ResumeAnalysis, SubmittedResumeContent } from "@/lib/types/master-resume";
import {
  buildJdAnalysisPrompt,
  buildFilterPrompt,
  buildRewritePrompt,
  buildFinalResumePrompt,
  type JdAnalysis,
  type FilteredContent,
  type RewrittenContent,
} from "@/lib/prompts/resume-generate";
import {
  parseFilteredContent,
  parseJdAnalysis,
  parseResumeAnalysis,
  parseSubmittedResumeContent,
} from "@/lib/resume/parse";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  company_name: string;
  position: string;
  jd_text: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

// ─── Gemini call with retry ───────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  maxRetries = 3
): Promise<string> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API responded with status ${res.status}`);
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      if (!text) {
        throw new Error("Empty response from Gemini API");
      }

      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[resume/generate] Gemini call attempt ${attempt} failed:`, lastError.message);
      if (attempt < maxRetries) {
        // Brief pause before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Calls Gemini and validates the parsed result, retrying on either failure.
 *
 * Parsing used to sit outside the retry loop, so a 200 response carrying
 * malformed JSON — the most common way an LLM stage fails — killed the whole
 * stage on the first try. Here a bad payload is just another failed attempt.
 */
async function callGeminiParsed<T>(
  apiKey: string,
  model: string,
  prompt: string,
  parse: (raw: unknown) => T,
  stage: string,
  maxRetries = 3
): Promise<T> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // One network attempt per outer attempt; callGemini's own retries would
      // otherwise multiply into 9 requests for a stage.
      const raw = await callGemini(apiKey, model, prompt, 1);
      return parse(JSON.parse(extractJson(raw)));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[resume/generate] ${stage} attempt ${attempt} failed:`, lastError.message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  // Find first { ... } or [ ... ] block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text.trim();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // Parse request
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { company_name, position, jd_text } = body;
  if (!company_name?.trim())
    return NextResponse.json({ error: "회사명을 입력해주세요." }, { status: 400 });
  if (!position?.trim())
    return NextResponse.json({ error: "포지션을 입력해주세요." }, { status: 400 });
  if (!jd_text?.trim())
    return NextResponse.json({ error: "JD 내용을 입력해주세요." }, { status: 400 });

  // Load master resume
  const masterResume = await getMasterResume(user.id);
  if (!masterResume) {
    return NextResponse.json(
      { error: "마스터 이력서를 먼저 작성해주세요." },
      { status: 422 }
    );
  }

  // Resolve API key and model
  const { apiKey, model } = await getUserAiConfig(user.id);

  // ── Stage 1: JD analysis + strategy ──────────────────────────────────────
  let jdAnalysis: JdAnalysis;
  try {
    const prompt1 = buildJdAnalysisPrompt(company_name.trim(), position.trim(), jd_text.trim());
    jdAnalysis = await callGeminiParsed(apiKey, model, prompt1, parseJdAnalysis, "JD analysis");
  } catch {
    return NextResponse.json(
      { error: "JD 분석에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  // ── Stage 2: Master resume filtering ─────────────────────────────────────
  let filteredContent: FilteredContent;
  try {
    const prompt2 = buildFilterPrompt(masterResume, jdAnalysis);
    filteredContent = await callGeminiParsed(
      apiKey, model, prompt2, parseFilteredContent, "Resume filtering",
    );
  } catch {
    return NextResponse.json(
      { error: "이력서 필터링에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  // ── Stage 3: JSON rewriting ───────────────────────────────────────────────
  let rewrittenContent: RewrittenContent;
  try {
    const prompt3 = buildRewritePrompt(masterResume, filteredContent, jdAnalysis, company_name.trim(), position.trim());
    rewrittenContent = await callGeminiParsed(
      apiKey, model, prompt3,
      (raw) => parseSubmittedResumeContent(raw, "Resume rewrite"),
      "Resume rewrite",
    );
  } catch {
    return NextResponse.json(
      { error: "문장 변환에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  // ── Stage 4: Analysis only ────────────────────────────────────────────────
  let rawFinal: string;
  try {
    const prompt4 = buildFinalResumePrompt(
      rewrittenContent,
      jdAnalysis,
      company_name.trim(),
      position.trim()
    );
    rawFinal = await callGemini(apiKey, model, prompt4);
  } catch {
    return NextResponse.json(
      { error: "최종 이력서 생성에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  // Parse final output — extract RESUME_JSON and ANALYSIS blocks
  const resumeJsonMatch = rawFinal.match(/---RESUME_JSON---([\s\S]*?)---ANALYSIS---/);
  const analysisMatch = rawFinal.match(/---ANALYSIS---([\s\S]*)$/);

  // Prefer the final RESUME_JSON block, but only if it validates — the stage 3
  // result already passed the same guard, so falling back to it is always safe.
  let contentJson: SubmittedResumeContent = rewrittenContent;
  if (resumeJsonMatch?.[1]) {
    try {
      contentJson = parseSubmittedResumeContent(
        JSON.parse(extractJson(resumeJsonMatch[1])),
        "Final resume block",
      );
    } catch (err) {
      console.error(
        "[resume/generate] final RESUME_JSON block rejected, keeping stage 3 result:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  let analysisJson: ResumeAnalysis = {
    keyword_mapping: [],
    highlights: [],
    missing_items: [],
  };

  if (analysisMatch?.[1]) {
    try {
      analysisJson = parseResumeAnalysis(JSON.parse(extractJson(analysisMatch[1])));
    } catch {
      // Keep empty analysis if parse fails — not a hard failure
    }
  }

  // Save to DB
  const saved = await createSubmittedResume({
    user_id: user.id,
    company_name: company_name.trim(),
    position: position.trim(),
    jd_text: jd_text.trim(),
    content_md: "",
    content_json: contentJson,
    analysis_json: analysisJson,
  });

  return NextResponse.json({ id: saved.id });
}
