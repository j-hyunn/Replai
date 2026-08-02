import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import { Separator } from "@/components/ui/separator";
import AppBreadcrumb from "@/components/common/AppBreadcrumb";
import EndInterviewButton from "@/components/interview/EndInterviewButton";
import InterviewExitDialog from "@/components/interview/InterviewExitDialog";

export default async function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const userName =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? "사용자";

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--sidebar)" }}>
      <header className="flex h-14 md:h-16 shrink-0 items-center gap-2 md:gap-3 mx-2 mt-2 md:mx-4 md:mt-4 rounded-xl border bg-card px-3 md:px-5">
        <InterviewExitDialog />
        <Separator orientation="vertical" className="h-4" />
        <AppBreadcrumb userName={userName} />
        <div className="ml-auto">
          <EndInterviewButton />
        </div>
      </header>
      <main className="flex flex-1 min-h-0 p-2 pt-2 md:p-4 md:pt-3">
        {children}
      </main>
    </div>
  );
}
