"use server";

import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateInviteCode } from "@/utils";

export async function createSession(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    // Ensure profile exists (first-time Google sign-in may not have one yet)
    await supabase.from("profiles").upsert({
        id: user.id,
        display_name: user.user_metadata?.full_name ?? user.email ?? "Player",
    }, { onConflict: "id" });

    const title = formData.get("title") as string || "Poker Night";
    const buyInDefault = parseFloat(formData.get("buyInDefault") as string) || null;

    const invite_code = generateInviteCode();

    const { data: session, error } = await supabase
        .from("sessions")
        .insert({
            host_user_id: user.id,
            title,
            buy_in_default: buyInDefault,
            invite_code,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    await supabase.from("session_members").insert({
        session_id: session.id,
        user_id: user.id,
        role: "host",
    });

    redirect(`/sessions/${session.id}`);
}

export async function joinSession(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    // Ensure profile exists before joining
    await supabase.from("profiles").upsert({
        id: user.id,
        display_name: user.user_metadata?.full_name ?? user.email ?? "Player",
    }, { onConflict: "id" });

    const code = (formData.get("code") as string).toUpperCase().trim();

    // Use SECURITY DEFINER RPC to bypass RLS (joining user is not yet a member)
    const { data: sessionId, error } = await supabase.rpc("join_by_code", { p_code: code });

    if (error) throw new Error(error.message);

    redirect(`/sessions/${sessionId}`);
}

export async function deleteSession(sessionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { error } = await supabase.rpc("delete_session", { p_session_id: sessionId });

    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
}

export async function removeFromHistory(sessionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    await supabase
        .from("session_members")
        .delete()
        .eq("session_id", sessionId)
        .eq("user_id", user.id);

    revalidatePath("/dashboard");
}

export async function addManualEntry(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const profit = parseFloat(formData.get("profit") as string);
    const playedAt = (formData.get("playedAt") as string) || new Date().toISOString().split("T")[0];
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (isNaN(profit)) throw new Error("Invalid profit value");

    const { error } = await supabase.from("manual_game_entries").insert({
        user_id: user.id,
        profit,
        played_at: playedAt,
        notes,
    });

    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
}

export async function deleteManualEntry(id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    await supabase
        .from("manual_game_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    revalidatePath("/dashboard");
}
