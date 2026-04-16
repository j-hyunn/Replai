import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="mb-8">
        <span className="text-2xl font-bold tracking-tight">Replai</span>
      </div>
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
