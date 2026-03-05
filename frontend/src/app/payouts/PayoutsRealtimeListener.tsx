"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";

export default function PayoutsRealtimeListener({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("payments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `from_user_id=eq.${userId}` },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `to_user_id=eq.${userId}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
