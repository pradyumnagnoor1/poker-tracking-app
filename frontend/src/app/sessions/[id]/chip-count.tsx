"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/supabase/client";

type ParticipantType = "user" | "guest";

type Player = {
    player_key: string;
    participant_type: ParticipantType;
    id: string;
    display_name: string;
    total_in: number;
    final_stack: number | null;
    profit: number | null;
};

type SessionTotals = {
    total_in: number;
    total_out: number;
    difference: number;
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

export default function ChipCountView({
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
    const [totals, setTotals] = useState<SessionTotals | null>(null);
    const [stackAmounts, setStackAmounts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [confirmProceed, setConfirmProceed] = useState(false);

    const fetchData = useCallback(async () => {
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

        const userPlayers =
            (members as UserMemberRow[] | null)?.map((m) => {
                const totalIn =
                    (buyins as UserBuyinRow[] | null)
                        ?.filter((b) => b.user_id === m.user_id)
                        .reduce((sum, b) => sum + b.amount, 0) ?? 0;
                const chip = (chipCounts as UserChipCountRow[] | null)?.find((c) => c.user_id === m.user_id);
                const finalStack = chip ? Number(chip.final_stack) : null;
                return {
                    player_key: toPlayerKey("user", m.user_id),
                    participant_type: "user" as const,
                    id: m.user_id,
                    display_name: m.profiles?.display_name ?? "Unknown user",
                    total_in: Number(totalIn),
                    final_stack: finalStack,
                    profit: finalStack !== null ? round2(finalStack - totalIn) : null,
                };
            }) ?? [];

        const guestPlayers =
            (guests as GuestRow[] | null)?.map((g) => {
                const totalIn =
                    (guestBuyins as GuestBuyinRow[] | null)
                        ?.filter((b) => b.guest_id === g.id)
                        .reduce((sum, b) => sum + b.amount, 0) ?? 0;
                const chip = (guestChipCounts as GuestChipCountRow[] | null)?.find((c) => c.guest_id === g.id);
                const finalStack = chip ? Number(chip.final_stack) : null;
                return {
                    player_key: toPlayerKey("guest", g.id),
                    participant_type: "guest" as const,
                    id: g.id,
                    display_name: g.display_name,
                    total_in: Number(totalIn),
                    final_stack: finalStack,
                    profit: finalStack !== null ? round2(finalStack - totalIn) : null,
                };
            }) ?? [];

        const merged = [...userPlayers, ...guestPlayers];
        setPlayers(merged);

        const totalIn = round2(merged.reduce((sum, p) => sum + p.total_in, 0));
        const totalOut = round2(
            merged.reduce((sum, p) => sum + (p.final_stack === null ? 0 : p.final_stack), 0)
        );
        setTotals({
            total_in: totalIn,
            total_out: totalOut,
            difference: round2(totalOut - totalIn),
        });

        setLoading(false);
    }, [supabase, sessionId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchData();

        const channel = supabase
            .channel(`chip-count-${sessionId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "chip_counts", filter: `session_id=eq.${sessionId}` },
                () => fetchData()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "guest_chip_counts", filter: `session_id=eq.${sessionId}` },
                () => fetchData()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "guest_buyins", filter: `session_id=eq.${sessionId}` },
                () => fetchData()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "session_guests", filter: `session_id=eq.${sessionId}` },
                () => fetchData()
            )
            // Auto-navigate all users when host transitions phase
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => window.location.reload())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchData, supabase, sessionId]);

    const handleSetStack = async (player: Player) => {
        const amount = parseFloat(stackAmounts[player.player_key]);
        if (isNaN(amount) || amount < 0) return;

        if (player.participant_type === "user") {
            const existing = players.find((p) => p.player_key === player.player_key)?.final_stack;
            if (existing !== null) {
                await supabase
                    .from("chip_counts")
                    .update({ final_stack: amount })
                    .eq("session_id", sessionId)
                    .eq("user_id", player.id);
            } else {
                await supabase.from("chip_counts").insert({
                    session_id: sessionId,
                    user_id: player.id,
                    final_stack: amount,
                });
            }
        } else {
            const existing = players.find((p) => p.player_key === player.player_key)?.final_stack;
            if (existing !== null) {
                await supabase
                    .from("guest_chip_counts")
                    .update({ final_stack: amount })
                    .eq("session_id", sessionId)
                    .eq("guest_id", player.id);
            } else {
                await supabase.from("guest_chip_counts").insert({
                    session_id: sessionId,
                    guest_id: player.id,
                    final_stack: amount,
                });
            }
        }

        setStackAmounts((prev) => ({ ...prev, [player.player_key]: "" }));
        fetchData();
    };

    const handleProceedToPayouts = async () => {
        if (!confirmProceed) {
            setConfirmProceed(true);
            return;
        }
        setConfirmProceed(false);
        setSubmitting(true);

        const { error } = await supabase.rpc("proceed_to_payouts", {
            p_session_id: sessionId,
        });

        if (error) {
            alert(`Cannot proceed: ${error.message}`);
            setSubmitting(false);
            return;
        }

        window.location.reload();
    };

    const allEntered = players.length > 0 && players.every((p) => p.final_stack !== null);
    const isBalanced = totals !== null && Math.abs(totals.difference) < 0.01;

    const balanceLabel = () => {
        if (!totals) return null;
        if (Math.abs(totals.difference) < 0.01) return <span className="text-green-400 font-semibold">Balanced</span>;
        if (totals.difference > 0) return <span className="text-yellow-400 font-semibold">Over by ${totals.difference}</span>;
        return <span className="text-red-400 font-semibold">Short by ${Math.abs(totals.difference)}</span>;
    };

    const canEdit = (player: Player) => {
        if (isHost) return true;
        if (player.participant_type === "guest") return false;
        return player.id === userId;
    };

    if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

    return (
        <div className="pb-28">
            {/* Totals header */}
            <div className="sticky top-0 bg-gray-950 py-3 mb-4 border-b border-gray-800 z-10 space-y-1">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Total In</span>
                    <span className="text-white font-bold">${totals?.total_in ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Total Out</span>
                    <span className="text-white font-bold">${totals?.total_out ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Balance</span>
                    {balanceLabel()}
                </div>
            </div>

            {/* Player list */}
            <div className="flex flex-col gap-3">
                {players.map((p) => (
                    <div key={p.player_key} className="bg-gray-900 rounded-xl p-4">
                        {/* Player info */}
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="font-medium text-sm">
                                    {p.display_name}
                                    {p.participant_type === "guest" && (
                                        <span className="text-blue-400 text-xs ml-2">Guest</span>
                                    )}
                                </p>
                                <p className="text-gray-500 text-xs">Bought in: ${p.total_in}</p>
                            </div>
                            <div className="text-right">
                                {p.final_stack !== null ? (
                                    <>
                                        <p className="text-white font-bold text-sm">${p.final_stack}</p>
                                        <p
                                            className={`text-xs font-semibold ${
                                                p.profit! > 0
                                                    ? "text-green-400"
                                                    : p.profit! < 0
                                                    ? "text-red-400"
                                                    : "text-gray-400"
                                            }`}
                                        >
                                            {p.profit! > 0 ? `+$${p.profit}` : p.profit! < 0 ? `-$${Math.abs(p.profit!)}` : "Break even"}
                                        </p>
                                    </>
                                ) : (
                                    <span className="text-gray-500 text-xs">Not entered</span>
                                )}
                            </div>
                        </div>

                        {/* Input */}
                        {canEdit(p) && (
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={stackAmounts[p.player_key] || ""}
                                    onChange={(e) =>
                                        setStackAmounts((prev) => ({ ...prev, [p.player_key]: e.target.value }))
                                    }
                                    placeholder={
                                        p.final_stack !== null
                                            ? `Update (current: $${p.final_stack})`
                                            : "Enter final chip count"
                                    }
                                    className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm placeholder-gray-600"
                                />
                                <button
                                    onClick={() => handleSetStack(p)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg text-sm"
                                >
                                    {p.final_stack !== null ? "Update" : "Set"}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Host: proceed button */}
            {isHost && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4">
                    <div className="max-w-lg mx-auto">
                        {!allEntered && (
                            <p className="text-yellow-500 text-xs text-center mb-2">
                                All players (including guests) must enter their chip count first
                            </p>
                        )}
                        {allEntered && !isBalanced && (
                            <p className="text-red-400 text-xs text-center mb-2">
                                Chips do not balance. Fix counts before proceeding.
                            </p>
                        )}
                        {confirmProceed ? (
                            <div className="space-y-2">
                                <p className="text-center text-sm text-gray-400">Finalize chip counts and proceed to payouts?</p>
                                <div className="flex gap-2">
                                    <button onClick={handleProceedToPayouts} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
                                        {submitting ? "Verifying..." : "Confirm"}
                                    </button>
                                    <button onClick={() => setConfirmProceed(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleProceedToPayouts}
                                disabled={!allEntered || !isBalanced || submitting}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-xl w-full transition-colors"
                            >
                                Proceed to Payouts
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
