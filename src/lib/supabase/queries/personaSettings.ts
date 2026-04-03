import { createClient } from "@/lib/supabase/server";

export type Persona = "explorer" | "pressure" | "technical";

export interface UserPersonaSetting {
  persona: Persona;
  custom_instructions: string;
}

export async function getPersonaSettings(userId: string): Promise<UserPersonaSetting[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_persona_settings")
    .select("persona, custom_instructions")
    .eq("user_id", userId);
  return (data ?? []) as UserPersonaSetting[];
}

export async function upsertPersonaSetting(
  userId: string,
  persona: Persona,
  customInstructions: string
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("user_persona_settings").upsert(
    { user_id: userId, persona, custom_instructions: customInstructions, updated_at: new Date().toISOString() },
    { onConflict: "user_id,persona" }
  );
}
