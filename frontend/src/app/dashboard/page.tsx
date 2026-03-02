import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

type Membership = {
  session_id: string;
  role: string;
  sessions: {
    id: string;
    title: string;
    state: string;
    invite_code: string;
    created_at: string;
  };
};

export type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
  isManual?: boolean;
  hours?: number; // play time in hours — only set when timing data exists
};

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: memberships } = await supabase
    .from("session_members")
    .select("session_id, role, sessions(id, title, state, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const sessions = (memberships as Membership[] | null)?.map((m) => ({
    ...m.sessions,
    role: m.role,
  })) || [];

  const isAnonymous = user.is_anonymous === true;

  const completedSessions = sessions.filter(
    (s) => s.state === "payouts" || s.state === "closed"
  );

  const { data: manualEntries } = await supabase
    .from("manual_game_entries")
    .select("id, played_at, profit, notes")
    .eq("user_id", user.id);

  let statsRaw: Omit<SessionStat, "cumulative">[] = [];

  if (completedSessions.length > 0) {
    const completedIds = completedSessions.map((s) => s.id);

    const [
      { data: userBuyins },
      { data: userChipCounts },
      { data: memberTimings },
      { data: sessionTimings },
    ] = await Promise.all([
      supabase
        .from("buyins")
        .select("session_id, amount")
        .eq("user_id", user.id)
        .in("session_id", completedIds),
      supabase
        .from("chip_counts")
        .select("session_id, final_stack")
        .eq("user_id", user.id)
        .in("session_id", completedIds),
      // Timing: when this user joined each game (added in SQL 005 — may be null for old sessions)
      supabase
        .from("session_members")
        .select("session_id, game_joined_at")
        .eq("user_id", user.id)
        .in("session_id", completedIds),
      // Timing: when each game ended (added in SQL 005 — may be null for old sessions)
      supabase
        .from("sessions")
        .select("id, game_ended_at")
        .in("id", completedIds),
    ]);

    const joinedAtMap: Record<string, string> = Object.fromEntries(
      (memberTimings ?? [])
        .filter((m) => m.game_joined_at)
        .map((m) => [m.session_id, m.game_joined_at])
    );
    const endedAtMap: Record<string, string> = Object.fromEntries(
      (sessionTimings ?? [])
        .filter((s) => s.game_ended_at)
        .map((s) => [s.id, s.game_ended_at])
    );

    statsRaw = completedSessions
      .map((s) => {
        const chipCount = (userChipCounts ?? []).find((c) => c.session_id === s.id);
        if (!chipCount) return null;

        const totalIn = (userBuyins ?? [])
          .filter((b) => b.session_id === s.id)
          .reduce((sum, b) => sum + b.amount, 0);

        const profit = Math.round((Number(chipCount.final_stack) - totalIn) * 100) / 100;

        // Compute hours only when both timestamps exist (requires SQL 005)
        const joinedAt = joinedAtMap[s.id];
        const endedAt = endedAtMap[s.id];
        const hours =
          joinedAt && endedAt
            ? Math.max(0, (new Date(endedAt).getTime() - new Date(joinedAt).getTime()) / 3_600_000)
            : undefined;

        return { id: s.id, title: s.title, date: s.created_at, profit, hours };
      })
      .filter(Boolean) as Omit<SessionStat, "cumulative">[];
  }

  const manualStatsRaw: Omit<SessionStat, "cumulative">[] = (manualEntries ?? []).map(
    (e: { id: string; played_at: string; profit: number; notes: string | null }) => ({
      id: e.id,
      title: e.notes || "Manual Entry",
      date: e.played_at,
      profit: Math.round(Number(e.profit) * 100) / 100,
      isManual: true,
    })
  );

  const allStatsRaw = [...statsRaw, ...manualStatsRaw];
  allStatsRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const sessionStats: SessionStat[] = allStatsRaw.map((s) => {
    running = Math.round((running + s.profit) * 100) / 100;
    return { ...s, cumulative: running };
  });

  return (
    <DashboardClient
      fullName={user.user_metadata?.full_name ?? "Player"}
      userId={user.id}
      sessions={sessions}
      sessionStats={sessionStats}
      isAnonymous={isAnonymous}
    />
  );
}
