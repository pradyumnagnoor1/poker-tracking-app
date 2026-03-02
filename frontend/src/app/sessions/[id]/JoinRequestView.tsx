"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";

export default function JoinRequestView({
    sessionId,
    userId,
    initialStatus,
}: {
    sessionId: string;
    userId: string;
    initialStatus: "pending" | "denied";
}) {
    const router = useRouter();
    const [status, setStatus] = useState<"pending" | "denied" | "approved">(initialStatus);

    useEffect(() => {
        if (status !== "pending") return;

        const supabase = createClient();

        // Realtime subscription for status changes
        const channel = supabase
            .channel(`join-request-${sessionId}-${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "join_requests",
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    const updated = payload.new as { user_id: string; status: string };
                    if (updated.user_id !== userId) return;
                    if (updated.status === "approved") {
                        setStatus("approved");
                        // Reload so page.tsx re-runs with the user now as a member
                        window.location.reload();
                    } else if (updated.status === "denied") {
                        setStatus("denied");
                    }
                }
            )
            .subscribe();

        // Polling fallback every 4 seconds
        const poll = setInterval(async () => {
            const { data } = await supabase
                .from("join_requests")
                .select("status")
                .eq("session_id", sessionId)
                .eq("user_id", userId)
                .single();
            if (!data) return;
            if (data.status === "approved") {
                setStatus("approved");
                window.location.reload();
            } else if (data.status === "denied") {
                setStatus("denied");
                clearInterval(poll);
            }
        }, 4000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
        };
    }, [sessionId, userId, status]);

    if (status === "approved") {
        return (
            <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-5">
                <div className="text-center">
                    <p className="text-green-400 text-lg font-semibold">Approved! Joining game...</p>
                </div>
            </main>
        );
    }

    if (status === "denied") {
        return (
            <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-5">
                <div className="text-center max-w-sm">
                    <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold mb-2">Request Denied</h1>
                    <p className="text-gray-500 text-sm mb-8">The host declined your request to join this session.</p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </main>
        );
    }

    // Pending
    return (
        <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-5">
            <div className="text-center max-w-sm">
                <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-yellow-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
                <h1 className="text-xl font-bold mb-2">Waiting for Approval</h1>
                <p className="text-gray-500 text-sm mb-2">
                    Your request to join this game has been sent to the host.
                </p>
                <p className="text-gray-700 text-xs mb-8">This page will update automatically.</p>
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
                >
                    ← Back to Dashboard
                </button>
            </div>
        </main>
    );
}
