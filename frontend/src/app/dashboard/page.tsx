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

type GroupMembership = {
  group_id: string;
  joined_at: string;
  groups: {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
  };
};

type Group = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  member_count: number;
  is_owner: boolean;
  active_session_id: string | null;
  has_joined_active_session: boolean;
};

type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
  isManual?: boolean;
};

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Fetch profile (username) + pending friend/invite counts in parallel
  const [{ data: profile }, { count: pendingFriendCount }, { count: pendingInviteCount }] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", user.id).single(),
    supabase.from("friendships").select("*", { count: "exact", head: true }).eq("addressee_id", user.id).eq("status", "pending"),
    supabase.from("session_invites").select("*", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
  ]);

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

  // Fetch groups the user belongs to (owned or member)
  const { data: groupMemberships } = await supabase
    .from("group_members")
    .select("group_id, joined_at, groups(id, name, owner_id, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const groupIds = (groupMemberships as GroupMembership[] | null)?.map((gm) => gm.group_id) ?? [];

  let groups: Group[] = [];
  if (groupIds.length > 0) {
    const [{ data: counts }, { data: activeGroupSessions }] = await Promise.all([
      supabase
        .from("group_members")
        .select("group_id")
        .in("group_id", groupIds),
      supabase
        .from("sessions")
        .select("id, group_id, created_at")
        .in("group_id", groupIds)
        .in("state", ["lobby", "active"])
        .order("created_at", { ascending: false }),
    ]);

    const countMap: Record<string, number> = {};
    (counts ?? []).forEach((r: { group_id: string }) => {
      countMap[r.group_id] = (countMap[r.group_id] ?? 0) + 1;
    });

    const activeSessionByGroup: Record<string, string> = {};
    (activeGroupSessions ?? []).forEach((row: { id: string; group_id: string }) => {
      if (!activeSessionByGroup[row.group_id]) {
        activeSessionByGroup[row.group_id] = row.id;
      }
    });

    const activeSessionIds = Object.values(activeSessionByGroup);
    const { data: myActiveMemberships } = activeSessionIds.length > 0
      ? await supabase
        .from("session_members")
        .select("session_id")
        .in("session_id", activeSessionIds)
        .eq("user_id", user.id)
      : { data: [] };

    const joinedActiveSet = new Set(
      (myActiveMemberships ?? []).map((row: { session_id: string }) => row.session_id)
    );

    groups = (groupMemberships as GroupMembership[] | null)?.map((gm) => ({
      ...gm.groups,
      member_count: countMap[gm.group_id] ?? 0,
      is_owner: gm.groups.owner_id === user.id,
      active_session_id: activeSessionByGroup[gm.group_id] ?? null,
      has_joined_active_session: activeSessionByGroup[gm.group_id]
        ? joinedActiveSet.has(activeSessionByGroup[gm.group_id])
        : false,
    })) ?? [];
  }

  const completedSessions = sessions.filter(
    (s) => s.state === "payouts" || s.state === "closed"
  );

  // Always fetch manual entries (even with no completed sessions)
  const { data: manualEntries } = await supabase
    .from("manual_game_entries")
    .select("id, played_at, profit, notes")
    .eq("user_id", user.id);

  let statsRaw: Omit<SessionStat, "cumulative">[] = [];

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

    statsRaw = completedSessions
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

  // Find user's own active/lobby hosted session for inviting friends
  const activeHostSession = sessions.find(
    (s) => s.role === "host" && (s.state === "lobby" || s.state === "active")
  );

  return (
    <DashboardClient
      fullName={user!.user_metadata?.full_name ?? "Player"}
      userId={user!.id}
      sessions={sessions}
      sessionStats={sessionStats}
      isAnonymous={isAnonymous}
      groups={groups}
      username={profile?.username ?? null}
      pendingFriendCount={pendingFriendCount ?? 0}
      pendingInviteCount={pendingInviteCount ?? 0}
      activeHostSessionId={activeHostSession?.id ?? null}
    />
  );
}
