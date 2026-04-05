"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth.server";
import {
  createDocument,
  deleteDocument,
} from "@/lib/supabase/queries/documents";
import type { DocumentType } from "@/lib/supabase/queries/documents";
import { buildNormalizePrompt } from "@/lib/prompts/normalize";
import { env } from "@/lib/env";
const ALLOWED_MIME_TYPES = [
  "application/pdf",
];
const MAX_SIZE_BYTES: Record<DocumentType, number> = {
  resume: 10 * 1024 * 1024,    // 10MB
  portfolio: 20 * 1024 * 1024, // 20MB
  git: 0,
};

export interface ActionResult {
  error?: string;
  documentId?: string;
  storagePath?: string;
}

// 1단계: Presigned URL 발급
// 파일은 전달받지 않음 — 메타데이터만 검증 후 업로드 URL 반환
export async function getUploadUrlAction(
  type: DocumentType,
  _fileName: string,
  fileSize: number,
  mimeType: string
): Promise<{ error?: string; signedUrl?: string; token?: string; storagePath?: string; documentId?: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { error: "PDF 파일만 업로드할 수 있습니다." };
  }

  const maxBytes = MAX_SIZE_BYTES[type] ?? 10 * 1024 * 1024;
  if (fileSize > maxBytes) {
    const maxMb = maxBytes / (1024 * 1024);
    return { error: `파일 크기는 ${maxMb}MB 이하여야 합니다.` };
  }

  const supabase = await createClient();
  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}`;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { error: `업로드 URL 생성에 실패했습니다: ${error?.message}. 다시 시도해주세요.` };
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    documentId,
  };
}

// 2단계: 업로드 완료 후 파싱 + DB 저장
// 클라이언트가 Supabase에 직접 업로드 완료 후 호출
export async function processUploadedDocumentAction(
  _documentId: string,
  storagePath: string,
  type: DocumentType,
  fileName: string,
  options?: { skipRevalidate?: boolean }
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  // storagePath가 현재 유저 소유인지 검증
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: "잘못된 접근입니다." };
  }

  const supabase = await createClient();

  // Supabase Storage에서 파일 다운로드 (서버 간 통신 — Vercel 4.5MB 제한 없음)
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(storagePath);

  if (downloadError || !fileData) {
    return { error: `파일 로드에 실패했습니다: ${downloadError?.message}. 다시 시도해주세요.` };
  }

  const arrayBuffer = await fileData.arrayBuffer();

  // unpdf로 텍스트 추출
  let parsedText = "";
  try {
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(arrayBuffer), {
      mergePages: false,
    });
    parsedText = Array.isArray(text)
      ? text.join("\n").slice(0, 200_000)
      : String(text).slice(0, 200_000);
  } catch (e) {
    console.error("[PDF parse error]", e);
    parsedText = "";
  }

  // 정규화 에이전트 — 50초 타임아웃, 초과 시 Storage 정리 후 에러 반환
  let normalizedText: string | undefined;
  if (parsedText) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50_000);
    try {
      const prompt = buildNormalizePrompt(parsedText, type);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.googleApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        }
      );
      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        normalizedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      }
    } catch (e) {
      if (controller.signal.aborted) {
        await supabase.storage.from("documents").remove([storagePath]);
        return { error: "파일 처리 시간이 초과되었습니다. 다시 업로드해주세요." };
      }
      console.error("[normalize error]", e);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const doc = await createDocument({
    user_id: user.id,
    type,
    file_url: storagePath,
    file_name: fileName,
    parsed_text: parsedText,
    normalized_text: normalizedText,
  });

  if (!options?.skipRevalidate) revalidatePath("/resume");
  return { documentId: doc.id, storagePath };
}

export async function saveGitLinkAction(
  gitUrl: string,
  options?: { skipRevalidate?: boolean }
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  const trimmed = gitUrl.trim();
  if (!trimmed) return { error: "GitHub URL을 입력해주세요." };

  try {
    new URL(trimmed);
  } catch {
    return { error: "올바른 URL 형식이 아닙니다." };
  }

  let parsedText = "";
  try {
    const match = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      const [, owner, repo] = match;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "reHEARsal" } }
      );
      if (res.ok) {
        const data = await res.json() as { content?: string };
        if (data.content) {
          parsedText = Buffer.from(data.content, "base64").toString("utf-8").slice(0, 20_000);
        }
      }
    }
  } catch {
    parsedText = "";
  }

  // 정규화 에이전트 — 실패해도 저장은 성공으로 처리
  let normalizedText: string | undefined;
  if (parsedText) {
    try {
      const prompt = buildNormalizePrompt(parsedText, "git");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.googleApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        normalizedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      }
    } catch (e) {
      console.error("[normalize error]", e);
    }
  }

  const doc = await createDocument({
    user_id: user.id,
    type: "git",
    file_url: trimmed,
    file_name: trimmed,
    parsed_text: parsedText,
    normalized_text: normalizedText,
  });

  if (!options?.skipRevalidate) revalidatePath("/resume");
  return { documentId: doc.id, storagePath: "" };
}

export async function revalidateDocumentsAction(): Promise<void> {
  revalidatePath("/resume");
}

export async function deleteDocumentAction(
  documentId: string,
  storagePath: string
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  await deleteDocument(documentId, storagePath);
  revalidatePath("/resume");
  return {};
}
