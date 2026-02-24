"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/supabase/client";
import { computeTransfers } from "@/lib/computeTransfers";

type ParticipantType = "user" | "guest";

type Player = {
    player_key: string;
    participant_type: ParticipantType;
    id: string;
    display_name: string;
    role: string;
    initial_buy_in: number;
    rebuys: { id: string; amount: number }[];
    total_in: number;
};

type UserMemberRow = {
    user_id: string;
    role: string;
    profiles: { display_name: string } | null;
};

type GuestRow = {
    id: string;
    display_name: string;
};

type UserBuyinRow = {
    id: string;
    user_id: string;
    amount: number;
    type: "initial" | "rebuy";
};

type GuestBuyinRow = {
    id: string;
    guest_id: string;
    amount: number;
    type: "initial" | "rebuy";
};

function toPlayerKey(type: ParticipantType, id: string) {
    return `${type}:${id}`;
}

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
    const [guestName, setGuestName] = useState("");
    const [guestBuyIn, setGuestBuyIn] = useState("");
    const [addingGuest, setAddingGuest] = useState(false);

    // Cashout simulator state
    const [showSimulator, setShowSimulator] = useState(false);
    const [simStacks, setSimStacks] = useState<Record<string, string>>({});

    const fetchPlayers = useCallback(async () => {
        const { data: members } = await supabase
            .from("session_members")
            .select("user_id, role, profiles(display_name)")
            .eq("session_id", sessionId);

        const { data: guests } = await supabase
            .from("session_guests")
            .select("id, display_name")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        const { data: buyins } = await supabase
            .from("buyins")
            .select("id, user_id, amount, type")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        const { data: guestBuyins } = await supabase
            .from("guest_buyins")
            .select("id, guest_id, amount, type")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        const userPlayers =
            (members as UserMemberRow[] | null)?.map(
                (m) => {
                    const playerBuyins = (buyins as UserBuyinRow[] | null)?.filter((b) => b.user_id === m.user_id) || [];
                    const initial = playerBuyins.find((b) => b.type === "initial");
                    const rebuys = playerBuyins.filter((b) => b.type === "rebuy");
                    const total = playerBuyins.reduce((sum, b) => sum + b.amount, 0);

                    return {
                        player_key: toPlayerKey("user", m.user_id),
                        participant_type: "user" as const,
                        id: m.user_id,
                        display_name: m.profiles?.display_name ?? "Unknown user",
                        role: m.role,
                        initial_buy_in: initial?.amount || 0,
                        rebuys: rebuys.map((r) => ({ id: r.id, amount: r.amount })),
                        total_in: total,
                    };
                }
            ) ?? [];

        const guestPlayers =
            (guests as GuestRow[] | null)?.map((g) => {
                const playerBuyins = (guestBuyins as GuestBuyinRow[] | null)?.filter((b) => b.guest_id === g.id) || [];
                const initial = playerBuyins.find((b) => b.type === "initial");
                const rebuys = playerBuyins.filter((b) => b.type === "rebuy");
                const total = playerBuyins.reduce((sum, b) => sum + b.amount, 0);

                return {
                    player_key: toPlayerKey("guest", g.id),
                    participant_type: "guest" as const,
                    id: g.id,
                    display_name: g.display_name,
                    role: "guest",
                    initial_buy_in: initial?.amount || 0,
                    rebuys: rebuys.map((r) => ({ id: r.id, amount: r.amount })),
                    total_in: total,
                };
            }) ?? [];

        setPlayers([...userPlayers, ...guestPlayers]);
        setLoading(false);
    }, [supabase, sessionId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPlayers();

        const channel = supabase
            .channel(`game-${sessionId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "guest_buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "session_guests", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            // Auto-navigate all users when host transitions phase
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => window.location.reload())
            .subscribe();

        // Poll session state every 5s — reload if host has moved to next phase
        const statePoll = setInterval(async () => {
            const { data } = await supabase.from("sessions").select("state").eq("id", sessionId).single();
            if (data && data.state !== "active") window.location.reload();
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(statePoll);
        };
    }, [fetchPlayers, supabase, sessionId]);

    const handleRebuy = async (player: Player) => {
        const amount = parseFloat(rebuyAmounts[player.player_key]);
        if (!amount || amount <= 0) return;
        if (!confirm(`Add $${amount} rebuy for ${player.display_name}?`)) return;

        if (player.participant_type === "user") {
            await supabase.from("buyins").insert({
                session_id: sessionId,
                user_id: player.id,
                amount,
                type: "rebuy",
            });
        } else {
            await supabase.from("guest_buyins").insert({
                session_id: sessionId,
                guest_id: player.id,
                amount,
                type: "rebuy",
            });
        }

        setRebuyAmounts((prev) => ({ ...prev, [player.player_key]: "" }));
        fetchPlayers();
    };

    const handleDeleteRebuy = async (player: Player, rebuyId: string) => {
        if (!confirm("Undo this rebuy?")) return;
        if (player.participant_type === "user") {
            await supabase.from("buyins").delete().eq("id", rebuyId);
        } else {
            await supabase.from("guest_buyins").delete().eq("id", rebuyId);
        }
        fetchPlayers();
    };

    const handleAddGuest = async () => {
        if (!isHost) return;
        const name = guestName.trim();
        const amount = parseFloat(guestBuyIn);
        if (!name) {
            alert("Enter a guest name.");
            return;
        }
        if (!amount || amount <= 0) {
            alert("Enter a valid initial buy-in.");
            return;
        }

        setAddingGuest(true);

        const { data: guest, error: guestError } = await supabase
            .from("session_guests")
            .insert({
                session_id: sessionId,
                display_name: name,
            })
            .select("id")
            .single();

        if (guestError || !guest) {
            alert(guestError?.message ?? "Could not add guest player.");
            setAddingGuest(false);
            return;
        }

        const { error: buyinError } = await supabase.from("guest_buyins").insert({
            session_id: sessionId,
            guest_id: guest.id,
            amount,
            type: "initial",
        });

        if (buyinError) {
            alert(buyinError.message);
        } else {
            setGuestName("");
            setGuestBuyIn("");
            fetchPlayers();
        }

        setAddingGuest(false);
    };

    const totalPot = players.reduce((sum, p) => sum + p.total_in, 0);

    const handleEndGame = async () => {
        if (players.length < 2) {
            alert("You need at least 2 players before ending the game.");
            return;
        }
        if (totalPot <= 0) {
            alert("Set at least one buy-in before ending the game.");
            return;
        }
        if (!confirm("End the game and move to chip count?")) return;

        const { error } = await supabase.rpc("end_game", { p_session_id: sessionId });
        if (error) {
            alert(error.message);
            return;
        }

        window.location.reload();
    };

    // Simulator: compute transfers from hypothetical stacks
    const simTransfers = useMemo(() => {
        const input = players
            .map((p) => {
                const stack = parseFloat(simStacks[p.player_key]);
                if (isNaN(stack) || stack < 0) return null;
                return { user_id: p.player_key, profit: stack - p.total_in };
            })
            .filter(Boolean) as { user_id: string; profit: number }[];

        if (input.length < 2) return [];
        return computeTransfers(input);
    }, [players, simStacks]);

    const simNameMap = useMemo(
        () => Object.fromEntries(players.map((p) => [p.player_key, p.display_name])),
        [players]
    );

    const simTotalIn = players.reduce((s, p) => s + p.total_in, 0);
    const simTotalOut = players.reduce((s, p) => {
        const v = parseFloat(simStacks[p.player_key]);
        return isNaN(v) ? s : s + v;
    }, 0);
    const simEnteredCount = players.filter((p) => {
        const v = parseFloat(simStacks[p.player_key]);
        return !isNaN(v) && v >= 0;
    }).length;
    const simAllEntered = simEnteredCount === players.length && players.length > 0;
    const simDiff = Math.round((simTotalOut - simTotalIn) * 100) / 100;
    const simBalanced = simAllEntered && Math.abs(simDiff) < 0.01;

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

            {isHost && (
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                    <h2 className="font-semibold mb-2 text-sm">Add Guest Player</h2>
                    <p className="text-gray-500 text-xs mb-3">Use this for players without accounts.</p>
                    <div className="flex gap-2 mb-2">
                        <input
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="Guest name"
                            className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm"
                        />
                        <input
                            type="number"
                            value={guestBuyIn}
                            onChange={(e) => setGuestBuyIn(e.target.value)}
                            placeholder="Buy-in"
                            className="w-32 bg-gray-800 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <button
                        onClick={handleAddGuest}
                        disabled={addingGuest}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2 px-3 rounded-lg text-sm"
                    >
                        {addingGuest ? "Adding..." : "Add Guest"}
                    </button>
                </div>
            )}

            {/* Player list */}
            <div className="flex flex-col gap-3 mb-4">
                {players.map((p) => {
                    const canRebuy = isHost || (p.participant_type === "user" && p.id === userId);

                    return (
                        <div key={p.player_key} className="bg-gray-900 rounded-xl p-4">
                            {/* Player header */}
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <p className="font-medium text-sm">
                                        {p.display_name}
                                        {p.role === "host" && <span className="ml-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Host</span>}
                                        {p.participant_type === "guest" && (
                                            <span className="text-blue-400 text-xs ml-2">Guest</span>
                                        )}
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
                                            {(isHost || (p.participant_type === "user" && p.id === userId)) && (
                                                <button
                                                    onClick={() => handleDeleteRebuy(p, r.id)}
                                                    className="text-red-500 hover:text-red-400"
                                                >
                                                    Undo
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
                                        value={rebuyAmounts[p.player_key] || ""}
                                        onChange={(e) =>
                                            setRebuyAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))
                                        }
                                        placeholder="Rebuy amount"
                                        className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm"
                                    />
                                    <button
                                        onClick={() => handleRebuy(p)}
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

            {/* Cashout Simulator */}
            <div className="bg-gray-900 rounded-xl overflow-hidden mb-4">
                <button
                    onClick={() => setShowSimulator((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-gray-800 transition-colors"
                >
                    <span>Simulate Cashout</span>
                    <span className="text-gray-500 text-xs font-normal">
                        {showSimulator ? "▲ Hide" : "▼ Show"}
                    </span>
                </button>

                {showSimulator && (
                    <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                        <p className="text-gray-500 text-xs mb-3">
                            Enter hypothetical final stacks to preview who pays who.
                        </p>

                        {/* Stack inputs per player */}
                        <div className="flex flex-col gap-2 mb-4">
                            {players.map((p) => {
                                const val = simStacks[p.player_key] ?? "";
                                const stack = parseFloat(val);
                                const profit = !isNaN(stack) ? stack - p.total_in : null;
                                return (
                                    <div key={p.player_key} className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {p.display_name}
                                            </p>
                                            <p className="text-gray-500 text-xs">In: ${p.total_in}</p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={val}
                                            onChange={(e) =>
                                                setSimStacks((prev) => ({
                                                    ...prev,
                                                    [p.player_key]: e.target.value,
                                                }))
                                            }
                                            placeholder="Final stack"
                                            className="w-28 bg-gray-800 rounded-lg px-2 py-1.5 text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
                                        />
                                        {profit !== null && (
                                            <span
                                                className={`text-xs font-bold w-14 text-right shrink-0 ${
                                                    profit > 0
                                                        ? "text-green-400"
                                                        : profit < 0
                                                        ? "text-red-400"
                                                        : "text-gray-400"
                                                }`}
                                            >
                                                {profit > 0
                                                    ? `+$${profit}`
                                                    : profit < 0
                                                    ? `-$${Math.abs(profit)}`
                                                    : "Even"}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Balance indicator */}
                        {simEnteredCount > 0 && (
                            <div
                                className={`rounded-lg px-3 py-2 mb-3 flex items-center justify-between text-xs ${
                                    simAllEntered && simBalanced
                                        ? "bg-green-950/40 border border-green-900/40"
                                        : simAllEntered
                                        ? "bg-red-950/40 border border-red-900/40"
                                        : "bg-gray-800 border border-gray-700"
                                }`}
                            >
                                <span
                                    className={
                                        simAllEntered && simBalanced
                                            ? "text-green-400"
                                            : simAllEntered
                                            ? "text-red-400"
                                            : "text-gray-500"
                                    }
                                >
                                    {!simAllEntered
                                        ? `${simEnteredCount}/${players.length} stacks entered`
                                        : simBalanced
                                        ? "Balanced ✓"
                                        : `Imbalanced — diff: ${simDiff > 0 ? "+" : ""}$${simDiff}`}
                                </span>
                                {simAllEntered && (
                                    <span className="text-gray-500">
                                        In: ${simTotalIn} · Out: ${simTotalOut}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Simulated settlements */}
                        {simTransfers.length === 0 ? (
                            <p className="text-gray-600 text-xs text-center py-2">
                                {simEnteredCount < 2
                                    ? "Enter at least 2 stacks to see settlements."
                                    : "No transfers needed — everyone breaks even!"}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <p className="text-gray-500 text-xs font-semibold mb-1">
                                    Who Pays Who
                                </p>
                                {simTransfers.map((t, i) => (
                                    <div
                                        key={i}
                                        className="flex justify-between items-center rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2"
                                    >
                                        <p className="text-sm">
                                            <span className="text-red-400 font-semibold">
                                                {simNameMap[t.from_user_id]}
                                            </span>
                                            <span className="text-gray-500 mx-1.5">pays</span>
                                            <span className="text-green-400 font-semibold">
                                                {simNameMap[t.to_user_id]}
                                            </span>
                                        </p>
                                        <span className="font-bold text-white">${t.amount}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {simEnteredCount > 0 && (
                            <button
                                onClick={() => setSimStacks({})}
                                className="mt-3 text-gray-600 hover:text-gray-400 text-xs transition-colors"
                            >
                                Clear inputs
                            </button>
                        )}
                    </div>
                )}
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
