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
}: {
    sessionId: string;
    userId: string;
    isHost: boolean;
    buyInDefault: number | null;
}) {
    const supabase = createClient();
    const [players, setPlayers] = useState<Player[]>([]);
    const [buyInAmount, setBuyInAmount] = useState(buyInDefault?.toString() || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [starting, setStarting] = useState(false);
    const [loading, setLoading] = useState(true);
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPlayers();

        const channel = supabase
            .channel(`lobby-${sessionId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "session_members", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchPlayers, supabase, sessionId]);

    const myBuyIn = players.find((p) => p.user_id === userId)?.buy_in;

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") saveBuyIn();
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

    const totalPot = players.reduce((sum, p) => sum + (p.buy_in || 0), 0);

    if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

    return (
        <div>
            {/* Buy-in input */}
            <div className="bg-gray-900 rounded-xl p-4 mb-4">
                <h2 className="font-semibold mb-1">Your Buy-In</h2>
                <p className="text-gray-500 text-xs mb-3">
                    Set your initial buy-in amount.
                </p>
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={buyInAmount}
                        onChange={(e) => setBuyInAmount(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Amount"
                        className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                        onClick={saveBuyIn}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg text-sm"
                    >
                        {saving ? "Saving..." : myBuyIn !== null ? "Update" : "Set"}
                    </button>
                </div>
                <div className="mt-1.5 h-4">
                    {saved && (
                        <p className="text-green-400 text-xs">Saved ✓</p>
                    )}
                    {myBuyIn !== null && !saved && (
                        <p className="text-gray-500 text-xs">Current: ${myBuyIn}</p>
                    )}
                </div>
            </div>

            {/* Player list */}
            <div className="mb-4">
                <h2 className="font-semibold mb-2">Players ({players.length})</h2>
                <div className="flex flex-col gap-2">
                    {players.map((p) => (
                        <div
                            key={p.user_id}
                            className="bg-gray-900 rounded-xl p-3 flex justify-between items-center"
                        >
                            <div>
                                <p className="font-medium text-sm">
                                    {p.display_name}
                                    {p.role === "host" && (
                                        <span className="text-yellow-500 text-xs ml-1">👑</span>
                                    )}
                                </p>
                                <p className={`text-xs ${p.buy_in !== null ? "text-green-400" : "text-gray-500"}`}>
                                    {p.buy_in !== null ? `$${p.buy_in}` : "No buy-in yet"}
                                </p>
                            </div>
                            {isHost && p.user_id !== userId && (
                                <button
                                    onClick={() => handleRemovePlayer(p.user_id)}
                                    className="text-red-500 text-xs hover:text-red-400"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Pot + Start */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4">
                <div className="max-w-lg mx-auto">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-gray-400 text-sm">Total Pot</span>
                        <span className="text-xl font-bold text-green-400">${totalPot}</span>
                    </div>
                    {isHost && (
                        <button
                            onClick={handleStartGame}
                            disabled={starting}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl w-full transition-colors"
                        >
                            {starting ? "Starting..." : "Start Game"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
