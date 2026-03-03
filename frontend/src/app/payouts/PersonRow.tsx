"use client";

import { useState } from "react";
import PayoutCard from "./PayoutCard";
import type { PersonGroup } from "./types";

type Props = {
  group: PersonGroup;
  userId: string;
};

export default function PersonRow({ group, userId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { name, netToMe, payments } = group;

  const isOwed = netToMe > 0;
  const iOwe = netToMe < 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Summary row — tap to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-4 min-h-[64px] text-left active:bg-gray-800 transition-colors"
      >
        {/* Avatar initial */}
        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-gray-400">{name.charAt(0).toUpperCase()}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-snug">{name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {payments.length} session{payments.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p
              className={`text-xl font-extrabold tabular-nums ${
                isOwed ? "text-green-400" : iOwe ? "text-red-400" : "text-gray-500"
              }`}
            >
              {isOwed ? "+" : iOwe ? "-" : ""}${Math.abs(netToMe).toFixed(2)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {isOwed ? "owed to you" : iOwe ? "you owe" : "settled"}
            </p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded: per-session payment cards */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-2">
          {payments.map((p) => (
            <PayoutCard
              key={p.id}
              payment={p}
              otherName={name}
              role={p.from_user_id === userId ? "payer" : "receiver"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
