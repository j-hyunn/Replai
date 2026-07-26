import { getUser } from "@/lib/supabase/auth.server";
import { Separator } from "@/components/ui/separator";
import ProfileSection from "@/components/settings/ProfileSection";
import AccountInfoSection from "@/components/settings/AccountInfoSection";
import DangerZone from "@/components/settings/DangerZone";
export default async function SettingsPage() {
  const user = await getUser();
  if (!user) return null;

  const name =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? "사용자";
  const email = user.email ?? "";
  const avatarUrl = user.user_metadata?.avatar_url ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">계정 설정</h1>
        <p className="text-base text-muted-foreground mt-1">
          계정 정보를 확인하고 관리하세요.
        </p>
      </div>

      <ProfileSection name={name} email={email} avatarUrl={avatarUrl} />

      <Separator />

      <AccountInfoSection user={user} />

      <Separator />

      <DangerZone />
    </div>
  );
}
