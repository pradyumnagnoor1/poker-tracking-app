"use client";

import { useState } from "react";
import { createSession, joinSession, signOut } from "./actions";
import StatsChart from "./StatsChart";
import SessionList from "./SessionList";
import DemoBanner from "./DemoBanner";

type Session = {
  id: string;
  title: string;
  state: string;
  invite_code: string;
  created_at: string;
  role: string;
};

type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
};

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8];

export default function DashboardClient({
  fullName,
  sessions,
  sessionStats,
  isAnonymous,
}: {
  fullName: string;
  sessions: Session[];
  sessionStats: SessionStat[];
  isAnonymous: boolean;
}) {
  const [modal, setModal] = useState<"host" | "join" | null>(null);
  const [playerCount, setPlayerCount] = useState(6);

  const activeSessions = sessions.filter(
    (s) => s.state !== "closed"
  );
  const historySessions = sessions.filter((s) => s.state === "closed");

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 max-w-lg mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">
            Stack<span className="text-green-400">Lab</span>
          </h1>
          <p className="text-gray-500 text-sm">
            {isAnonymous ? "Demo User" : fullName}
          </p>
        </div>
        <form action={signOut}>
          <button className="text-gray-500 text-sm hover:text-white transition-colors">
            Sign Out
          </button>
        </form>
      </header>

      <div className="px-5 max-w-lg mx-auto pb-16 space-y-8">
        {isAnonymous && <DemoBanner />}

        {/* Action Cards */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setModal("host")}
            className="group bg-green-500/10 border border-green-500/25 hover:bg-green-500/20 hover:border-green-500/50 rounded-2xl p-5 text-left transition-all"
          >
            <div className="text-2xl mb-3">🎲</div>
            <p className="font-semibold text-green-400 group-hover:text-green-300 transition-colors">
              Host a Game
            </p>
            <p className="text-gray-600 text-xs mt-1">Create a new session</p>
          </button>

          <button
            onClick={() => setModal("join")}
            className="group bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/50 rounded-2xl p-5 text-left transition-all"
          >
            <div className="text-2xl mb-3">🔗</div>
            <p className="font-semibold text-blue-400 group-hover:text-blue-300 transition-colors">
              Join a Game
            </p>
            <p className="text-gray-600 text-xs mt-1">Enter invite code</p>
          </button>
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Active Sessions
            </h2>
            <SessionList sessions={activeSessions} />
          </section>
        )}

        {/* Stats */}
        {sessionStats.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Your Stats
            </h2>
            <StatsChart stats={sessionStats} />
          </section>
        )}

        {/* Game History */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Game History
          </h2>
          {historySessions.length > 0 ? (
            <SessionList sessions={historySessions} />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-gray-600 text-sm">No completed games yet.</p>
              <p className="text-gray-700 text-xs mt-1">
                Finished sessions will appear here.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Host Modal */}
      {modal === "host" && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar for mobile */}
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Host a Game</h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <form action={createSession} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Session Name
                </label>
                <input
                  name="title"
                  placeholder="e.g. Friday Night Poker"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Max Players
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PLAYER_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPlayerCount(n)}
                      className={`w-10 h-10 rounded-xl text-sm font-semibold transition-colors ${
                        playerCount === n
                          ? "bg-green-500 text-black"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="maxPlayers" value={playerCount} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Default Buy-In ($)
                </label>
                <input
                  name="buyInDefault"
                  type="number"
                  min="1"
                  placeholder="e.g. 20"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-colors"
              >
                Create Game →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {modal === "join" && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Join a Game</h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <form action={joinSession} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Invite Code
                </label>
                <input
                  name="code"
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-4 py-3 text-lg placeholder-gray-600 uppercase tracking-[0.3em] text-center font-mono outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3.5 rounded-xl transition-colors"
              >
                Join Game →
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
