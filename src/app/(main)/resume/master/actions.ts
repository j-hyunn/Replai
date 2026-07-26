"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/auth.server";
import { upsertMasterResume, deleteMasterResume } from "@/lib/supabase/queries/master-resume";
import type { MasterResumeInput } from "@/lib/types/master-resume";

export interface ActionResult {
  error?: string;
}

export async function saveMasterResumeAction(data: MasterResumeInput): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  try {
    await upsertMasterResume(user.id, data);
    revalidatePath("/resume");
    revalidatePath("/resume/master");
    return {};
  } catch (e) {
    console.error("[saveMasterResumeAction]", e);
    return { error: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function deleteMasterResumeAction(): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해주세요." };

  try {
    await deleteMasterResume(user.id);
    revalidatePath("/resume");
    return {};
  } catch (e) {
    console.error("[deleteMasterResumeAction]", e);
    return { error: "삭제에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}
