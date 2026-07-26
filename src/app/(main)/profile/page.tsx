import { getUser } from "@/lib/supabase/auth.server";
import { getUserProfile } from "@/lib/supabase/queries/profiles";
import ProfileForm from "@/components/profile/ProfileForm";

export default async function ProfilePage() {
  const user = await getUser();
  const profile = await getUserProfile(user!.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">내 소개</h1>
        <p className="text-base text-muted-foreground mt-1">
          직군, 연차, 기술 스택, 스킬을 입력하면 면접 질문에 반영됩니다.
        </p>
      </div>

      <ProfileForm profile={profile} />
    </div>
  );
}
