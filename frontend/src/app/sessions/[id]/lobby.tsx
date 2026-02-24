"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/supabase/client";

type Player = {
    user_id: string;
    display_name: string;
    role: string;
    buy_in: number | null;
};

export default function LobbyView({
    sessionId,
    userId,
    isHost,
    buyInDefault,
    inviteCode,
    sessionTitle,
}: {
    sessionId: string;
    userId: string;
    isHost: boolean;
    buyInDefault: number | null;
    inviteCode: string;
    sessionTitle: string;
}) {
    const supabase = createClient();
    const [players, setPlayers] = useState<Player[]>([]);
    const [buyInAmount, setBuyInAmount] = useState(buyInDefault?.toString() || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [starting, setStarting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchPlayers = useCallback(async () => {
        const { data: members } = await supabase
            .from("session_members")
            .select("user_id, role, profiles(display_name)")
            .eq("session_id", sessionId);

        if (!members) return;

        const { data: buyins } = await supabase
            .from("buyins")
            .select("user_id, amount")
            .eq("session_id", sessionId)
            .eq("type", "initial");

        const playerList = (members as unknown as { user_id: string; role: string; profiles: { display_name: string } }[]).map((m) => {
            const buyin = (buyins as { user_id: string; amount: number }[] | null)?.find((b) => b.user_id === m.user_id);
            return {
                user_id: m.user_id,
                display_name: m.profiles.display_name,
                role: m.role,
                buy_in: buyin?.amount ?? null,
            };
        });

        setPlayers(playerList);
        setLoading(false);
    }, [supabase, sessionId]);

    useEffect(() => {
        fetchPlayers();

        // Realtime subscription for instant updates
        const channel = supabase
            .channel(`lobby-${sessionId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "session_members", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            // Auto-navigate all users when host transitions phase
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => window.location.reload())
            .subscribe();

        // Polling fallback — ensures updates arrive even if Realtime is delayed
        const poll = setInterval(fetchPlayers, 3000);

        // Poll session state every 5s — reload if host has moved to next phase
        const statePoll = setInterval(async () => {
            const { data } = await supabase.from("sessions").select("state").eq("id", sessionId).single();
            if (data && data.state !== "lobby") window.location.reload();
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
            clearInterval(statePoll);
        };
    }, [fetchPlayers, supabase, sessionId]);

    const myBuyIn = players.find((p) => p.user_id === userId)?.buy_in;
    const totalPot = players.reduce((sum, p) => sum + (p.buy_in || 0), 0);
    const allReady = players.length > 0 && players.every((p) => p.buy_in !== null);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const flashSaved = () => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    };

    const saveBuyIn = async () => {
        const amount = parseFloat(buyInAmount);
        if (!amount || amount <= 0) return;
        setSaving(true);

        let error = null;

        if (myBuyIn !== null) {
            const { data: existing } = await supabase
                .from("buyins")
                .select("id")
                .eq("session_id", sessionId)
                .eq("user_id", userId)
                .eq("type", "initial")
                .single();

            if (existing) {
                const res = await supabase.from("buyins").update({ amount }).eq("id", existing.id);
                error = res.error;
            }
        } else {
            const res = await supabase.from("buyins").insert({
                session_id: sessionId,
                user_id: userId,
                amount,
                type: "initial",
            });
            error = res.error;
        }

        setSaving(false);
        if (error) {
            alert(`Failed to save buy-in: ${error.message}`);
        } else {
            flashSaved();
        }
    };

    const handleStartGame = async () => {
        const playersWithoutBuyIn = players.filter((p) => p.buy_in === null);
        if (playersWithoutBuyIn.length > 0) {
            const proceed = confirm(
                `${playersWithoutBuyIn.map((p) => p.display_name).join(", ")} haven't entered buy-ins. Start anyway?`
            );
            if (!proceed) return;
        }

        setStarting(true);
        const { error } = await supabase.rpc("start_game", { p_session_id: sessionId });
        if (error) {
            alert(`Could not start game: ${error.message}`);
            setStarting(false);
            return;
        }
        window.location.reload();
    };

    const handleRemovePlayer = async (playerId: string) => {
        if (!confirm("Remove this player?")) return;
        await supabase.from("session_members").delete().eq("session_id", sessionId).eq("user_id", playerId);
        await supabase.from("buyins").delete().eq("session_id", sessionId).eq("user_id", playerId);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <div className="text-gray-600 text-sm">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white pb-48">
            {/* Header */}
            <div className="px-5 pt-6 pb-4 max-w-lg mx-auto flex justify-between items-center">
                <a href="/dashboard" className="text-gray-600 hover:text-white text-sm transition-colors">
                    ← Back
                </a>
                <span className="text-sm font-bold">
                    Stack<span className="text-green-400">Lab</span>
                </span>
            </div>

            <div className="px-5 max-w-lg mx-auto space-y-6">
                {/* Session title + status */}
                <div className="text-center pt-2">
                    <h1 className="text-2xl font-bold mb-1">{sessionTitle}</h1>
                    <p className="text-gray-500 text-sm">
                        {isHost ? "Share the code with your players" : "Waiting for the host to start..."}
                    </p>
                </div>

                {/* Big invite code */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                        Invite Code
                    </p>
                    <div className="font-mono text-5xl font-extrabold tracking-[0.2em] text-white mb-4">
                        {inviteCode}
                    </div>
                    <button
                        onClick={handleCopy}
                        className={`text-sm font-semibold px-5 py-2 rounded-xl transition-all ${
                            copied
                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                        }`}
                    >
                        {copied ? "✓ Copied!" : "Copy Code"}
                    </button>
                </div>

                {/* Your buy-in */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="font-semibold">Your Buy-In</h2>
                        {myBuyIn !== null && !saved && (
                            <span className="text-green-400 text-xs font-medium">Set to ${myBuyIn}</span>
                        )}
                        {saved && (
                            <span className="text-green-400 text-xs font-medium">✓ Saved</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                            <input
                                type="number"
                                value={buyInAmount}
                                onChange={(e) => setBuyInAmount(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveBuyIn()}
                                placeholder={buyInDefault ? buyInDefault.toString() : "Amount"}
                                className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl pl-7 pr-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>
                        <button
                            onClick={saveBuyIn}
                            disabled={saving}
                            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-2.5 px-5 rounded-xl text-sm transition-colors"
                        >
                            {saving ? "..." : myBuyIn !== null ? "Update" : "Set"}
                        </button>
                    </div>
                </div>

                {/* Player list */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Players
                        </h2>
                        <span className="text-xs text-gray-600">
                            {players.filter((p) => p.buy_in !== null).length}/{players.length} ready
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {players.map((p) => (
                            <div
                                key={p.user_id}
                                className={`relative bg-gray-900 border rounded-xl p-3 transition-colors ${
                                    p.buy_in !== null
                                        ? "border-green-500/30 bg-green-500/5"
                                        : "border-gray-800"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {p.display_name}
                                            {p.role === "host" && (
                                                <span className="ml-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Host</span>
                                            )}
                                        </p>
                                        <p className={`text-xs mt-0.5 ${p.buy_in !== null ? "text-green-400" : "text-gray-600"}`}>
                                            {p.buy_in !== null ? `$${p.buy_in}` : "Not set"}
                                        </p>
                                    </div>
                                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${p.buy_in !== null ? "bg-green-400" : "bg-gray-700"}`} />
                                </div>

                                {isHost && p.user_id !== userId && (
                                    <button
                                        onClick={() => handleRemovePlayer(p.user_id)}
                                        className="absolute top-1 right-1 text-gray-700 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Empty slots */}
                        {[...Array(Math.max(0, 4 - players.length))].map((_, i) => (
                            <div
                                key={`empty-${i}`}
                                className="bg-gray-900/50 border border-gray-800/50 border-dashed rounded-xl p-3 flex items-center justify-center"
                            >
                                <span className="text-gray-700 text-xs">Waiting...</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Fixed bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800 p-4">
                <div className="max-w-lg mx-auto">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <p className="text-xs text-gray-500">Total Pot</p>
                            <p className="text-xl font-bold text-green-400">${totalPot}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Players</p>
                            <p className="text-xl font-bold">{players.length}</p>
                        </div>
                    </div>

                    {isHost ? (
                        <button
                            onClick={handleStartGame}
                            disabled={starting || players.length < 2}
                            className={`w-full font-bold py-3.5 rounded-xl transition-all text-base ${
                                allReady
                                    ? "bg-green-500 hover:bg-green-400 text-black shadow-lg shadow-green-500/20"
                                    : "bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-40"
                            } disabled:cursor-not-allowed`}
                        >
                            {starting ? "Starting..." : players.length < 2 ? "Need at least 2 players" : "Start Game →"}
                        </button>
                    ) : (
                        <div className="w-full bg-gray-900 border border-gray-800 rounded-xl py-3.5 text-center">
                            <p className="text-gray-500 text-sm">Waiting for host to start the game...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
