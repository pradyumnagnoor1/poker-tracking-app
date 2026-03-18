"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";
import { createGroupFromSession } from "@/app/groups/actions";

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

function getInitials(name: string) {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

function AvatarCircle({ name, isHost, isGuest }: { name: string; isHost: boolean; isGuest: boolean }) {
    const bg = isHost
        ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
        : isGuest
        ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
        : "bg-indigo-500/20 border-indigo-500/40 text-indigo-400";
    return (
        <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 ${bg}`}>
            {getInitials(name)}
        </div>
    );
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
    const router = useRouter();
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
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [showHostTools, setShowHostTools] = useState(false);

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
        if (!name) { alert("Enter a guest name."); return; }
        if (!amount || amount <= 0) { alert("Enter a valid initial buy-in."); return; }

        setAddingGuest(true);

        const { data: guest, error: guestError } = await supabase
            .from("session_guests")
            .insert({ session_id: sessionId, display_name: name })
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

        if (error) { alert(`Could not record cashout: ${error.message}`); return; }
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
        setTimerEndAt(endAt);
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

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingGroup(true);
        try {
            const groupId = await createGroupFromSession(sessionId, groupName || "Poker Crew");
            router.push(`/groups/${groupId}`);
        } catch (err) {
            alert((err as Error).message);
            setCreatingGroup(false);
        }
    };

    const handleEndGame = async () => {
        if (players.length < 2) { alert("You need at least 2 players before ending the game."); return; }
        if (totalPot <= 0) { alert("Set at least one buy-in before ending the game."); return; }
        if (!confirmEndGame) { setConfirmEndGame(true); return; }
        setConfirmEndGame(false);
        const { error } = await supabase.rpc("end_game", { p_session_id: sessionId });
        if (error) { alert(error.message); return; }
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                <p className="text-gray-500 text-sm">Loading game...</p>
            </div>
        );
    }

    const timerDiff = timerEndAt ? new Date(timerEndAt).getTime() - Date.now() : 0;
    const timerColor =
        timeRemaining === "Time's up!" || timerDiff < 300000
            ? "text-red-400"
            : timerDiff < 600000
            ? "text-yellow-400"
            : "text-green-400";

    const transferablePlayers = players.filter((p) => p.participant_type === "user" && p.role !== "host");

    return (
        <div className="pb-32">
            {/* ── Sticky pot + timer header ── */}
            <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/60 px-1 py-3 mb-5">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Total Pot</p>
                        <p className="text-3xl font-bold text-green-400">${totalPot}</p>
                    </div>
                    {timeRemaining && (
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Time Left</p>
                            <p className={`text-2xl font-bold font-mono ${timerColor}`}>{timeRemaining}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Players ── */}
            <div className="flex flex-col gap-3 mb-5">
                {players.map((p) => {
                    const canRebuy = isHost || (p.participant_type === "user" && p.id === userId);
                    const hasCashedOut = chipCountEntries[p.player_key] !== undefined;
                    const canCashout = isHost || (p.participant_type === "user" && p.id === userId);

                    return (
                        <div
                            key={p.player_key}
                            className={`bg-gray-900 rounded-2xl overflow-hidden border transition-colors ${
                                hasCashedOut ? "border-amber-500/20" : "border-gray-800/60"
                            }`}
                        >
                            {/* Player header */}
                            <div className="flex items-center gap-3 p-4">
                                <AvatarCircle
                                    name={p.display_name}
                                    isHost={p.role === "host"}
                                    isGuest={p.participant_type === "guest"}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-white truncate">{p.display_name}</span>
                                        {p.role === "host" && (
                                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                                                HOST
                                            </span>
                                        )}
                                        {p.participant_type === "guest" && (
                                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
                                                GUEST
                                            </span>
                                        )}
                                        {hasCashedOut && (
                                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                                                CASHED OUT
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Buy-in ${p.initial_buy_in}
                                        {p.rebuys.length > 0 && ` · ${p.rebuys.length} rebuy${p.rebuys.length > 1 ? "s" : ""}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-lg font-bold text-green-400">${p.total_in}</span>
                                    {isHost && p.role !== "host" && (
                                        confirmKickKey === p.player_key ? (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleKick(p)}
                                                    className="text-xs bg-red-600 active:bg-red-500 text-white px-2 py-1 rounded-lg font-semibold"
                                                >
                                                    Kick
                                                </button>
                                                <button
                                                    onClick={() => setConfirmKickKey(null)}
                                                    className="text-xs bg-gray-800 active:bg-gray-700 text-gray-400 px-2 py-1 rounded-lg"
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmKickKey(p.player_key)}
                                                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-700 active:text-red-500 active:bg-red-500/10 transition-colors"
                                            >
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Rebuys list */}
                            {p.rebuys.length > 0 && (
                                <div className="px-4 pb-2 space-y-1">
                                    {p.rebuys.map((r, i) => (
                                        <div key={r.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-1.5">
                                            <span className="text-xs text-gray-400">
                                                Rebuy #{i + 1} — <span className="text-white font-medium">${r.amount}</span>
                                            </span>
                                            {(isHost || (p.participant_type === "user" && p.id === userId)) && (
                                                confirmDeleteRebuy?.playerKey === p.player_key && confirmDeleteRebuy?.rebuyId === r.id ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleDeleteRebuy(p, r.id)} className="text-xs text-red-400 font-semibold">Remove</button>
                                                        <button onClick={() => setConfirmDeleteRebuy(null)} className="text-xs text-gray-500">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDeleteRebuy(p, r.id)}
                                                        className="text-xs text-gray-600 active:text-red-400 transition-colors"
                                                    >
                                                        Undo
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rebuy input */}
                            {canRebuy && !hasCashedOut && (
                                <div className="flex gap-2 px-4 pb-4 pt-1">
                                    <input
                                        type="number"
                                        value={rebuyAmounts[p.player_key] || ""}
                                        onChange={(e) => setRebuyAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))}
                                        placeholder="Rebuy amount"
                                        className="flex-1 bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm outline-none placeholder-gray-600 transition-colors"
                                    />
                                    <button
                                        onClick={() => handleRebuy(p)}
                                        className="bg-indigo-600 active:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                                    >
                                        + Rebuy
                                    </button>
                                </div>
                            )}

                            {/* Cashout section */}
                            {hasCashedOut ? (
                                <div className="px-4 pb-4 space-y-2">
                                    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                        <span className="text-sm text-amber-400 font-medium">
                                            Cashed out — ${chipCountEntries[p.player_key]}
                                        </span>
                                        {isHost && (
                                            <button onClick={() => handleDeleteChipCount(p)} className="text-xs text-red-400 active:text-red-300 font-semibold">
                                                Reject
                                            </button>
                                        )}
                                    </div>
                                    {isHost && (
                                        <div className="flex gap-2">
                                            <input
                                                type="number" min="0"
                                                value={earlyCashoutAmounts[p.player_key] || ""}
                                                onChange={(e) => setEarlyCashoutAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))}
                                                placeholder="Edit stack amount"
                                                className="flex-1 bg-gray-800 border border-gray-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm outline-none placeholder-gray-600 transition-colors"
                                            />
                                            <button onClick={() => handleHostEditChipCount(p)} className="bg-amber-600 active:bg-amber-500 text-white font-semibold py-2 px-3 rounded-xl text-sm">
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                canCashout && (
                                    <div className="px-4 pb-4 pt-1">
                                        <p className="text-xs text-gray-600 mb-2">
                                            {isHost && p.id !== userId ? "Record early cashout" : "Cash out early"}
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="number" min="0"
                                                value={earlyCashoutAmounts[p.player_key] || ""}
                                                onChange={(e) => setEarlyCashoutAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))}
                                                placeholder="Final chip stack"
                                                className="flex-1 bg-gray-800 border border-gray-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-sm outline-none placeholder-gray-600 transition-colors"
                                            />
                                            <button
                                                onClick={() => isHost ? handleHostEditChipCount(p) : handleEarlyCashout(p)}
                                                className="bg-amber-600 active:bg-amber-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                                            >
                                                {isHost ? "Record" : "Submit"}
                                            </button>
                                        </div>
                                        {!isHost && (
                                            <p className="text-xs text-gray-600 mt-1.5">Host will review your cashout request.</p>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Save as Group ── */}
            <div className="bg-gray-900 border border-gray-800/60 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>
                    <div>
                        <p className="font-semibold text-sm">Save as Group</p>
                        <p className="text-gray-500 text-xs">Quickly start future games with this crew.</p>
                    </div>
                </div>
                <button
                    onClick={() => { setGroupName(""); setShowCreateGroupModal(true); }}
                    className="w-full bg-gray-800 active:bg-gray-700 border border-gray-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                    Create Group from Session
                </button>
            </div>

            {/* ── Host Tools (collapsible) ── */}
            {isHost && (
                <div className="bg-gray-900 border border-gray-800/60 rounded-2xl overflow-hidden mb-4">
                    <button
                        onClick={() => setShowHostTools((v) => !v)}
                        className="w-full flex items-center justify-between p-4 active:bg-gray-800/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                                </svg>
                            </div>
                            <span className="font-semibold text-sm">Host Tools</span>
                        </div>
                        <svg
                            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showHostTools ? "rotate-180" : ""}`}
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {showHostTools && (
                        <div className="border-t border-gray-800 divide-y divide-gray-800">
                            {/* Timer */}
                            <div className="p-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Session Timer</p>
                                {timerEndAt && timeRemaining !== null ? (
                                    <div className="flex items-center justify-between bg-gray-800/60 rounded-xl px-3 py-2.5">
                                        <span className="text-sm text-gray-400">
                                            {timeRemaining === "Time's up!" ? "Timer expired" : "Timer running"}
                                        </span>
                                        <button onClick={handleClearTimer} className="text-xs text-red-400 active:text-red-300 font-semibold">
                                            Clear
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={timerHours}
                                            onChange={(e) => setTimerHours(e.target.value)}
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-2 py-2.5 text-sm text-white outline-none"
                                        >
                                            {Array.from({ length: 9 }, (_, i) => (
                                                <option key={i} value={i}>{i}h</option>
                                            ))}
                                        </select>
                                        <select
                                            value={timerMinutes}
                                            onChange={(e) => setTimerMinutes(e.target.value)}
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-2 py-2.5 text-sm text-white outline-none"
                                        >
                                            {[0, 5, 10, 15, 20, 25, 30, 45].map((m) => (
                                                <option key={m} value={m}>{m}m</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleSetTimer}
                                            className="bg-indigo-600 active:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm"
                                        >
                                            Start
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Add Guest */}
                            <div className="p-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Guest Player</p>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        placeholder="Guest name"
                                        className="flex-1 bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2.5 text-sm outline-none placeholder-gray-600 transition-colors"
                                    />
                                    <input
                                        type="number"
                                        value={guestBuyIn}
                                        onChange={(e) => setGuestBuyIn(e.target.value)}
                                        placeholder="Buy-in"
                                        className="w-28 bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2.5 text-sm outline-none placeholder-gray-600 transition-colors"
                                    />
                                </div>
                                <button
                                    onClick={handleAddGuest}
                                    disabled={addingGuest}
                                    className="w-full bg-blue-600 active:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                                >
                                    {addingGuest ? "Adding..." : "Add Guest"}
                                </button>
                            </div>

                            {/* Transfer Host */}
                            {transferablePlayers.length > 0 && (
                                <div className="p-4">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Transfer Host</p>
                                    <div className="flex flex-col gap-2">
                                        {transferablePlayers.map((p) => (
                                            <div key={p.player_key} className="flex items-center justify-between">
                                                <span className="text-sm text-gray-300">{p.display_name}</span>
                                                {confirmTransferKey === p.player_key ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleTransferHost(p)} className="text-xs bg-amber-600 active:bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold">
                                                            Confirm
                                                        </button>
                                                        <button onClick={() => setConfirmTransferKey(null)} className="text-xs bg-gray-800 active:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setConfirmTransferKey(p.player_key)} className="text-xs text-amber-400 active:text-amber-300 font-semibold">
                                                        Make Host
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Create Group Modal ── */}
            {showCreateGroupModal && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
                    onClick={() => setShowCreateGroupModal(false)}
                >
                    <div
                        className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
                        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold">Create Group</h2>
                            <button
                                onClick={() => setShowCreateGroupModal(false)}
                                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 mb-5">
                            <p className="text-xs text-indigo-300">
                                All registered players in this session will be added. Guests are excluded.
                            </p>
                        </div>
                        <form onSubmit={handleCreateGroup} className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-2 block">Group Name</label>
                                <input
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    placeholder="e.g. Friday Night Crew"
                                    autoFocus
                                    className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={creatingGroup || !groupName.trim()}
                                className="w-full bg-green-500 active:bg-green-400 disabled:opacity-50 text-black font-bold min-h-[52px] rounded-xl transition-colors"
                            >
                                {creatingGroup ? "Creating..." : "Create Group →"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── End Game (fixed footer — host only) ── */}
            {isHost && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur border-t border-gray-800/60 p-4"
                    style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
                >
                    <div className="max-w-lg mx-auto">
                        {confirmEndGame ? (
                            <div className="space-y-2">
                                <p className="text-center text-sm text-gray-400">End the game and move to chip count?</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleEndGame}
                                        className="flex-1 bg-red-600 active:bg-red-500 text-white font-bold py-3.5 rounded-xl transition-colors"
                                    >
                                        End Game
                                    </button>
                                    <button
                                        onClick={() => setConfirmEndGame(false)}
                                        className="flex-1 bg-gray-800 active:bg-gray-700 text-white font-semibold py-3.5 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleEndGame}
                                className="w-full bg-red-600 active:bg-red-500 text-white font-bold py-3.5 rounded-xl transition-colors"
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
