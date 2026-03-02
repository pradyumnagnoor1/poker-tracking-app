"use client";

import { useState } from "react";
import PayoutCard from "./PayoutCard";
import type { PersonGroup } from "./types";

export default function PersonRow({ group, userId }: { group: PersonGroup; userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { name, netToMe, payments, iOweTotal, theyOweTotal } = group;

  const subtext =
    iOweTotal > 0 && theyOweTotal > 0
      ? `you owe $${iOweTotal.toFixed(2)}, owed $${theyOweTotal.toFixed(2)}`
      : `${payments.length} session${payments.length !== 1 ? "s" : ""}`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Person header — tap to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-sm">{name}</p>
            <p className="text-xs text-gray-500">{subtext}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            {netToMe === 0 ? (
              <p className="text-gray-400 text-sm font-semibold">Even</p>
            ) : netToMe > 0 ? (
              <>
                <p className="text-green-400 font-bold">+${netToMe.toFixed(2)}</p>
                <p className="text-xs text-gray-500">owed to you</p>
              </>
            ) : (
              <>
                <p className="text-red-400 font-bold">-${Math.abs(netToMe).toFixed(2)}</p>
                <p className="text-xs text-gray-500">you owe</p>
              </>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded: individual session payments */}
      {expanded && (
        <div className="border-t border-gray-800 p-4 flex flex-col gap-3">
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
