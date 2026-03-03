"use server";

import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createGroup(name: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Group name is required");

    const { data: group, error } = await supabase
        .from("groups")
        .insert({ owner_id: user.id, name: trimmed })
        .select()
        .single();
    if (error) throw new Error(error.message);

    // Insert owner as first group member
    await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id });

    revalidatePath("/dashboard");
    return group.id as string;
}

export async function addGroupMember(groupId: string, userId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { error } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, user_id: userId });
    if (error) throw new Error(error.message);

    revalidatePath(`/groups/${groupId}`);
}

export async function deleteGroup(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { error } = await supabase
        .from("groups")
        .delete()
        .eq("id", groupId)
        .eq("owner_id", user.id);
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
}

export async function removeGroupMember(groupId: string, userId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", userId);
    if (error) throw new Error(error.message);

    revalidatePath(`/groups/${groupId}`);
}

export async function startGroupSession(
    groupId: string,
    title: string,
    buyInDefault: number | null,
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: sessionId, error } = await supabase.rpc("start_session_from_group", {
        p_group_id: groupId,
        p_title: title || "Poker Night",
        p_buy_in_default: buyInDefault,
    });
    if (error) throw new Error(error.message);

    return sessionId as string;
}

export async function joinActiveGroupSession(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: sessionId, error } = await supabase.rpc("join_active_group_session", {
        p_group_id: groupId,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath(`/groups/${groupId}`);
    return sessionId as string;
}

export async function createGroupFromSession(sessionId: string, name: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: groupId, error } = await supabase.rpc("create_group_from_session", {
        p_session_id: sessionId,
        p_name: name.trim(),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    return groupId as string;
}

export async function searchProfiles(query: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .ilike("display_name", `%${trimmed}%`)
        .neq("id", user.id)
        .limit(10);
    if (error) throw new Error(error.message);

    return (data ?? []) as { id: string; display_name: string | null }[];
}
