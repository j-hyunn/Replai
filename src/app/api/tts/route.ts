import { getUser } from "@/lib/supabase/auth.server";
import { generateTtsBase64 } from "@/lib/tts";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { text } = await req.json() as { text?: string };
  if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });

  const audioBase64 = await generateTtsBase64(text);
  if (!audioBase64) return Response.json({ error: "tts failed" }, { status: 500 });

  const bytes = Buffer.from(audioBase64, "base64");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "audio/wav" } });
}
