import type { APIRoute } from "astro";
import { createSessionToken, serializeSessionCookie } from "../../../lib/session";

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let password = "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { password?: string };
      password = body.password ?? "";
    } else {
      const form = await request.formData();
      password = String(form.get("password") ?? "");
    }

    const expected = import.meta.env.DASHBOARD_ADMIN_PASSWORD;
    if (!expected || password !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const secret = import.meta.env.ADMIN_SESSION_SECRET;
    if (!secret || secret.length < 32) {
      return new Response(
        JSON.stringify({ ok: false, error: "Server misconfiguration: set ADMIN_SESSION_SECRET (min 32 characters)." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const token = await createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": serializeSessionCookie(token),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
