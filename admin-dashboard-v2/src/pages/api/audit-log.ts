import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";

export const DELETE: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("provisioning_audit_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};
