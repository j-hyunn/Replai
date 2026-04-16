import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import Link from "next/link";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import AppBreadcrumb from "@/components/common/AppBreadcrumb";

export default async function ReportLayout({
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
      <header className="flex h-16 shrink-0 items-center gap-3 mx-4 mt-4 rounded-xl border bg-card px-5">
        <Link href="/interview" className="shrink-0">
          <Image src="/logo.svg" alt="Replai" width={28} height={28} />
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <AppBreadcrumb userName={userName} />
      </header>
      <main className="flex flex-1 min-h-0 p-4 pt-3">
        {children}
      </main>
    </div>
  );
}
