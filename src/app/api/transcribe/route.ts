import { getUser } from "@/lib/supabase/auth.server";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const formData = await req.formData();
  const file = formData.get("audio");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "audio blob required" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  // Strip codec info (e.g. "audio/webm;codecs=opus" → "audio/webm") — Gemini rejects extended MIME types
  const mimeType = (file.type || "audio/webm").split(";")[0];

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.googleApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              {
                text: "이 오디오를 한국어로 전사해주세요. 전사된 텍스트만 반환하고 다른 설명은 필요없어요.",
              },
            ],
          },
        ],
      }),
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    console.error("Gemini transcribe error:", err);
    return Response.json({ error: "transcription failed" }, { status: 500 });
  }

  const data = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  return Response.json({ transcript });
}
