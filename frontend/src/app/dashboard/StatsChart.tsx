"use client";

import { useState } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from "recharts";

type SessionStat = {
    id: string;
    title: string;
    date: string;
    profit: number;
    cumulative: number;
};

type View = "session" | "alltime";

function formatMoney(v: number) {
    return v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`;
}

function formatMoneyAxis(v: number) {
    return v >= 0 ? `$${v}` : `-$${Math.abs(v)}`;
}

function shortDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortLabel(title: string) {
    return title.length > 10 ? title.slice(0, 9) + "…" : title;
}

export default function StatsChart({ stats }: { stats: SessionStat[] }) {
    const [view, setView] = useState<View>("alltime");

    const totalProfit = stats[stats.length - 1]?.cumulative ?? 0;
    const sessions = stats.length;
    const wins = stats.filter((s) => s.profit > 0).length;
    const losses = stats.filter((s) => s.profit < 0).length;
    const evens = stats.filter((s) => s.profit === 0).length;

    return (
        <div className="bg-gray-900 rounded-xl p-4 mb-4">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="font-semibold">Your Stats</h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {sessions} session{sessions !== 1 ? "s" : ""} · {wins}W {losses}L{evens > 0 ? ` ${evens}E` : ""}
                    </p>
                </div>
                <span
                    className={`text-xl font-bold ${
                        totalProfit > 0 ? "text-green-400" : totalProfit < 0 ? "text-red-400" : "text-gray-400"
                    }`}
                >
                    {formatMoney(totalProfit)}
                </span>
            </div>

            {/* Toggle */}
            <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1 w-fit">
                <button
                    onClick={() => setView("alltime")}
                    className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                        view === "alltime" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                    }`}
                >
                    All Time
                </button>
                <button
                    onClick={() => setView("session")}
                    className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                        view === "session" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                    }`}
                >
                    Per Session
                </button>
            </div>

            {/* Chart */}
            {stats.length < 2 ? (
                <p className="text-gray-600 text-xs text-center py-6">
                    Complete more sessions to see your chart.
                </p>
            ) : view === "alltime" ? (
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={stats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={shortDate}
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={formatMoneyAxis}
                            width={48}
                        />
                        <Tooltip
                            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                            labelFormatter={(label) => shortDate(label)}
                            labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                            formatter={(value: number | undefined) => [formatMoney(value ?? 0), "Cumulative P/L"]}
                        />
                        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />
                        <Line
                            type="monotone"
                            dataKey="cumulative"
                            stroke={totalProfit >= 0 ? "#4ade80" : "#f87171"}
                            strokeWidth={2}
                            dot={{ fill: totalProfit >= 0 ? "#4ade80" : "#f87171", r: 3 }}
                            activeDot={{ r: 5 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={stats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis
                            dataKey="title"
                            tickFormatter={shortLabel}
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={formatMoneyAxis}
                            width={48}
                        />
                        <Tooltip
                            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                            labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                            formatter={(value: number | undefined) => [formatMoney(value ?? 0), "Profit / Loss"]}
                        />
                        <ReferenceLine y={0} stroke="#4b5563" />
                        <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
                            {stats.map((s, i) => (
                                <Cell key={i} fill={s.profit >= 0 ? "#4ade80" : "#f87171"} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
