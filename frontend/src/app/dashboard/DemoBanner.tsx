"use client";

import { createClient } from "@/supabase/client";

export default function DemoBanner() {
    const handleUpgrade = async () => {
        const supabase = createClient();
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
    };

    return (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-3 mb-4 flex items-center justify-between gap-3">
            <p className="text-yellow-300 text-xs leading-snug">
                Demo mode — create a session to try it out. Sign in to save your progress.
            </p>
            <button
                onClick={handleUpgrade}
                className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors"
            >
                Sign In
            </button>
        </div>
    );
}
