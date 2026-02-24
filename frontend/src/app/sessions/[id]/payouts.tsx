"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/supabase/client";
import { computeTransfers, type Transfer } from "@/lib/computeTransfers";

type ParticipantType = "user" | "guest";

type Participant = {
    participant_type: ParticipantType;
    id: string;
    display_name: string;
};

type Player = {
    player_key: string;
    participant_type: ParticipantType;
    id: string;
    display_name: string;
    total_in: number;
    final_stack: number;
    profit: number;
};

type PaymentRecord = {
    id: string;
    from_user_id: string;
    to_user_id: string;
    status: "pending" | "claimed" | "confirmed";
};

type UserMemberRow = {
    user_id: string;
    profiles: { display_name: string } | null;
};

type GuestRow = {
    id: string;
    display_name: string;
};

type UserBuyinRow = {
    user_id: string;
    amount: number;
};

type GuestBuyinRow = {
    guest_id: string;
    amount: number;
};

type UserChipCountRow = {
    user_id: string;
    final_stack: number;
};

type GuestChipCountRow = {
    guest_id: string;
    final_stack: number;
};

function toPlayerKey(type: ParticipantType, id: string) {
    return `${type}:${id}`;
}

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

export default function PayoutsView({
    sessionId,
    userId,
    isHost,
    sessionState,
}: {
    sessionId: string;
    userId: string;
    isHost: boolean;
    sessionState: string;
}) {
    const supabase = createClient();
    const [players, setPlayers] = useState<Player[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [participants, setParticipants] = useState<Record<string, Participant>>({});
    const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
    const [dbPayments, setDbPayments] = useState<Record<string, PaymentRecord>>({});
    const [localSettled, setLocalSettled] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);

    const fetchPayouts = useCallback(async () => {
        const { data: members } = await supabase
            .from("session_members")
            .select("user_id, profiles(display_name)")
            .eq("session_id", sessionId);

        const { data: guests } = await supabase
            .from("session_guests")
            .select("id, display_name")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        const { data: buyins } = await supabase
            .from("buyins")
            .select("user_id, amount")
            .eq("session_id", sessionId);

        const { data: guestBuyins } = await supabase
            .from("guest_buyins")
            .select("guest_id, amount")
            .eq("session_id", sessionId);

        const { data: chipCounts } = await supabase
            .from("chip_counts")
            .select("user_id, final_stack")
            .eq("session_id", sessionId);

        const { data: guestChipCounts } = await supabase
            .from("guest_chip_counts")
            .select("guest_id, final_stack")
            .eq("session_id", sessionId);

        const participantsMap: Record<string, Participant> = {};
        const nameMap: Record<string, string> = {};

        (members as UserMemberRow[] | null)?.forEach((m) => {
            const key = toPlayerKey("user", m.user_id);
            const name = m.profiles?.display_name ?? "Unknown user";
            participantsMap[key] = { participant_type: "user", id: m.user_id, display_name: name };
            nameMap[key] = name;
        });

        (guests as GuestRow[] | null)?.forEach((g) => {
            const key = toPlayerKey("guest", g.id);
            participantsMap[key] = { participant_type: "guest", id: g.id, display_name: g.display_name };
            nameMap[key] = g.display_name;
        });

        const playerList: Player[] = Object.entries(participantsMap).map(([player_key, participant]) => {
            let totalIn = 0;
            let finalStack = 0;

            if (participant.participant_type === "user") {
                totalIn =
                    (buyins as UserBuyinRow[] | null)
                        ?.filter((b) => b.user_id === participant.id)
                        .reduce((sum, b) => sum + b.amount, 0) ?? 0;
                finalStack = Number(
                    (chipCounts as UserChipCountRow[] | null)?.find((c) => c.user_id === participant.id)?.final_stack ?? 0
                );
            } else {
                totalIn =
                    (guestBuyins as GuestBuyinRow[] | null)
                        ?.filter((b) => b.guest_id === participant.id)
                        .reduce((sum, b) => sum + b.amount, 0) ?? 0;
                finalStack = Number(
                    (guestChipCounts as GuestChipCountRow[] | null)?.find((c) => c.guest_id === participant.id)?.final_stack ?? 0
                );
            }

            return {
                player_key,
                participant_type: participant.participant_type,
                id: participant.id,
                display_name: participant.display_name,
                total_in: round2(totalIn),
                final_stack: round2(finalStack),
                profit: round2(finalStack - totalIn),
            };
        });

        const computed = computeTransfers(
            playerList.map((p) => ({
                user_id: p.player_key,
                profit: p.profit,
            }))
        );

        // Upsert payment records for user-to-user transfers (idempotent)
        const userToUserTransfers = computed.filter(
            (t) => t.from_user_id.startsWith("user:") && t.to_user_id.startsWith("user:")
        );
        if (userToUserTransfers.length > 0) {
            await supabase.from("payments").upsert(
                userToUserTransfers.map((t) => ({
                    session_id: sessionId,
                    from_user_id: t.from_user_id.slice(5),
                    to_user_id: t.to_user_id.slice(5),
                    amount: t.amount,
                })),
                { onConflict: "session_id,from_user_id,to_user_id", ignoreDuplicates: true }
            );
        }

        // Load all payment statuses for this session
        const { data: paymentRows } = await supabase
            .from("payments")
            .select("id, from_user_id, to_user_id, status")
            .eq("session_id", sessionId);

        const paymentsMap: Record<string, PaymentRecord> = {};
        (paymentRows as PaymentRecord[] | null)?.forEach((p) => {
            paymentsMap[`${p.from_user_id}:${p.to_user_id}`] = p;
        });

        setParticipants(participantsMap);
        setDisplayNames(nameMap);
        setPlayers(playerList);
        setTransfers(computed);
        setDbPayments(paymentsMap);
        setLoading(false);
    }, [sessionId, supabase]);

    useEffect(() => {
        fetchPayouts();

        const channel = supabase
            .channel(`payouts-${sessionId}`)
            // Refresh payment statuses when any payment is claimed/confirmed
            .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `session_id=eq.${sessionId}` }, () => fetchPayouts())
            // Auto-navigate when host closes session
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => window.location.reload())
            .subscribe();

        // Poll session state every 5s as fallback
        const statePoll = setInterval(async () => {
            const { data } = await supabase.from("sessions").select("state").eq("id", sessionId).single();
            if (data && data.state !== sessionState) window.location.reload();
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(statePoll);
        };
    }, [fetchPayouts, supabase, sessionId, sessionState]);

    const handleClaim = async (paymentId: string) => {
        const { error } = await supabase.rpc("claim_payment", { p_payment_id: paymentId });
        if (error) { alert(error.message); return; }
        fetchPayouts();
    };

    const handleConfirm = async (paymentId: string) => {
        const { error } = await supabase.rpc("confirm_payment", { p_payment_id: paymentId });
        if (error) { alert(error.message); return; }
        fetchPayouts();
    };

    const toggleLocalSettled = (index: number) => {
        setLocalSettled((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const handleCloseSession = async () => {
        if (!confirmClose) {
            setConfirmClose(true);
            return;
        }
        setConfirmClose(false);
        setClosing(true);
        const { error } = await supabase.rpc("close_session", { p_session_id: sessionId });
        if (error) {
            alert(`Could not close session: ${error.message}`);
            setClosing(false);
            return;
        }
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <p className="text-gray-500 text-sm">Loading payouts...</p>
            </div>
        );
    }

    const isClosed = sessionState === "closed";
    const winners = players.filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit);
    const losers = players.filter((p) => p.profit < 0).sort((a, b) => a.profit - b.profit);
    const evenPlayers = players.filter((p) => p.profit === 0);
    const totalPot = players.reduce((sum, p) => sum + p.total_in, 0);

    const confirmedCount = Object.values(dbPayments).filter((p) => p.status === "confirmed").length + localSettled.size;

    return (
        <div className="pb-28 space-y-4">
            {/* Summary */}
            <div className="bg-gray-900 rounded-xl p-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Session Summary
                </h2>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-400 text-xs mb-1">Total Pot</p>
                        <p className="text-white font-bold text-xl">${totalPot}</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-400 text-xs mb-1">Players</p>
                        <p className="text-white font-bold text-xl">{players.length}</p>
                    </div>
                    {winners[0] && (
                        <div className="bg-green-950/40 border border-green-900/40 rounded-lg p-3">
                            <p className="text-green-500 text-xs mb-1">Biggest Winner</p>
                            <p className="text-white font-medium text-sm truncate">{winners[0].display_name}</p>
                            <p className="text-green-400 font-bold">+${winners[0].profit}</p>
                        </div>
                    )}
                    {losers[0] && (
                        <div className="bg-red-950/40 border border-red-900/40 rounded-lg p-3">
                            <p className="text-red-500 text-xs mb-1">Biggest Loser</p>
                            <p className="text-white font-medium text-sm truncate">{losers[0].display_name}</p>
                            <p className="text-red-400 font-bold">-${Math.abs(losers[0].profit)}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Results */}
            {(winners.length > 0 || losers.length > 0 || evenPlayers.length > 0) && (
                <div className="bg-gray-900 rounded-xl p-4">
                    <h2 className="font-semibold mb-3">Results</h2>
                    <div className="flex flex-col">
                        {[...winners, ...evenPlayers, ...losers].map((p, i, arr) => (
                            <div
                                key={p.player_key}
                                className={`flex justify-between items-center py-2.5 ${
                                    i < arr.length - 1 ? "border-b border-gray-800" : ""
                                }`}
                            >
                                <p className="text-sm font-medium text-white">
                                    {p.display_name}
                                    {p.participant_type === "guest" && (
                                        <span className="text-blue-400 text-xs ml-2">Guest</span>
                                    )}
                                    {p.participant_type === "user" && p.id === userId && (
                                        <span className="text-gray-500 text-xs ml-1">(you)</span>
                                    )}
                                </p>
                                <span
                                    className={`font-bold ${
                                        p.profit > 0
                                            ? "text-green-400"
                                            : p.profit < 0
                                            ? "text-red-400"
                                            : "text-gray-400"
                                    }`}
                                >
                                    {p.profit > 0
                                        ? `+$${p.profit}`
                                        : p.profit < 0
                                        ? `-$${Math.abs(p.profit)}`
                                        : "Even"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Settlements */}
            <div className="bg-gray-900 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="font-semibold">
                        Settlements
                        <span className="text-gray-500 text-xs font-normal ml-2">
                            ({transfers.length} transfer{transfers.length !== 1 ? "s" : ""})
                        </span>
                    </h2>
                    {transfers.length > 0 && (
                        <span className="text-gray-500 text-xs">
                            {confirmedCount}/{transfers.length} done
                        </span>
                    )}
                </div>

                {transfers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No transfers needed — everyone broke even.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {transfers.map((t, i) => {
                            const fromName = displayNames[t.from_user_id] ?? t.from_user_id;
                            const toName = displayNames[t.to_user_id] ?? t.to_user_id;
                            const fromIsUser = t.from_user_id.startsWith("user:");
                            const toIsUser = t.to_user_id.startsWith("user:");
                            const isUserToUser = fromIsUser && toIsUser;

                            if (isUserToUser) {
                                const fromUserId = t.from_user_id.slice(5);
                                const toUserId = t.to_user_id.slice(5);
                                const payment = dbPayments[`${fromUserId}:${toUserId}`];
                                const status = payment?.status ?? "pending";
                                const iAmPayer = userId === fromUserId;
                                const iAmReceiver = userId === toUserId;
                                const isConfirmed = status === "confirmed";
                                const isClaimed = status === "claimed";

                                return (
                                    <div
                                        key={`${t.from_user_id}:${t.to_user_id}:${i}`}
                                        className={`rounded-lg p-3 border transition-colors ${
                                            isConfirmed
                                                ? "border-green-900/40 bg-green-950/20"
                                                : isClaimed
                                                ? "border-yellow-900/40 bg-yellow-950/10"
                                                : "border-gray-800 bg-gray-800/20"
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-snug ${isConfirmed ? "opacity-50" : ""}`}>
                                                    <span className="font-semibold text-red-400">{fromName}</span>
                                                    <span className="text-gray-500 mx-1.5">pays</span>
                                                    <span className="font-semibold text-green-400">{toName}</span>
                                                </p>
                                                <div className="mt-1.5">
                                                    {isConfirmed && (
                                                        <p className="text-green-500 text-xs">Confirmed ✓</p>
                                                    )}
                                                    {isClaimed && !isConfirmed && iAmReceiver && (
                                                        <button
                                                            onClick={() => payment && handleConfirm(payment.id)}
                                                            className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded font-semibold"
                                                        >
                                                            Confirm Received
                                                        </button>
                                                    )}
                                                    {isClaimed && !isConfirmed && !iAmReceiver && (
                                                        <p className="text-yellow-500 text-xs">Sent — awaiting confirmation</p>
                                                    )}
                                                    {!isClaimed && !isConfirmed && iAmPayer && (
                                                        <button
                                                            onClick={() => payment && handleClaim(payment.id)}
                                                            className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded font-semibold"
                                                        >
                                                            Mark as Paid
                                                        </button>
                                                    )}
                                                    {!isClaimed && !isConfirmed && !iAmPayer && !iAmReceiver && (
                                                        <p className="text-gray-600 text-xs">Pending</p>
                                                    )}
                                                    {!isClaimed && !isConfirmed && !iAmPayer && iAmReceiver && (
                                                        <p className="text-gray-500 text-xs">Waiting for payment...</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={`font-bold text-base shrink-0 ${isConfirmed ? "text-gray-600" : "text-white"}`}>
                                                ${t.amount}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }

                            // Guest involved — local toggle
                            const isSettled = localSettled.has(i);
                            const from = participants[t.from_user_id];
                            const to = participants[t.to_user_id];
                            const involvesGuest =
                                from?.participant_type === "guest" || to?.participant_type === "guest";

                            return (
                                <div
                                    key={`${t.from_user_id}:${t.to_user_id}:${i}`}
                                    onClick={() => toggleLocalSettled(i)}
                                    className={`rounded-lg p-3 border cursor-pointer transition-colors ${
                                        isSettled
                                            ? "border-green-900/40 bg-green-950/20"
                                            : "border-gray-800 bg-gray-800/20 hover:bg-gray-800/40"
                                    }`}
                                >
                                    <div className="flex justify-between items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-snug ${isSettled ? "opacity-50" : ""}`}>
                                                <span className="font-semibold text-red-400">{fromName}</span>
                                                <span className="text-gray-500 mx-1.5">pays</span>
                                                <span className="font-semibold text-green-400">{toName}</span>
                                            </p>
                                            {involvesGuest && !isSettled && (
                                                <p className="text-gray-600 text-xs mt-0.5">Settle in cash · tap to mark done</p>
                                            )}
                                            {isSettled && (
                                                <p className="text-green-600 text-xs mt-0.5">Settled ✓</p>
                                            )}
                                        </div>
                                        <span className={`font-bold text-base ${isSettled ? "text-gray-600" : "text-white"}`}>
                                            ${t.amount}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {isHost && !isClosed && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4">
                    <div className="max-w-lg mx-auto">
                        {confirmClose ? (
                            <div className="space-y-2">
                                <p className="text-center text-sm text-gray-400">Close this session? This cannot be undone.</p>
                                <div className="flex gap-2">
                                    <button onClick={handleCloseSession} disabled={closing} className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
                                        {closing ? "Closing..." : "Confirm"}
                                    </button>
                                    <button onClick={() => setConfirmClose(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleCloseSession}
                                disabled={closing}
                                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl w-full transition-colors"
                            >
                                Close Session
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isClosed && (
                <div className="text-center text-gray-600 text-xs mt-2">Session closed</div>
            )}
        </div>
    );
}
