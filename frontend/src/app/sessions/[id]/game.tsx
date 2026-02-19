"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/supabase/client";

type Player = {
    user_id: string;
    display_name: string;
    role: string;
    initial_buy_in: number;
    rebuys: { id: string; amount: number }[];
    total_in: number;
};

export default function GameView({
    sessionId,
    userId,
    isHost,
}: {
    sessionId: string;
    userId: string;
    isHost: boolean;
}) {
    const supabase = createClient();
    const [players, setPlayers] = useState<Player[]>([]);
    const [rebuyAmounts, setRebuyAmounts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    const fetchPlayers = async () => {
        const { data: members } = await supabase
            .from("session_members")
            .select("user_id, role, profiles(display_name)")
            .eq("session_id", sessionId);

        if (!members) return;

        const { data: buyins } = await supabase
            .from("buyins")
            .select("id, user_id, amount, type")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        const playerList = members.map((m: any) => {
            const playerBuyins = buyins?.filter((b: any) => b.user_id === m.user_id) || [];
            const initial = playerBuyins.find((b: any) => b.type === "initial");
            const rebuys = playerBuyins.filter((b: any) => b.type === "rebuy");
            const total = playerBuyins.reduce((sum: number, b: any) => sum + b.amount, 0);

            return {
                user_id: m.user_id,
                display_name: m.profiles.display_name,
                role: m.role,
                initial_buy_in: initial?.amount || 0,
                rebuys: rebuys.map((r: any) => ({ id: r.id, amount: r.amount })),
                total_in: total,
            };
        });

        setPlayers(playerList);
        setLoading(false);
    };

    useEffect(() => {
        fetchPlayers();

        const channel = supabase
            .channel(`game-${sessionId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const handleRebuy = async (playerId: string) => {
        const amount = parseFloat(rebuyAmounts[playerId]);
        if (!amount || amount <= 0) return;

        await supabase.from("buyins").insert({
            session_id: sessionId,
            user_id: playerId,
            amount,
            type: "rebuy",
        });

        setRebuyAmounts((prev) => ({ ...prev, [playerId]: "" }));
    };

    const handleDeleteRebuy = async (rebuyId: string) => {
        if (!confirm("Delete this rebuy?")) return;
        await supabase.from("buyins").delete().eq("id", rebuyId);
    };

    const handleEndGame = async () => {
        if (!confirm("End the game and move to chip count?")) return;
        await supabase
            .from("sessions")
            .update({ state: "chip_count" })
            .eq("id", sessionId);
        window.location.reload();
    };

    const totalPot = players.reduce((sum, p) => sum + p.total_in, 0);

    if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

    return (
        <div className="pb-28">
            {/* Sticky pot header */}
            <div className="sticky top-0 bg-gray-950 py-3 mb-4 border-b border-gray-800 z-10">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Total Pot</span>
                    <span className="text-xl font-bold text-green-400">${totalPot}</span>
                </div>
            </div>

            {/* Player list */}
            <div className="flex flex-col gap-3">
                {players.map((p) => {
                    const canRebuy = p.user_id === userId || isHost;

                    return (
                        <div key={p.user_id} className="bg-gray-900 rounded-xl p-4">
                            {/* Player header */}
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <p className="font-medium text-sm">
                                        {p.display_name}
                                        {p.role === "host" && <span className="text-yellow-500 text-xs ml-1">👑</span>}
                                    </p>
                                    <p className="text-gray-500 text-xs">
                                        Buy-in: ${p.initial_buy_in} · Rebuys: {p.rebuys.length}
                                    </p>
                                </div>
                                <span className="text-green-400 font-bold">${p.total_in}</span>
                            </div>

                            {/* Rebuys list */}
                            {p.rebuys.length > 0 && (
                                <div className="mb-2 ml-2">
                                    {p.rebuys.map((r, i) => (
                                        <div key={r.id} className="flex justify-between items-center text-xs text-gray-400 py-1">
                                            <span>Rebuy #{i + 1}: ${r.amount}</span>
                                            {isHost && (
                                                <button
                                                    onClick={() => handleDeleteRebuy(r.id)}
                                                    className="text-red-500 hover:text-red-400"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rebuy input */}
                            {canRebuy && (
                                <div className="flex gap-2 mt-2">
                                    <input
                                        type="number"
                                        value={rebuyAmounts[p.user_id] || ""}
                                        onChange={(e) =>
                                            setRebuyAmounts((prev) => ({ ...prev, [p.user_id]: e.target.value }))
                                        }
                                        placeholder="Rebuy amount"
                                        className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm"
                                    />
                                    <button
                                        onClick={() => handleRebuy(p.user_id)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg text-sm"
                                    >
                                        Rebuy
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* End game button */}
            {isHost && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4">
                    <div className="max-w-lg mx-auto">
                        <button
                            onClick={handleEndGame}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl w-full"
                        >
                            End Game → Chip Count
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}