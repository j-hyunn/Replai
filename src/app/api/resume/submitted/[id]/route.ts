import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/auth.server";
import { getSubmittedResume, deleteSubmittedResume } from "@/lib/supabase/queries/master-resume";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const resume = await getSubmittedResume(id);
  if (!resume) {
    return NextResponse.json({ error: "이력서를 찾을 수 없습니다." }, { status: 404 });
  }
  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  await deleteSubmittedResume(id);
  return NextResponse.json({ ok: true });
}
