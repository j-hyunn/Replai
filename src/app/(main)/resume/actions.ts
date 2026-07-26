"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth.server";
import {
  createDocument,
  deleteDocument,
  updateNormalizedText,
  markNormalizeFailed,
  markNormalizePending,
  getDocumentsByIds,
  getNormalizeStatuses,
} from "@/lib/supabase/queries/documents";
import type { DocumentType, NormalizeStatus } from "@/lib/supabase/queries/documents";
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

// Vercel function maxDuration 60s 안에서 약간 마진을 둔다.
// gemini-2.5-flash-lite는 응답이 빠르지만 큰 포트폴리오(16K+ chars)는 시간이 걸린다.
const BACKGROUND_NORMALIZE_TIMEOUT_MS = 55_000;
const SYNC_NORMALIZE_TIMEOUT_MS = 55_000;

// 큰 문서에서 timeout이 자주 나는 경우에 대비해 더 빠른 모델 사용.
// flash-lite는 flash 대비 latency 약 1/2~1/3 수준. normalize는 재구성 작업이라 lite로 충분.
const NORMALIZE_MODEL = "gemini-2.5-flash-lite";

export interface ActionResult {
  error?: string;
  documentId?: string;
  storagePath?: string;
}

/**
 * Gemini로 텍스트를 정규화한다. 실패하면 null 반환.
 * 호출자가 status를 업데이트할지 결정한다.
 */
async function runNormalize(
  parsedText: string,
  type: DocumentType,
  timeoutMs: number
): Promise<string | null> {
  if (!parsedText) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const prompt = buildNormalizePrompt(parsedText, type);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${NORMALIZE_MODEL}:generateContent?key=${env.googleApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    console.error("[normalize error]", e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 단일 문서에 대해 동기적으로 normalize를 수행하고 결과를 DB에 반영한다.
 * 인터뷰 시작 가드 / 사용자 재시도 버튼에서 호출.
 */
async function normalizeDocumentSync(
  documentId: string,
  parsedText: string,
  type: DocumentType
): Promise<NormalizeStatus> {
  const normalized = await runNormalize(parsedText, type, SYNC_NORMALIZE_TIMEOUT_MS);
  if (normalized) {
    await updateNormalizedText(documentId, normalized);
    return "done";
  }
  await markNormalizeFailed(documentId);
  return "failed";
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
// normalize는 백그라운드(after)로 분리 — 응답은 createDocument 직후 반환.
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
    await supabase.storage.from("documents").remove([storagePath]);
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

  // 파싱 결과가 비었으면 Storage orphan 정리 후 실패 반환
  if (!parsedText) {
    await supabase.storage.from("documents").remove([storagePath]);
    return {
      error:
        "PDF에서 텍스트를 추출할 수 없습니다. 스캔본/이미지 PDF는 지원하지 않습니다. 다른 파일을 업로드해주세요.",
    };
  }

  // 우선 pending 상태로 저장하고 즉시 응답.
  const doc = await createDocument({
    user_id: user.id,
    type,
    file_url: storagePath,
    file_name: fileName,
    parsed_text: parsedText,
    normalize_status: "pending",
  });

  // 백그라운드 normalize — 응답 후 같은 함수 lifecycle 안에서 실행.
  // 실패해도 status='failed'로만 표기되고 인터뷰 시작 시점에 재시도 가능.
  after(async () => {
    try {
      const normalized = await runNormalize(parsedText, type, BACKGROUND_NORMALIZE_TIMEOUT_MS);
      if (normalized) {
        await updateNormalizedText(doc.id, normalized);
      } else {
        await markNormalizeFailed(doc.id);
      }
    } catch (e) {
      console.error("[background normalize failed]", doc.id, e);
      try {
        await markNormalizeFailed(doc.id);
      } catch {
        // 상태 업데이트도 실패하면 pending으로 남음 — 인터뷰 시작 가드가 ensure로 복구.
      }
    }
  });

  if (!options?.skipRevalidate) revalidatePath("/resume");
  return { documentId: doc.id, storagePath };
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

/**
 * 단일 문서의 normalize를 동기적으로 다시 시도한다 (카드의 "재시도" 버튼).
 */
export async function retryNormalizeAction(
  documentId: string
): Promise<{ status: NormalizeStatus; error?: string }> {
  const user = await getUser();
  if (!user) return { status: "failed", error: "로그인이 필요합니다." };

  const docs = await getDocumentsByIds([documentId]);
  const doc = docs[0];
  if (!doc) return { status: "failed", error: "문서를 찾을 수 없습니다." };
  if (doc.user_id !== user.id) return { status: "failed", error: "잘못된 접근입니다." };

  if (!doc.parsed_text || doc.parsed_text.length === 0) {
    return {
      status: "failed",
      error: "원본 텍스트가 비어 있어 분석할 수 없습니다. 문서를 다시 업로드해주세요.",
    };
  }

  await markNormalizePending(documentId);
  const status = await normalizeDocumentSync(documentId, doc.parsed_text, doc.type);
  revalidatePath("/resume");
  return { status };
}

/**
 * 인터뷰 시작 가드. 선택된 문서들 중 normalize_status !== 'done'인 항목을 동기 normalize.
 * 반환: 인터뷰에 사용 가능한 ready ids, 끝까지 실패한 failed ids.
 */
export async function ensureNormalizedAction(
  documentIds: string[]
): Promise<{ ready: string[]; failed: string[]; error?: string }> {
  const user = await getUser();
  if (!user) return { ready: [], failed: documentIds, error: "로그인이 필요합니다." };

  if (documentIds.length === 0) return { ready: [], failed: [] };

  const docs = await getDocumentsByIds(documentIds);
  // RLS가 user_id를 보장하지만 방어적으로 한 번 더 검증.
  const owned = docs.filter((d) => d.user_id === user.id);

  const ready: string[] = [];
  const failed: string[] = [];

  for (const doc of owned) {
    if (doc.normalize_status === "done") {
      ready.push(doc.id);
      continue;
    }

    if (!doc.parsed_text || doc.parsed_text.length === 0) {
      failed.push(doc.id);
      continue;
    }

    // pending이든 failed든 동기 normalize 한 번 더 돌린다.
    const status = await normalizeDocumentSync(doc.id, doc.parsed_text, doc.type);
    if (status === "done") {
      ready.push(doc.id);
    } else {
      failed.push(doc.id);
    }
  }

  if (failed.length > 0) revalidatePath("/resume");
  return { ready, failed };
}

/**
 * Polling용 가벼운 상태 조회.
 */
export async function getNormalizeStatusesAction(
  documentIds: string[]
): Promise<Array<{ id: string; normalize_status: NormalizeStatus }>> {
  const user = await getUser();
  if (!user) return [];
  if (documentIds.length === 0) return [];

  return getNormalizeStatuses(documentIds);
}
