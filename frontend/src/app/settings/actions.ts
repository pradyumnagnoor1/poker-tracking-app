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
