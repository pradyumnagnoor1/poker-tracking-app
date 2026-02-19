"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "./actions";

type Session = {
    id: string;
    title: string;
    state: string;
    invite_code: string;
    created_at: string;
    role: string;
};

const STATE_LABELS: Record<string, string> = {
    lobby: "Lobby",
    active: "In Progress",
    chip_count: "Chip Count",
    payouts: "Payouts",
    closed: "Closed",
};

export default function SessionList({ sessions }: { sessions: Session[] }) {
    const router = useRouter();
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleDelete = async (e: React.MouseEvent, sessionId: string, title: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Delete "${title}"? This permanently removes all game data.`)) return;
        setDeleting(sessionId);
        try {
            await deleteSession(sessionId);
            router.refresh();
        } catch {
            alert("Could not delete session.");
            setDeleting(null);
        }
    };

    if (sessions.length === 0) {
        return <p className="text-gray-500 text-sm">No sessions yet.</p>;
    }

    return (
        <div className="flex flex-col gap-2">
            {sessions.map((s) => (
                <div
                    key={s.id}
                    className={`bg-gray-900 rounded-xl flex items-center hover:bg-gray-800 transition-colors ${
                        deleting === s.id ? "opacity-40 pointer-events-none" : ""
                    }`}
                >
                    <Link href={`/sessions/${s.id}`} className="flex-1 p-4 min-w-0">
                        <p className="font-medium truncate">{s.title}</p>
                        <p className="text-gray-500 text-xs">
                            {s.role === "host" ? "Host" : "Player"} · {STATE_LABELS[s.state] ?? s.state}
                        </p>
                    </Link>

                    <div className="flex items-center gap-3 pr-4 shrink-0">
                        <span className="text-gray-600 text-xs font-mono">{s.invite_code}</span>
                        {s.role === "host" && (
                            <button
                                onClick={(e) => handleDelete(e, s.id, s.title)}
                                disabled={deleting === s.id}
                                className="text-gray-600 hover:text-red-500 text-xs px-2 py-1 rounded border border-gray-700 hover:border-red-800 transition-colors disabled:opacity-30"
                            >
                                {deleting === s.id ? "..." : "Delete"}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
