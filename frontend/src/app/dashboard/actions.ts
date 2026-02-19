"use server";

import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateInviteCode } from "@/utils";

export async function createSession(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

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

    const code = (formData.get("code") as string).toUpperCase().trim();

    const { data: session, error } = await supabase
        .from("sessions")
        .select("id, state")
        .eq("invite_code", code)
        .single();

    if (error || !session) throw new Error("Session not found");
    if (session.state !== "lobby") throw new Error("Session already started");

    const { data: existing } = await supabase
        .from("session_members")
        .select("user_id")
        .eq("session_id", session.id)
        .eq("user_id", user.id)
        .single();

    if (!existing) {
        await supabase.from("session_members").insert({
            session_id: session.id,
            user_id: user.id,
            role: "player",
        });
    }

    redirect(`/sessions/${session.id}`);
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
