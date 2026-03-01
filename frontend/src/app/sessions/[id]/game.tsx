"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/supabase/client";

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
    const [confirmEndGame, setConfirmEndGame] = useState(false);
    const [confirmDeleteRebuy, setConfirmDeleteRebuy] = useState<{ playerKey: string; rebuyId: string } | null>(null);
    const [earlyCashoutAmounts, setEarlyCashoutAmounts] = useState<Record<string, string>>({});
    const [chipCountEntries, setChipCountEntries] = useState<Record<string, number>>({});
    const [confirmKickKey, setConfirmKickKey] = useState<string | null>(null);
    const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
    const [timerHours, setTimerHours] = useState("0");
    const [timerMinutes, setTimerMinutes] = useState("30");
    const [confirmTransferKey, setConfirmTransferKey] = useState<string | null>(null);

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

    const fetchSession = useCallback(async () => {
        const { data } = await supabase.from("sessions").select("state, timer_end_at, host_user_id").eq("id", sessionId).single();
        if (!data) return;
        if (data.state !== "active") { window.location.reload(); return; }
        // Reload if host changed (catches host transfer for all connected clients)
        const nowIsHost = data.host_user_id === userId;
        if (nowIsHost !== isHost) { window.location.reload(); return; }
        setTimerEndAt(data.timer_end_at ?? null);
    }, [supabase, sessionId, userId, isHost]);

    const fetchEarlyCashouts = useCallback(async () => {
        const { data: cc } = await supabase.from("chip_counts").select("user_id, final_stack").eq("session_id", sessionId);
        const { data: gcc } = await supabase.from("guest_chip_counts").select("guest_id, final_stack").eq("session_id", sessionId);
        const entries: Record<string, number> = {};
        (cc ?? []).forEach((c: { user_id: string; final_stack: number }) => { entries[`user:${c.user_id}`] = Number(c.final_stack); });
        (gcc ?? []).forEach((c: { guest_id: string; final_stack: number }) => { entries[`guest:${c.guest_id}`] = Number(c.final_stack); });
        setChipCountEntries(entries);
    }, [supabase, sessionId]);

    useEffect(() => {
        fetchPlayers();
        fetchEarlyCashouts();
        fetchSession();

        const channel = supabase
            .channel(`game-${sessionId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "guest_buyins", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "session_guests", filter: `session_id=eq.${sessionId}` }, () => fetchPlayers())
            .on("postgres_changes", { event: "*", schema: "public", table: "chip_counts", filter: `session_id=eq.${sessionId}` }, () => fetchEarlyCashouts())
            .on("postgres_changes", { event: "*", schema: "public", table: "guest_chip_counts", filter: `session_id=eq.${sessionId}` }, () => fetchEarlyCashouts())
            // Handles phase transitions AND timer updates
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => fetchSession())
            .subscribe();

        const poll = setInterval(() => { fetchPlayers(); fetchEarlyCashouts(); }, 5000);

        const statePoll = setInterval(() => fetchSession(), 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
            clearInterval(statePoll);
        };
    }, [fetchPlayers, fetchEarlyCashouts, fetchSession, supabase, sessionId]);

    // Countdown tick — updates every second when timer is active
    useEffect(() => {
        if (!timerEndAt) { setTimeRemaining(null); return; }
        const update = () => {
            const diff = new Date(timerEndAt).getTime() - Date.now();
            if (diff <= 0) { setTimeRemaining("Time's up!"); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setTimeRemaining(
                h > 0
                    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                    : `${m}:${String(s).padStart(2, "0")}`
            );
        };
        update();
        const tick = setInterval(update, 1000);
        return () => clearInterval(tick);
    }, [timerEndAt]);

    const handleRebuy = async (player: Player) => {
        const amount = parseFloat(rebuyAmounts[player.player_key]);
        if (!amount || amount <= 0) return;

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
        const isConfirmed =
            confirmDeleteRebuy?.playerKey === player.player_key &&
            confirmDeleteRebuy?.rebuyId === rebuyId;
        if (!isConfirmed) {
            setConfirmDeleteRebuy({ playerKey: player.player_key, rebuyId });
            return;
        }
        setConfirmDeleteRebuy(null);
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

    const handleEarlyCashout = async (player: Player) => {
        const amount = parseFloat(earlyCashoutAmounts[player.player_key]);
        if (isNaN(amount) || amount < 0) return;

        let error = null;
        if (player.participant_type === "user") {
            const res = await supabase.from("chip_counts").upsert(
                { session_id: sessionId, user_id: player.id, final_stack: amount },
                { onConflict: "session_id,user_id" }
            );
            error = res.error;
        } else {
            const res = await supabase.from("guest_chip_counts").upsert(
                { session_id: sessionId, guest_id: player.id, final_stack: amount },
                { onConflict: "session_id,guest_id" }
            );
            error = res.error;
        }

        if (error) {
            alert(`Could not record cashout: ${error.message}`);
            return;
        }
        setEarlyCashoutAmounts((prev) => ({ ...prev, [player.player_key]: "" }));
        fetchEarlyCashouts();
    };

    const handleDeleteChipCount = async (player: Player) => {
        if (player.participant_type === "user") {
            await supabase.from("chip_counts").delete().eq("session_id", sessionId).eq("user_id", player.id);
        } else {
            await supabase.from("guest_chip_counts").delete().eq("session_id", sessionId).eq("guest_id", player.id);
        }
        fetchEarlyCashouts();
    };

    const handleHostEditChipCount = async (player: Player) => {
        const amount = parseFloat(earlyCashoutAmounts[player.player_key]);
        if (isNaN(amount) || amount < 0) return;
        if (player.participant_type === "user") {
            await supabase.from("chip_counts").upsert(
                { session_id: sessionId, user_id: player.id, final_stack: amount },
                { onConflict: "session_id,user_id" }
            );
        } else {
            await supabase.from("guest_chip_counts").upsert(
                { session_id: sessionId, guest_id: player.id, final_stack: amount },
                { onConflict: "session_id,guest_id" }
            );
        }
        setEarlyCashoutAmounts((prev) => ({ ...prev, [player.player_key]: "" }));
        fetchEarlyCashouts();
    };

    const handleKick = async (player: Player) => {
        if (confirmKickKey !== player.player_key) {
            setConfirmKickKey(player.player_key);
            return;
        }
        setConfirmKickKey(null);
        if (player.participant_type === "user") {
            await supabase.from("chip_counts").delete().eq("session_id", sessionId).eq("user_id", player.id);
            await supabase.from("buyins").delete().eq("session_id", sessionId).eq("user_id", player.id);
            await supabase.from("session_members").delete().eq("session_id", sessionId).eq("user_id", player.id);
        } else {
            await supabase.from("guest_chip_counts").delete().eq("guest_id", player.id);
            await supabase.from("guest_buyins").delete().eq("guest_id", player.id);
            await supabase.from("session_guests").delete().eq("id", player.id);
        }
        fetchPlayers();
    };

    const handleSetTimer = async () => {
        const h = parseInt(timerHours) || 0;
        const m = parseInt(timerMinutes) || 0;
        const totalMs = (h * 60 + m) * 60 * 1000;
        if (totalMs <= 0) return;
        const endAt = new Date(Date.now() + totalMs).toISOString();
        const { error } = await supabase.rpc("set_session_timer", { p_session_id: sessionId, p_end_at: endAt });
        if (error) { alert(error.message); return; }
        setTimerEndAt(endAt); // update immediately — don't wait on realtime
    };

    const handleClearTimer = async () => {
        const { error } = await supabase.rpc("set_session_timer", { p_session_id: sessionId, p_end_at: null });
        if (!error) setTimerEndAt(null);
    };

    const handleTransferHost = async (player: Player) => {
        if (confirmTransferKey !== player.player_key) {
            setConfirmTransferKey(player.player_key);
            return;
        }
        setConfirmTransferKey(null);
        const { error } = await supabase.rpc("transfer_host", { p_session_id: sessionId, p_new_host_id: player.id });
        if (error) { alert(error.message); return; }
        window.location.reload();
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
        if (!confirmEndGame) {
            setConfirmEndGame(true);
            return;
        }
        setConfirmEndGame(false);
        const { error } = await supabase.rpc("end_game", { p_session_id: sessionId });
        if (error) {
            alert(error.message);
            return;
        }
        window.location.reload();
    };

    if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

    return (
        <div className="pb-28">
            {/* Sticky pot + timer header */}
            <div className="sticky top-0 bg-gray-950 py-3 mb-4 border-b border-gray-800 z-10">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Total Pot</span>
                    <span className="text-xl font-bold text-green-400">${totalPot}</span>
                </div>
                {timeRemaining && (() => {
                    const diff = timerEndAt ? new Date(timerEndAt).getTime() - Date.now() : 0;
                    const color = timeRemaining === "Time's up!" || diff < 300000
                        ? "text-red-400"
                        : diff < 600000
                        ? "text-yellow-400"
                        : "text-white";
                    return (
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-400 text-sm">Time Remaining</span>
                            <span className={`text-xl font-bold font-mono ${color}`}>{timeRemaining}</span>
                        </div>
                    );
                })()}
            </div>

            {isHost && (
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                    <h2 className="font-semibold mb-2 text-sm">Session Timer</h2>
                    {timerEndAt && timeRemaining !== null ? (
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm">
                                {timeRemaining === "Time's up!" ? "Timer expired" : "Timer running"}
                            </span>
                            <button onClick={handleClearTimer} className="text-xs text-red-500 hover:text-red-400 font-semibold">
                                Clear
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 flex-1">
                                <select
                                    value={timerHours}
                                    onChange={(e) => setTimerHours(e.target.value)}
                                    className="flex-1 bg-gray-800 rounded-lg px-2 py-2 text-sm text-white"
                                >
                                    {Array.from({ length: 9 }, (_, i) => (
                                        <option key={i} value={i}>{i}h</option>
                                    ))}
                                </select>
                                <select
                                    value={timerMinutes}
                                    onChange={(e) => setTimerMinutes(e.target.value)}
                                    className="flex-1 bg-gray-800 rounded-lg px-2 py-2 text-sm text-white"
                                >
                                    {[0, 5, 10, 15, 20, 25, 30, 45].map((m) => (
                                        <option key={m} value={m}>{m}m</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleSetTimer}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm"
                            >
                                Start
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isHost && (() => {
                const transferablePlayers = players.filter(p => p.participant_type === "user" && p.role !== "host");
                if (transferablePlayers.length === 0) return null;
                return (
                    <div className="bg-gray-900 rounded-xl p-4 mb-4">
                        <h2 className="font-semibold mb-1 text-sm">Transfer Host</h2>
                        <p className="text-gray-500 text-xs mb-3">Pass host controls to another player.</p>
                        <div className="flex flex-col gap-2">
                            {transferablePlayers.map((p) => (
                                <div key={p.player_key} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-300">{p.display_name}</span>
                                    {confirmTransferKey === p.player_key ? (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleTransferHost(p)} className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded font-semibold">Confirm</button>
                                            <button onClick={() => setConfirmTransferKey(null)} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded">Cancel</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setConfirmTransferKey(p.player_key)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
                                            Make Host
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

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
                                <div className="flex items-center gap-2">
                                    <span className="text-green-400 font-bold">${p.total_in}</span>
                                    {isHost && p.role !== "host" && (
                                        confirmKickKey === p.player_key ? (
                                            <div className="flex gap-1">
                                                <button onClick={() => handleKick(p)} className="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded font-semibold">Kick</button>
                                                <button onClick={() => setConfirmKickKey(null)} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-0.5 rounded">Cancel</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmKickKey(p.player_key)} className="text-gray-700 hover:text-red-500 text-xs transition-colors">✕</button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Rebuys list */}
                            {p.rebuys.length > 0 && (
                                <div className="mb-2 ml-2">
                                    {p.rebuys.map((r, i) => (
                                        <div key={r.id} className="flex justify-between items-center text-xs text-gray-400 py-1">
                                            <span>Rebuy #{i + 1}: ${r.amount}</span>
                                            {(isHost || (p.participant_type === "user" && p.id === userId)) && (
                                                confirmDeleteRebuy?.playerKey === p.player_key && confirmDeleteRebuy?.rebuyId === r.id ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleDeleteRebuy(p, r.id)} className="text-red-500 hover:text-red-400 font-semibold">Confirm</button>
                                                        <button onClick={() => setConfirmDeleteRebuy(null)} className="text-gray-500 hover:text-gray-400">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDeleteRebuy(p, r.id)}
                                                        className="text-gray-600 hover:text-red-500 transition-colors"
                                                    >
                                                        Undo
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rebuy input — hidden if player has cashed out */}
                            {canRebuy && chipCountEntries[p.player_key] === undefined && (
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

                            {/* Cashed out — show badge + host controls */}
                            {chipCountEntries[p.player_key] !== undefined ? (
                                <div className="mt-2 pt-2 border-t border-gray-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-amber-400 font-semibold">Cashed out early — ${chipCountEntries[p.player_key]}</span>
                                        {isHost && (
                                            <button onClick={() => handleDeleteChipCount(p)} className="text-xs text-red-500 hover:text-red-400">
                                                Reject
                                            </button>
                                        )}
                                    </div>
                                    {/* Host can correct the amount */}
                                    {isHost && (
                                        <div className="flex gap-2">
                                            <input
                                                type="number" min="0"
                                                value={earlyCashoutAmounts[p.player_key] || ""}
                                                onChange={(e) => setEarlyCashoutAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))}
                                                placeholder="Edit stack amount"
                                                className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-xs placeholder-gray-600"
                                            />
                                            <button onClick={() => handleHostEditChipCount(p)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold py-2 px-3 rounded-lg">
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Early cashout request — player submits their own; host can submit for anyone */
                                (isHost || (p.participant_type === "user" && p.id === userId)) && (
                                    <div className="mt-2 pt-2 border-t border-gray-800">
                                        <p className="text-gray-600 text-xs mb-1.5">{isHost && p.id !== userId ? "Record early cashout" : "Cash out early"}</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="number" min="0"
                                                value={earlyCashoutAmounts[p.player_key] || ""}
                                                onChange={(e) => setEarlyCashoutAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))}
                                                placeholder="Final chip stack"
                                                className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm placeholder-gray-600"
                                            />
                                            <button
                                                onClick={() => isHost ? handleHostEditChipCount(p) : handleEarlyCashout(p)}
                                                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"
                                            >
                                                {isHost ? "Record" : "Submit"}
                                            </button>
                                        </div>
                                        {!isHost && <p className="text-gray-600 text-xs mt-1">Host will review your cashout request.</p>}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })}
            </div>

            {/* End game button */}
            {isHost && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4">
                    <div className="max-w-lg mx-auto">
                        {confirmEndGame ? (
                            <div className="space-y-2">
                                <p className="text-center text-sm text-gray-400">End the game and move to chip count?</p>
                                <div className="flex gap-2">
                                    <button onClick={handleEndGame} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl">
                                        Confirm
                                    </button>
                                    <button onClick={() => setConfirmEndGame(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleEndGame}
                                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl w-full"
                            >
                                End Game → Chip Count
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
