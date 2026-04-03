"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth.server";
import {
  createDocument,
  deleteDocument,
  updateNormalizedText,
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
}

export async function uploadDocumentAction(
  formData: FormData
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  const file = formData.get("file") as File | null;
  const type = formData.get("type") as DocumentType | null;

  if (!file || !type) {
    return { error: "파일과 문서 유형이 필요합니다. 다시 시도해주세요." };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "PDF 또는 DOCX 파일만 업로드할 수 있습니다." };
  }

  const maxBytes = MAX_SIZE_BYTES[type] ?? 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = maxBytes / (1024 * 1024);
    return { error: `파일 크기는 ${maxMb}MB 이하여야 합니다.` };
  }

  const supabase = await createClient();
  const documentId = crypto.randomUUID();
  // Storage path follows {user_id}/{document_id} structure for isolation
  const storagePath = `${user.id}/${documentId}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file);

  if (storageError) {
    return {
      error: `파일 업로드에 실패했습니다: ${storageError.message}. 다시 시도해주세요.`,
    };
  }

  let parsedText = "";
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;
    const textParts: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      textParts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
      );
    }
    parsedText = textParts.join("\n").slice(0, 200_000);
  } catch (e) {
    console.error("[PDF parse error]", e);
    parsedText = "";
  }

  const doc = await createDocument({
    user_id: user.id,
    type,
    file_url: storagePath,
    file_name: file.name,
    parsed_text: parsedText,
  });

  // 정규화 에이전트 — 실패해도 업로드는 성공으로 처리
  if (parsedText) {
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
        }
      );
      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const normalized = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (normalized) {
          await updateNormalizedText(doc.id, normalized);
        }
      }
    } catch (e) {
      console.error("[normalize error]", e);
    }
  }

  revalidatePath("/resume");
  return {};
}

export async function saveGitLinkAction(
  gitUrl: string
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

  const doc = await createDocument({
    user_id: user.id,
    type: "git",
    file_url: trimmed,
    file_name: trimmed,
    parsed_text: parsedText,
  });

  // 정규화 에이전트 — 실패해도 저장은 성공으로 처리
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
        const normalized = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (normalized) {
          await updateNormalizedText(doc.id, normalized);
        }
      }
    } catch (e) {
      console.error("[normalize error]", e);
    }
  }

  revalidatePath("/resume");
  return {};
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
