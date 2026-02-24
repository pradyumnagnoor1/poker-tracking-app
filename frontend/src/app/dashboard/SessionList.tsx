"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSession, removeFromHistory } from "./actions";

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
    const [working, setWorking] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const handleDelete = async (e: React.MouseEvent, session: Session) => {
        e.preventDefault();
        e.stopPropagation();

        if (confirmId !== session.id) {
            setConfirmId(session.id);
            return;
        }
        setConfirmId(null);
        setWorking(session.id);
        try {
            if (session.role === "host") {
                await deleteSession(session.id);
            } else {
                await removeFromHistory(session.id);
            }
            router.refresh();
        } catch {
            setWorking(null);
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
                        working === s.id ? "opacity-40 pointer-events-none" : ""
                    }`}
                >
                    <Link href={`/sessions/${s.id}`} className="flex-1 p-4 min-w-0">
                        <p className="font-medium truncate">{s.title}</p>
                        <p className="text-gray-500 text-xs">
                            {s.role === "host" ? "Host" : "Player"} · {STATE_LABELS[s.state] ?? s.state}
                        </p>
                    </Link>

                    <div className="flex items-center gap-2 pr-4 shrink-0">
                        <span className="text-gray-600 text-xs font-mono">{s.invite_code}</span>

                        {confirmId === s.id ? (
                            <div className="flex gap-1">
                                <button
                                    onClick={(e) => handleDelete(e, s)}
                                    className="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded font-semibold"
                                >
                                    {s.role === "host" ? "Delete" : "Remove"}
                                </button>
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(null); }}
                                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={(e) => handleDelete(e, s)}
                                disabled={working === s.id}
                                className="text-gray-600 hover:text-red-500 text-xs px-2 py-1 rounded border border-gray-700 hover:border-red-800 transition-colors disabled:opacity-30"
                            >
                                {working === s.id ? "..." : s.role === "host" ? "Delete" : "Remove"}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
