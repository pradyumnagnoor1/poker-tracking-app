import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import GroupDetailClient from "./GroupDetailClient";

type GroupMember = {
    user_id: string;
    joined_at: string;
    profiles: { display_name: string | null } | null;
};

export default async function GroupDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: group } = await supabase
        .from("groups")
        .select("id, name, owner_id, created_at")
        .eq("id", id)
        .single();

    // Non-members get no row back (RLS) — redirect to dashboard
    if (!group) redirect("/dashboard");

    const { data: rawMembers } = await supabase
        .from("group_members")
        .select("user_id, joined_at")
        .eq("group_id", id)
        .order("joined_at", { ascending: true });

    const memberIds = (rawMembers ?? []).map((m) => m.user_id);
    const { data: profileRows } = memberIds.length > 0
        ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
        : { data: [] };

    const profileMap = Object.fromEntries(
        (profileRows ?? []).map((p) => [p.id, p.display_name as string | null])
    );

    const members: GroupMember[] = (rawMembers ?? []).map((m) => ({
        user_id: m.user_id,
        joined_at: m.joined_at,
        profiles: { display_name: profileMap[m.user_id] ?? null },
    }));

    const { data: activeSession } = await supabase
        .from("sessions")
        .select("id")
        .eq("group_id", id)
        .in("state", ["lobby", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    let hasJoinedActiveSession = false;
    if (activeSession?.id) {
        const { data: membership } = await supabase
            .from("session_members")
            .select("user_id")
            .eq("session_id", activeSession.id)
            .eq("user_id", user.id)
            .maybeSingle();
        hasJoinedActiveSession = Boolean(membership);
    }

    return (
        <GroupDetailClient
            group={group}
            members={members}
            currentUserId={user.id}
            isOwner={group.owner_id === user.id}
            activeSessionId={activeSession?.id ?? null}
            hasJoinedActiveSession={hasJoinedActiveSession}
        />
    );
}
