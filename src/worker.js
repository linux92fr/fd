import { Client } from "pg";

const allowedOrigins = new Set([
  "https://fd.focom-iliad.fr",
  "https://fd.linux92fr.workers.dev",
]);

function json(data, status = 200, origin = "") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  };
  if (allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function withDatabase(env, callback) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const result = await withDatabase(env, (db) => db.query("SELECT 1 AS connected"));
        return json({ ok: true, database: result.rows[0]?.connected === 1 }, 200, origin);
      } catch (error) {
        console.error("Health check failed:", error.message);
        const configured = error.message !== "DATABASE_NOT_CONFIGURED";
        return json({ ok: false, database: false, reason: configured ? "DATABASE_UNAVAILABLE" : "DATABASE_NOT_CONFIGURED" }, configured ? 503 : 503, origin);
      }
    }

    if (url.pathname === "/api/articles" && request.method === "GET") {
      try {
        const result = await withDatabase(env, (db) => db.query(
          `SELECT id, title, slug, excerpt, cover_image_url, category, published_at
           FROM articles
           WHERE status = 'published' AND published_at <= NOW()
           ORDER BY published_at DESC
           LIMIT 50`
        ));
        return json({ articles: result.rows }, 200, origin);
      } catch (error) {
        console.error("Articles request failed:", error.message);
        return json({ error: "ARTICLES_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "NOT_FOUND" }, 404, origin);
    }

    return env.ASSETS.fetch(request);
  },
};
