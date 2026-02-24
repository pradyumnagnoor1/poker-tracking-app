"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession, signOut, addManualEntry, deleteManualEntry } from "./actions";
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
  isManual?: boolean;
};

type Tab = "play" | "stats" | "history";

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
  const router = useRouter();
  const [modal, setModal] = useState<"host" | "join" | null>(null);
  const [playerCount, setPlayerCount] = useState(6);
  const [tab, setTab] = useState<Tab>("play");
  const [showManualForm, setShowManualForm] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<string | null>(null);

  const activeSessions = sessions.filter((s) => s.state !== "closed");
  const historySessions = sessions.filter((s) => s.state === "closed");
  const totalProfit = sessionStats.length > 0 ? sessionStats[sessionStats.length - 1].cumulative : null;
  const manualEntries = sessionStats.filter((s) => s.isManual);

  const handleDeleteManualEntry = async (id: string) => {
    if (confirmDeleteEntry !== id) {
      setConfirmDeleteEntry(id);
      return;
    }
    setConfirmDeleteEntry(null);
    await deleteManualEntry(id);
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 max-w-lg mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">
            Stack<span className="text-green-400">Lab</span>
          </h1>
          <p className="text-gray-500 text-sm">{isAnonymous ? "Demo User" : fullName}</p>
        </div>
        <form action={signOut}>
          <button className="text-gray-500 text-sm hover:text-white transition-colors">Sign Out</button>
        </form>
      </header>

      {/* Tab Bar */}
      <div className="px-5 max-w-lg mx-auto mb-6">
        {isAnonymous && <div className="mb-4"><DemoBanner /></div>}
        <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1">
          <button
            onClick={() => setTab("play")}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "play" ? "bg-gray-700 text-white shadow" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Play
          </button>
          <button
            onClick={() => setTab("stats")}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "stats" ? "bg-gray-700 text-white shadow" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Stats
            {totalProfit !== null && (
              <span className={`text-xs font-semibold ${totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalProfit >= 0 ? `+$${totalProfit}` : `-$${Math.abs(totalProfit)}`}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "history" ? "bg-gray-700 text-white shadow" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            History
            {historySessions.length > 0 && (
              <span className="text-xs text-gray-500">{historySessions.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="px-5 max-w-lg mx-auto pb-16 space-y-6">

        {/* PLAY TAB */}
        {tab === "play" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModal("host")}
                className="group bg-green-500/10 border border-green-500/25 hover:bg-green-500/20 hover:border-green-500/50 rounded-2xl p-5 text-left transition-all"
              >
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                </div>
                <p className="font-semibold text-green-400 group-hover:text-green-300 transition-colors text-sm">
                  Host a Game
                </p>
                <p className="text-gray-600 text-xs mt-1">Create a new session</p>
              </button>

              <button
                onClick={() => setModal("join")}
                className="group bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/50 rounded-2xl p-5 text-left transition-all"
              >
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                </div>
                <p className="font-semibold text-blue-400 group-hover:text-blue-300 transition-colors text-sm">
                  Join a Game
                </p>
                <p className="text-gray-600 text-xs mt-1">Enter invite code</p>
              </button>
            </div>

            {activeSessions.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Active Sessions
                </h2>
                <SessionList sessions={activeSessions} />
              </section>
            )}

            {activeSessions.length === 0 && (
              <div className="text-center py-10 border border-gray-800 border-dashed rounded-2xl">
                <p className="text-gray-600 text-sm">No active games.</p>
                <p className="text-gray-700 text-xs mt-1">Host or join a game to get started.</p>
              </div>
            )}
          </>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <>
            {sessionStats.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Games</p>
                    <p className="text-xl font-bold">{sessionStats.length}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Wins</p>
                    <p className="text-xl font-bold text-green-400">
                      {sessionStats.filter((s) => s.profit > 0).length}
                    </p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Losses</p>
                    <p className="text-xl font-bold text-red-400">
                      {sessionStats.filter((s) => s.profit < 0).length}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-xs text-gray-500 mb-1">Lifetime P/L</p>
                  <p className={`text-3xl font-extrabold ${totalProfit! >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {totalProfit! >= 0 ? `+$${totalProfit}` : `-$${Math.abs(totalProfit!)}`}
                  </p>
                </div>

                <StatsChart stats={sessionStats} />
              </>
            ) : (
              <div className="text-center py-10 border border-gray-800 border-dashed rounded-2xl">
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No stats yet.</p>
                <p className="text-gray-700 text-xs mt-1">Complete a game or add a manual entry below.</p>
              </div>
            )}

            {/* Manual Entries */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Manual Entries</h3>
                <button
                  onClick={() => setShowManualForm((v) => !v)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showManualForm ? "Cancel" : "+ Add Entry"}
                </button>
              </div>

              {showManualForm && (
                <form
                  action={addManualEntry}
                  onSubmit={() => setShowManualForm(false)}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3 space-y-3"
                >
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Profit / Loss ($)</label>
                      <input
                        name="profit"
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. -20 or 50"
                        className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm placeholder-gray-600 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Date</label>
                      <input
                        name="playedAt"
                        type="date"
                        required
                        defaultValue={new Date().toISOString().split("T")[0]}
                        className="bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
                    <input
                      name="notes"
                      type="text"
                      placeholder="e.g. Home game at Jake's"
                      className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm placeholder-gray-600 outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Add Entry
                  </button>
                </form>
              )}

              {manualEntries.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {manualEntries.map((e) => (
                    <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(e.date + "T00:00:00").toLocaleDateString()} · Manual
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${e.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.profit >= 0 ? `+$${e.profit}` : `-$${Math.abs(e.profit)}`}
                        </span>
                        {confirmDeleteEntry === e.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleDeleteManualEntry(e.id)} className="text-xs text-red-500 hover:text-red-400 font-semibold">Remove</button>
                            <button onClick={() => setConfirmDeleteEntry(null)} className="text-xs text-gray-500 hover:text-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDeleteManualEntry(e.id)}
                            className="text-gray-600 hover:text-red-500 text-xs border border-gray-700 hover:border-red-800 px-2 py-0.5 rounded transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showManualForm && (
                <p className="text-gray-700 text-xs text-center py-4 border border-gray-800 border-dashed rounded-xl">
                  No manual entries yet. Add games you played outside the app.
                </p>
              )}
            </div>
          </>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <>
            {historySessions.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  {historySessions.length} Completed Game{historySessions.length !== 1 ? "s" : ""}
                </h2>
                <SessionList sessions={historySessions} />
              </section>
            ) : (
              <div className="text-center py-16 border border-gray-800 border-dashed rounded-2xl">
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No completed games yet.</p>
                <p className="text-gray-700 text-xs mt-1">Finished sessions will appear here.</p>
              </div>
            )}
          </>
        )}
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
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Host a Game</h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form action={createSession} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Session Name</label>
                <input
                  name="title"
                  placeholder="e.g. Friday Night Poker"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Max Players</label>
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
                <label className="text-xs font-medium text-gray-400 mb-2 block">Default Buy-In ($)</label>
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
                Create Game
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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form action={joinSession} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Invite Code</label>
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
                Join Game
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
