"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUsername } from "../settings/actions";

export default function UsernameSetupModal() {
  const router = useRouter();
  const [username, setUsernameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = username.toLowerCase().trim();
    if (!val) return;
    setSaving(true);
    setError(null);
    try {
      await setUsername(val);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4">
      <div
        className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
      >
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="mb-5">
          <h2 className="text-lg font-bold mb-1">Create your username</h2>
          <p className="text-sm text-gray-500">
            A username lets friends find and invite you to games.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center bg-gray-800 border border-gray-700 focus-within:border-blue-500 rounded-xl px-3 transition-colors">
              <span className="text-gray-500 text-sm pr-1">@</span>
              <input
                value={username}
                onChange={(e) => { setUsernameInput(e.target.value); setError(null); }}
                placeholder="yourname"
                maxLength={20}
                autoFocus
                className="flex-1 bg-transparent py-3.5 text-sm placeholder-gray-600 outline-none"
              />
            </div>
            <p className="text-xs text-gray-600 mt-1.5">3–20 chars. Lowercase letters, numbers, underscores only.</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving || username.trim().length < 3}
            className="w-full bg-blue-600 active:bg-blue-500 disabled:opacity-40 text-white font-bold min-h-[52px] rounded-xl transition-colors"
          >
            {saving ? "Saving…" : "Set Username"}
          </button>
          <p className="text-xs text-gray-600 text-center">
            You can change this later in Settings.
          </p>
        </form>
      </div>
    </div>
  );
}
