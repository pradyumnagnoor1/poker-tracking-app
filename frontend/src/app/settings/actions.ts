"use server";

import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function setUsername(username: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { error } = await supabase.rpc("set_username", { p_username: username.toLowerCase().trim() });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath("/settings");
}

export async function setDisplayName(displayName: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const trimmed = displayName.trim();
    if (!trimmed) throw new Error("Display name cannot be empty.");
    if (trimmed.length > 50) throw new Error("Display name must be 50 characters or less.");

    const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath("/settings");
}
