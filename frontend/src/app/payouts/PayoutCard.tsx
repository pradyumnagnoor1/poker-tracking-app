"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/supabase/client";
import type { Payment } from "./types";

type Props = {
  payment: Payment;
  otherName: string;
  role: "payer" | "receiver";
};

export default function PayoutCard({ payment, otherName, role }: Props) {
  const [status, setStatus] = useState<Payment["status"]>(payment.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("claim_payment", {
      p_payment_id: payment.id,
    });
    if (rpcError) setError("Failed to update. Try again.");
    else setStatus("claimed");
    setLoading(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("confirm_payment", {
      p_payment_id: payment.id,
    });
    if (rpcError) setError("Failed to confirm. Try again.");
    else setStatus("confirmed");
    setLoading(false);
  };

  const cardStyle =
    status === "confirmed"
      ? "border-green-900/40 bg-green-950/20"
      : status === "claimed"
      ? "border-yellow-900/40 bg-yellow-950/10"
      : "border-gray-800 bg-gray-800/20";

  return (
    <div className={`border rounded-xl p-3 transition-colors ${cardStyle}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white">{otherName}</span>
            <StatusBadge status={status} />
          </div>
          {payment.session && (
            <Link
              href={`/sessions/${payment.session.id}`}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-0.5 block truncate"
            >
              {payment.session.title}
            </Link>
          )}
        </div>
        <span
          className={`text-base font-bold shrink-0 ${
            role === "payer" ? "text-red-400" : "text-green-400"
          }`}
        >
          ${Number(payment.amount).toFixed(2)}
        </span>
      </div>

      {status !== "confirmed" && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-800/60">
          {error && (
            <p className="text-xs text-red-400 mb-2 text-center">{error}</p>
          )}

          {role === "payer" && status === "pending" && (
            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Updating..." : "Mark as Paid"}
            </button>
          )}

          {role === "payer" && status === "claimed" && (
            <p className="text-center text-xs text-yellow-500/80">
              Sent — awaiting confirmation from {otherName}
            </p>
          )}

          {role === "receiver" && status === "claimed" && (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Confirming..." : "Confirm Received"}
            </button>
          )}

          {role === "receiver" && status === "pending" && (
            <p className="text-center text-xs text-gray-600">
              Waiting for {otherName} to mark as paid
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Payment["status"] }) {
  if (status === "confirmed")
    return (
      <span className="text-xs text-green-400 font-medium bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
        Confirmed ✓
      </span>
    );
  if (status === "claimed")
    return (
      <span className="text-xs text-yellow-400 font-medium bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
        Sent
      </span>
    );
  return (
    <span className="text-xs text-gray-500 font-medium bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
      Pending
    </span>
  );
}
