"use client";

import { useState } from "react";
import { createClient } from "@/supabase/client";

export default function Home() {
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleTryDemo = async () => {
    setDemoLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      setDemoLoading(false);
      return;
    }
    // Give the demo user a display name so they appear correctly in sessions
    await supabase.from("profiles").upsert({
      id: data.user.id,
      display_name: "Demo User",
    });
    window.location.href = "/dashboard";
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-3xl font-bold mb-2">Poker Tracker</h1>
      <p className="text-gray-400 text-center">
        Track buy-ins, chip counts, and settle up with friends.
      </p>
      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleSignIn}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl w-full"
        >
          Sign In with Google
        </button>
        <button
          onClick={handleTryDemo}
          disabled={demoLoading}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 px-6 rounded-xl w-full transition-colors"
        >
          {demoLoading ? "Starting demo..." : "Try Demo"}
        </button>
      </div>
    </main>
  );
}