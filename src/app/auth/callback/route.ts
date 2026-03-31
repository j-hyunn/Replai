import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the Google OAuth callback from Supabase Auth.
 * Exchanges the authorization code for a session, then redirects:
 * - Success → /upload
 * - Failure → /login?error=true
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=true`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=true`);
  }

  const isPopup = searchParams.get("popup") === "true";
  if (isPopup) {
    return NextResponse.redirect(`${origin}/auth/popup-success`);
  }

  return NextResponse.redirect(`${origin}/interview`);
}
