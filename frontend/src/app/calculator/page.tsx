"use client";

import { useState, useMemo, useEffect } from "react";
import { computeTransfers } from "@/lib/computeTransfers";

type Player = {
    id: string;
    name: string;
    buyIn: number;
    finalStack: number;
};

let nextId = 1;

export default function CalculatorPage() {
    const [players, setPlayers] = useState<Player[]>([]);
    const [name, setName] = useState("");
    const [buyIn, setBuyIn] = useState("");
    const [finalStack, setFinalStack] = useState("");
    const [error, setError] = useState("");
    const [paid, setPaid] = useState<boolean[]>([]);

    const addPlayer = () => {
        const trimmedName = name.trim();
        if (!trimmedName) { setError("Name is required."); return; }
        const bi = parseFloat(buyIn);
        const fs = parseFloat(finalStack);
        if (isNaN(bi) || bi <= 0) { setError("Buy-in must be a positive number."); return; }
        if (isNaN(fs) || fs < 0) { setError("Final stack must be 0 or greater."); return; }
        if (players.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
            setError("A player with that name already exists.");
            return;
        }
        setPlayers((prev) => [
            ...prev,
            { id: String(nextId++), name: trimmedName, buyIn: bi, finalStack: fs },
        ]);
        setName("");
        setBuyIn("");
        setFinalStack("");
        setError("");
    };

    const removePlayer = (id: string) => {
        setPlayers((prev) => prev.filter((p) => p.id !== id));
    };

    const reset = () => {
        setPlayers([]);
        setName("");
        setBuyIn("");
        setFinalStack("");
        setError("");
    };

    const playersWithProfit = useMemo(
        () => players.map((p) => ({ ...p, profit: p.finalStack - p.buyIn })),
        [players]
    );

    const transfers = useMemo(() => {
        const input = playersWithProfit.map((p) => ({ user_id: p.id, profit: p.profit }));
        return computeTransfers(input);
    }, [playersWithProfit]);

    // Reset paid state whenever transfers change (player added/removed)
    useEffect(() => {
        setPaid(new Array(transfers.length).fill(false));
    }, [transfers]);

    const togglePaid = (i: number) =>
        setPaid((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

    const totalIn = playersWithProfit.reduce((s, p) => s + p.buyIn, 0);
    const totalOut = playersWithProfit.reduce((s, p) => s + p.finalStack, 0);
    const diff = Math.round((totalOut - totalIn) * 100) / 100;
    const isBalanced = Math.abs(diff) < 0.01;

    const nameMap = Object.fromEntries(players.map((p) => [p.id, p.name]));

    const winners = playersWithProfit.filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit);
    const losers = playersWithProfit.filter((p) => p.profit < 0).sort((a, b) => a.profit - b.profit);
    const even = playersWithProfit.filter((p) => p.profit === 0);

    const paidCount = paid.filter(Boolean).length;
    const allPaid = transfers.length > 0 && paidCount === transfers.length;

    return (
        <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold">Settlement Calculator</h1>
                    <p className="text-gray-500 text-xs mt-0.5">Test the cashout algorithm manually</p>
                </div>
                {players.length > 0 && (
                    <button
                        onClick={reset}
                        className="text-gray-500 text-sm hover:text-white transition-colors"
                    >
                        Reset
                    </button>
                )}
            </div>

            {/* Add player form */}
            <div className="bg-gray-900 rounded-xl p-4 mb-4">
                <h2 className="font-semibold mb-3">Add Player</h2>
                <div className="flex flex-col gap-2">
                    <input
                        value={name}
                        onChange={(e) => { setName(e.target.value); setError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                        placeholder="Player name"
                        className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600"
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            value={buyIn}
                            onChange={(e) => { setBuyIn(e.target.value); setError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Buy-in ($)"
                            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600"
                        />
                        <input
                            value={finalStack}
                            onChange={(e) => { setFinalStack(e.target.value); setError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Final stack ($)"
                            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600"
                        />
                    </div>
                    {error && <p className="text-red-400 text-xs">{error}</p>}
                    <button
                        onClick={addPlayer}
                        className="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                    >
                        Add Player
                    </button>
                </div>
            </div>

            {players.length === 0 && (
                <p className="text-gray-600 text-sm text-center py-8">
                    Add at least two players to see settlements.
                </p>
            )}

            {players.length > 0 && (
                <>
                    {/* Balance check */}
                    <div
                        className={`rounded-xl p-3 mb-4 flex items-center justify-between text-sm ${
                            isBalanced
                                ? "bg-green-950/40 border border-green-900/40"
                                : "bg-red-950/40 border border-red-900/40"
                        }`}
                    >
                        <span className={isBalanced ? "text-green-400" : "text-red-400"}>
                            {isBalanced ? "Balanced ✓" : `Imbalanced — diff: ${diff > 0 ? "+" : ""}$${diff}`}
                        </span>
                        <span className="text-gray-500 text-xs">
                            In: ${totalIn} · Out: ${totalOut}
                        </span>
                    </div>

                    {/* Player list */}
                    <div className="bg-gray-900 rounded-xl p-4 mb-4">
                        <h2 className="font-semibold mb-3 flex items-center justify-between">
                            Players
                            <span className="text-gray-500 text-xs font-normal">{players.length} added</span>
                        </h2>
                        <div className="flex flex-col">
                            {playersWithProfit
                                .slice()
                                .sort((a, b) => b.profit - a.profit)
                                .map((p, i) => (
                                    <div
                                        key={p.id}
                                        className={`flex justify-between items-center py-2.5 ${
                                            i < players.length - 1 ? "border-b border-gray-800" : ""
                                        }`}
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-white">{p.name}</p>
                                            <p className="text-gray-500 text-xs">
                                                In: ${p.buyIn} · Out: ${p.finalStack}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={`font-bold text-sm ${
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
                                            <button
                                                onClick={() => removePlayer(p.id)}
                                                className="text-gray-600 hover:text-red-400 text-lg leading-none transition-colors"
                                                aria-label={`Remove ${p.name}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Winners / Losers / Even */}
                    {(winners.length > 0 || losers.length > 0 || even.length > 0) && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {winners.length > 0 && (
                                <div className="bg-green-950/30 border border-green-900/40 rounded-xl p-3">
                                    <p className="text-green-500 text-xs font-semibold mb-2">
                                        ↑ Winners ({winners.length})
                                    </p>
                                    {winners.map((p) => (
                                        <div key={p.id} className="flex justify-between text-xs py-0.5">
                                            <span className="text-white truncate mr-2">{p.name}</span>
                                            <span className="text-green-400 font-bold shrink-0">+${p.profit}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {losers.length > 0 && (
                                <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-3">
                                    <p className="text-red-500 text-xs font-semibold mb-2">
                                        ↓ Losers ({losers.length})
                                    </p>
                                    {losers.map((p) => (
                                        <div key={p.id} className="flex justify-between text-xs py-0.5">
                                            <span className="text-white truncate mr-2">{p.name}</span>
                                            <span className="text-red-400 font-bold shrink-0">
                                                -${Math.abs(p.profit)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {even.length > 0 && (
                                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 col-span-2">
                                    <p className="text-gray-500 text-xs font-semibold mb-1">— Break Even</p>
                                    <p className="text-gray-400 text-xs">
                                        {even.map((p) => p.name).join(", ")}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settlements */}
                    <div className="bg-gray-900 rounded-xl p-4">
                        <div className="flex items-baseline justify-between mb-3">
                            <h2 className="font-semibold flex items-center gap-2">
                                Who Pays Who
                                <span className="text-gray-500 text-xs font-normal">
                                    ({transfers.length} payment{transfers.length !== 1 ? "s" : ""})
                                </span>
                            </h2>
                            {transfers.length > 0 && (
                                <span className="text-xs text-gray-500">
                                    {paidCount}/{transfers.length} paid
                                </span>
                            )}
                        </div>

                        {!isBalanced && (
                            <p className="text-yellow-500 text-xs mb-3">
                                Fix the imbalance above for accurate settlements.
                            </p>
                        )}

                        {transfers.length === 0 ? (
                            <p className="text-gray-500 text-sm">
                                {players.length < 2
                                    ? "Add more players to compute settlements."
                                    : "No transfers needed — everyone broke even!"}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {transfers.map((t, i) => {
                                    const isPaid = paid[i] ?? false;
                                    return (
                                        <div
                                            key={i}
                                            className={`rounded-lg border px-3 py-2.5 transition-all ${
                                                isPaid
                                                    ? "border-gray-800 bg-gray-800/20 opacity-50"
                                                    : "border-gray-700 bg-gray-800/50"
                                            }`}
                                        >
                                            <div className="flex justify-between items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm">
                                                        <span className="text-red-400 font-semibold">
                                                            {nameMap[t.from_user_id]}
                                                        </span>
                                                        <span className="text-gray-500 mx-1.5">pays</span>
                                                        <span className="text-green-400 font-semibold">
                                                            {nameMap[t.to_user_id]}
                                                        </span>
                                                    </p>
                                                    {isPaid && (
                                                        <p className="text-gray-500 text-xs mt-0.5">Paid ✓</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span
                                                        className={`font-bold text-base ${
                                                            isPaid ? "text-gray-500 line-through" : "text-white"
                                                        }`}
                                                    >
                                                        ${t.amount}
                                                    </span>
                                                    <button
                                                        onClick={() => togglePaid(i)}
                                                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                                                            isPaid
                                                                ? "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                                                : "bg-green-800 text-green-100 hover:bg-green-700"
                                                        }`}
                                                    >
                                                        {isPaid ? "Undo" : "Mark Paid"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {allPaid && (
                                    <div className="text-center text-green-400 text-sm font-medium py-2">
                                        All payments complete ✓
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </main>
    );
}
