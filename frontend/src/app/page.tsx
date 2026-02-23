"use client";

import { createClient } from "@/supabase/client";

export default function Home() {
  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full border-b border-gray-900">
        <span className="text-lg font-bold tracking-tight">
          Stack<span className="text-green-400">Lab</span>
        </span>
        <button
          onClick={handleSignIn}
          className="text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-1.5 rounded-lg transition-colors"
        >
          Sign In
        </button>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium px-3 py-1 rounded-full mb-8">
          Home game tracker
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5 leading-tight">
          Stack<span className="text-green-400">Lab</span>
        </h1>

        <p className="text-gray-400 text-lg sm:text-xl max-w-md mb-3">
          The easiest way to run your home poker game.
        </p>
        <p className="text-gray-600 text-sm max-w-sm mb-10">
          Track buy-ins, chip counts, and settle up automatically — no pen and paper needed.
        </p>

        <button
          onClick={handleSignIn}
          className="bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 px-8 rounded-xl text-base transition-colors shadow-lg shadow-green-500/20"
        >
          Sign In with Google
        </button>

        <p className="text-gray-700 text-xs mt-4">Free to use · No setup required</p>
      </section>

      {/* Feature highlights */}
      <section className="px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-9 h-9 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Host in seconds</h3>
            <p className="text-gray-500 text-sm">Create a game, share a 6-digit code, and players join instantly.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Auto settle-up</h3>
            <p className="text-gray-500 text-sm">Enter final chip stacks and StackLab calculates exactly who pays whom.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-9 h-9 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Track your game</h3>
            <p className="text-gray-500 text-sm">See your lifetime profit/loss, session history, and performance over time.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-gray-700 text-xs border-t border-gray-900">
        StackLab · Built for home games
      </footer>
    </main>
  );
}
