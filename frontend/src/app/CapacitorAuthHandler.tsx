"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";

/**
 * Listens for the custom URL scheme deep link that fires after Google OAuth
 * completes in the Capacitor in-app browser (com.stacklab.app://auth/callback?code=...).
 * Exchanges the code for a Supabase session client-side and redirects to /dashboard.
 * Renders nothing — mount once in the root layout.
 */
export default function CapacitorAuthHandler() {
  const router = useRouter();

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    const setup = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", async (event) => {
          const url = new URL(event.url);
          const code = url.searchParams.get("code");
          if (!code) return;

          const supabase = createClient();
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) router.push("/dashboard");
        });

        removeListener = () => handle.remove();
      } catch {
        // Running in browser — no-op
      }
    };

    setup();
    return () => removeListener?.();
  }, [router]);

  return null;
}
