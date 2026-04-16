/**
 * ADK Runner singletons for the Replai interview agents.
 *
 * Module-level singletons persist within a single Node.js process (warm
 * Vercel instance). On cold start the InMemorySessionService is empty, so
 * the API route reconstructs the session from the messages stored in
 * Supabase before calling runner.runAsync().
 */

import {
  LlmAgent,
  Runner,
  InMemorySessionService,
  Gemini,
  type InstructionProvider,
} from "@google/adk";
import { env } from "@/lib/env";
import { buildInterviewSystemPrompt } from "@/lib/prompts/interview";
import type { AnalysisOutput, UserProfileContext } from "@/lib/prompts/analysis";

const APP_NAME = "replai";
const MODEL = "gemini-2.5-flash";

// Shared session service — holds ADK sessions in memory for this process.
export const sessionService = new InMemorySessionService();

// Dynamic instruction reads per-interview context from the ADK session state.
// ctx.state is a State class instance — must use .get() or .toRecord(), not direct property access.
const interviewInstruction: InstructionProvider = (ctx) => {
  const s = ctx.state.toRecord();
  return buildInterviewSystemPrompt({
    persona: (s.persona as "explorer" | "pressure" | "technical") ?? "explorer",
    jdText: (s.jdText as string) ?? "",
    resumeTexts: (s.resumeTexts as string[]) ?? [],
    analysisJson: s.analysisJson as AnalysisOutput,
    remainingSeconds: (s.remainingSeconds as number) ?? 1800,
    totalSeconds: (s.totalSeconds as number) ?? 1800,
    userProfile: s.userProfile as UserProfileContext | undefined,
    customInstructions: (s.customInstructions as string) ?? "",
  });
};

const interviewAgent = new LlmAgent({
  name: "interview_agent",
  model: new Gemini({ model: MODEL, apiKey: env.googleApiKey }),
  instruction: interviewInstruction,
});

/**
 * Runner for the interview agent.
 * Use runner.runAsync({ userId, sessionId, newMessage }) per turn.
 */
export const interviewRunner = new Runner({
  agent: interviewAgent,
  appName: APP_NAME,
  sessionService,
});

export { APP_NAME };
