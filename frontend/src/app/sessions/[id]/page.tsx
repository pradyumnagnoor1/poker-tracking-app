import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (!session) redirect("/dashboard");

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">{session.title}</h1>
      <p className="text-gray-400 text-sm mb-1">Code: {session.invite_code}</p>
      <p className="text-gray-500 text-sm">State: {session.state}</p>
    </main>
  );
}