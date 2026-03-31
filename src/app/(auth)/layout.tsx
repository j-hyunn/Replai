import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirect already-authenticated users away from auth pages
  const user = await getUser();
  if (user) {
    redirect("/interview");
  }

  return <>{children}</>;
}
