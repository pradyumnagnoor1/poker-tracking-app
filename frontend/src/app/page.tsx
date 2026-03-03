"use client";

import { useState } from "react";
import { createClient } from "@/supabase/client";

export default function Home() {
    const [loading, setLoading] = useState(false);

    const handleSignIn = async () => {
        setLoading(true);
        const supabase = createClient();

        // On native iOS (Capacitor): open OAuth in an in-app browser with a
        // custom URL scheme so the app receives the code back via deep link.
        try {
            const { Capacitor } = await import("@capacitor/core");
            if (Capacitor.isNativePlatform()) {
                const { Browser } = await import("@capacitor/browser");
                const { data } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                        redirectTo: "com.stacklab.app://auth/callback",
                        skipBrowserRedirect: true,
                    },
                });
                if (data.url) await Browser.open({ url: data.url });
                setLoading(false);
                return;
            }
        } catch {
            // Not running in Capacitor — fall through to standard web flow
        }

        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            {/* Nav */}
            <nav className="px-6 pt-6 flex items-center justify-between max-w-5xl mx-auto w-full">
                <span className="text-lg font-bold tracking-tight">
                    Stack<span className="text-green-400">Lab</span>
                </span>
                <button
                    onClick={handleSignIn}
                    disabled={loading}
                    className="text-sm font-semibold text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                >
                    {loading ? "Redirecting..." : "Sign in"}
                </button>
            </nav>

            {/* Hero */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto w-full">
                <div className="mb-6 inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-xs font-semibold tracking-wide uppercase">Live Session Tracking</span>
                </div>

                <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 leading-tight">
                    Poker nights,<br />
                    <span className="text-green-400">settled instantly.</span>
                </h1>

                <p className="text-gray-400 text-lg mb-10 max-w-md">
                    Host a game, track buy-ins and rebuys, count chips, and settle up — all in one place.
                </p>

                <button
                    onClick={handleSignIn}
                    disabled={loading}
                    className="inline-flex items-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-60 text-gray-900 font-bold py-3.5 px-8 rounded-2xl text-base transition-all shadow-lg shadow-white/10 disabled:cursor-not-allowed"
                >
                    {/* Google icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {loading ? "Signing in..." : "Continue with Google"}
                </button>
            </main>

            {/* Feature cards */}
            <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                        <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center mb-3">
                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-1">Host or Join</h3>
                        <p className="text-gray-500 text-sm">Create a game with a 6-digit code or join a friend's session instantly.</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                        <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center mb-3">
                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-1">Track Everything</h3>
                        <p className="text-gray-500 text-sm">Log buy-ins, rebuys, and final chip counts with real-time updates for all players.</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                        <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center mb-3">
                            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-1">Settle &amp; Stats</h3>
                        <p className="text-gray-500 text-sm">Auto-calculated payouts minimize transfers. Track your lifetime wins and losses.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
