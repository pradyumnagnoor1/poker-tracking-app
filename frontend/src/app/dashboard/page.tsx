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

type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
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

  let sessionStats: SessionStat[] = [];

  if (completedSessions.length > 0) {
    const completedIds = completedSessions.map((s) => s.id);

    const [{ data: userBuyins }, { data: userChipCounts }] = await Promise.all([
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
    ]);

    const statsRaw = completedSessions
      .map((s) => {
        const chipCount = (userChipCounts ?? []).find((c) => c.session_id === s.id);
        if (!chipCount) return null;

        const totalIn = (userBuyins ?? [])
          .filter((b) => b.session_id === s.id)
          .reduce((sum, b) => sum + b.amount, 0);

        return {
          id: s.id,
          title: s.title,
          date: s.created_at,
          profit: Math.round((Number(chipCount.final_stack) - totalIn) * 100) / 100,
        };
      })
      .filter(Boolean) as Omit<SessionStat, "cumulative">[];

    statsRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    sessionStats = statsRaw.map((s) => {
      running = Math.round((running + s.profit) * 100) / 100;
      return { ...s, cumulative: running };
    });
  }

  return (
    <DashboardClient
      fullName={user.user_metadata?.full_name ?? "Player"}
      sessions={sessions}
      sessionStats={sessionStats}
      isAnonymous={isAnonymous}
    />
  );
}
