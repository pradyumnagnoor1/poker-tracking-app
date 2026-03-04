"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setUsername } from "./actions";

export default function SettingsClient({
  currentUsername,
  displayName,
}: {
  currentUsername: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const [username, setUsernameInput] = useState(currentUsername ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = username.toLowerCase().trim();
    if (!val) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await setUsername(val);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Account</p>
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">Display Name</p>
            <p className="text-sm font-medium">{displayName}</p>
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Username</label>
              <div className="flex items-center bg-gray-800 border border-gray-700 focus-within:border-blue-500 rounded-xl px-3 transition-colors">
                <span className="text-gray-500 text-sm pr-1">@</span>
                <input
                  value={username}
                  onChange={(e) => { setUsernameInput(e.target.value); setError(null); setSuccess(false); }}
                  placeholder="yourname"
                  maxLength={20}
                  className="flex-1 bg-transparent py-3 text-sm placeholder-gray-600 outline-none"
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">3–20 chars. Lowercase letters, numbers, underscores.</p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-green-400">Username saved!</p>}
            <button
              type="submit"
              disabled={saving || !username.trim() || username.trim() === (currentUsername ?? "")}
              className="w-full bg-blue-600 active:bg-blue-500 disabled:opacity-40 text-white font-bold min-h-[48px] rounded-xl text-sm transition-colors"
            >
              {saving ? "Saving…" : "Save Username"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
