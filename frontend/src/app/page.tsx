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
      <nav className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="text-xl font-bold tracking-tight">
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
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium px-3 py-1 rounded-full mb-6">
          🃏 Home game tracker
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 leading-tight">
          Stack<span className="text-green-400">Lab</span>
        </h1>

        <p className="text-gray-400 text-lg sm:text-xl max-w-md mb-2">
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

        <p className="text-gray-600 text-xs mt-4">Free to use · No setup required</p>
      </section>

      {/* Feature highlights */}
      <section className="px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-2xl mb-3">🎯</div>
            <h3 className="font-semibold mb-1">Host in seconds</h3>
            <p className="text-gray-500 text-sm">Create a game, share a 6-digit code, and players join instantly — like Kahoot for poker.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-2xl mb-3">💰</div>
            <h3 className="font-semibold mb-1">Auto settle-up</h3>
            <p className="text-gray-500 text-sm">Enter final chip stacks and StackLab calculates exactly who pays whom with minimal transfers.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-2xl mb-3">📈</div>
            <h3 className="font-semibold mb-1">Track your game</h3>
            <p className="text-gray-500 text-sm">See your lifetime profit/loss, session history, and how your game has evolved over time.</p>
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
