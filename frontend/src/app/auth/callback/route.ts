import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Construct origin robustly — Vercel forwards the real host via x-forwarded-host
  const hdrs = await headers();
  const forwardedHost = hdrs.get("x-forwarded-host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${proto}://${forwardedHost}`
    : new URL(request.url).origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Ensure profile row exists (trigger handles new users, this covers edge cases)
      await supabase.from("profiles").upsert({
        id: data.user.id,
        display_name: data.user.user_metadata?.full_name ?? data.user.email ?? "Player",
      }, { onConflict: "id" });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}