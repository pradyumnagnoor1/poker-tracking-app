"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setUsername, setDisplayName } from "./actions";

export default function SettingsClient({
  currentUsername,
  displayName: initialDisplayName,
}: {
  currentUsername: string | null;
  displayName: string;
}) {
  const router = useRouter();

  // Username
  const [username, setUsernameInput] = useState(currentUsername ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // Display name
  const [displayName, setDisplayNameInput] = useState(initialDisplayName);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [displaySuccess, setDisplaySuccess] = useState(false);

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = username.toLowerCase().trim();
    if (!val) return;
    setSavingUsername(true);
    setUsernameError(null);
    setUsernameSuccess(false);
    try {
      await setUsername(val);
      setUsernameSuccess(true);
      router.refresh();
    } catch (err) {
      setUsernameError((err as Error).message);
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = displayName.trim();
    if (!val) return;
    setSavingDisplay(true);
    setDisplayError(null);
    setDisplaySuccess(false);
    try {
      await setDisplayName(val);
      setDisplaySuccess(true);
      router.refresh();
    } catch (err) {
      setDisplayError((err as Error).message);
    } finally {
      setSavingDisplay(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="px-5 pt-6 pb-4 max-w-lg mx-auto flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-800 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="px-5 max-w-lg mx-auto space-y-6 pb-16">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Account</p>

          {/* Display Name */}
          <form onSubmit={handleSaveDisplayName} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => { setDisplayNameInput(e.target.value); setDisplayError(null); setDisplaySuccess(false); }}
                placeholder="Your name"
                maxLength={50}
                className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1">Shown to other players in sessions and groups.</p>
            </div>
            {displayError && <p className="text-sm text-red-400">{displayError}</p>}
            {displaySuccess && <p className="text-sm text-green-400">Display name saved!</p>}
            <button
              type="submit"
              disabled={savingDisplay || !displayName.trim() || displayName.trim() === initialDisplayName}
              className="w-full bg-blue-600 active:bg-blue-500 disabled:opacity-40 text-white font-bold min-h-[48px] rounded-xl text-sm transition-colors"
            >
              {savingDisplay ? "Saving…" : "Save Display Name"}
            </button>
          </form>

          <div className="border-t border-gray-800" />

          {/* Username */}
          <form onSubmit={handleSaveUsername} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Username</label>
              <div className="flex items-center bg-gray-800 border border-gray-700 focus-within:border-blue-500 rounded-xl px-3 transition-colors">
                <span className="text-gray-500 text-sm pr-1">@</span>
                <input
                  value={username}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(null); setUsernameSuccess(false); }}
                  placeholder="yourname"
                  maxLength={20}
                  className="flex-1 bg-transparent py-3 text-sm placeholder-gray-600 outline-none"
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">3–20 chars. Lowercase letters, numbers, underscores.</p>
            </div>
            {usernameError && <p className="text-sm text-red-400">{usernameError}</p>}
            {usernameSuccess && <p className="text-sm text-green-400">Username saved!</p>}
            <button
              type="submit"
              disabled={savingUsername || !username.trim() || username.trim() === (currentUsername ?? "")}
              className="w-full bg-blue-600 active:bg-blue-500 disabled:opacity-40 text-white font-bold min-h-[48px] rounded-xl text-sm transition-colors"
            >
              {savingUsername ? "Saving…" : "Save Username"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
