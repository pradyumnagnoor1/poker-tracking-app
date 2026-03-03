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

const STATE_CONFIG: Record<string, { label: string; className: string }> = {
    lobby:      { label: "Lobby",      className: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    active:     { label: "Live",       className: "text-green-400 bg-green-500/10 border-green-500/20" },
    chip_count: { label: "Chip Count", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    payouts:    { label: "Payouts",    className: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
    closed:     { label: "Closed",     className: "text-gray-500 bg-gray-800 border-gray-700" },
};

function StateChip({ state }: { state: string }) {
    const config = STATE_CONFIG[state] ?? { label: state, className: "text-gray-500 bg-gray-800 border-gray-700" };
    return (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.className}`}>
            {config.label}
        </span>
    );
}

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
                    className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition-opacity ${
                        working === s.id ? "opacity-40 pointer-events-none" : ""
                    }`}
                >
                    {/* Tappable session row */}
                    <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-4 min-h-[64px] active:bg-gray-800 transition-colors">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold leading-snug truncate">{s.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[11px] text-gray-500 font-medium">
                                    {s.role === "host" ? "Host" : "Player"}
                                </span>
                                <StateChip state={s.state} />
                            </div>
                        </div>
                        <span className="text-gray-700 text-xs font-mono shrink-0">{s.invite_code}</span>
                    </Link>

                    {/* Delete confirmation strip (iOS action-sheet style) */}
                    {confirmId === s.id ? (
                        <div className="border-t border-gray-800 flex">
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(null); }}
                                className="flex-1 py-3.5 text-sm text-gray-400 active:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="w-px bg-gray-800" />
                            <button
                                onClick={(e) => handleDelete(e, s)}
                                className="flex-1 py-3.5 text-sm text-red-400 font-semibold active:bg-red-950/30 transition-colors"
                            >
                                {s.role === "host" ? "Delete Game" : "Leave Game"}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => handleDelete(e, s)}
                            disabled={working === s.id}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-800/50 text-gray-600 active:bg-gray-800 text-xs transition-colors disabled:opacity-30"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14H6L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                            </svg>
                            {working === s.id ? "Removing…" : s.role === "host" ? "Delete" : "Remove"}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
