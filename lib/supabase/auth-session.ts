import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { studentIdToAuthEmail } from "@/lib/student-auth-server";

function createServerAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase anon environment variables");
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function signInStudentSession(studentId: string, password: string) {
  const supabase = createServerAnonClient();
  const email = studentIdToAuthEmail(studentId);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message || "ไม่สามารถสร้าง session ได้");
  }
  return data.session;
}

/** Server-only: issue a session for a student after PIN / legacy passkey verify */
export async function mintSessionForStudentId(studentId: string): Promise<Session> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const email = studentIdToAuthEmail(studentId);
  const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });

  const linkBody = (await linkRes.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
    msg?: string;
    message?: string;
  };

  if (!linkRes.ok) {
    throw new Error(linkBody.msg || linkBody.message || "สร้าง session ไม่สำเร็จ");
  }

  const tokenHash = linkBody.hashed_token ?? linkBody.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("สร้าง session ไม่สำเร็จ");
  }

  const supabase = createServerAnonClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error || !data.session) {
    throw new Error(error?.message || "สร้าง session ไม่สำเร็จ");
  }

  return data.session;
}

export async function setClientSession(tokens: { access_token: string; refresh_token: string }) {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error) {
    throw error;
  }
  return data.session;
}
