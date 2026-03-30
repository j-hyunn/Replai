import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/common/AppSidebar";
import Topbar from "@/components/common/Topbar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const userInfo = {
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "사용자",
    email: user.email ?? "",
    avatarUrl: user.user_metadata?.avatar_url ?? null,
  };

  return (
    <SidebarProvider>
      <AppSidebar user={userInfo} />
      <SidebarInset>
        <Topbar userName={userInfo.name} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
