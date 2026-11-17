import { Client } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

const allowedOrigins = new Set([
  "https://fd.focom-iliad.fr",
  "https://fd.linux92fr.workers.dev",
]);
const AUTH_BASE_URL = "https://ep-sweet-resonance-b9ov2yaa.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth";
const AUTH_JWKS = createRemoteJWKSet(new URL(AUTH_BASE_URL + "/.well-known/jwks.json"));
const AUTH_ISSUER = new URL(AUTH_BASE_URL).origin;
const ADMIN_EMAIL = "free-distri@focom-iliad.fr";

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
  if (!env.HYPERDRIVE?.connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 8192) return null;
  try {
    const { payload } = await jwtVerify(token, AUTH_JWKS, { issuer: AUTH_ISSUER });
    if (typeof payload.sub !== "string") return null;
    return await withDatabase(env, async (db) => {
      const result = await db.query(
        'SELECT id, email, role FROM neon_auth."user" WHERE id = $1 AND email = $2 AND "emailVerified" = TRUE',
        [payload.sub, ADMIN_EMAIL]
      );
      return result.rows[0]?.role === "admin" ? result.rows[0] : null;
    });
  } catch (error) {
    console.warn("Admin authentication rejected:", error.message);
    return null;
  }
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}

async function handleAdmin(request, env, url, origin) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "UNAUTHORIZED" }, 401, origin);

  if (url.pathname === "/api/admin/articles" && request.method === "GET") {
    const result = await withDatabase(env, (db) => db.query(
      "SELECT id, title, slug, excerpt, content, cover_image_url, category, status, published_at, created_at, updated_at FROM articles ORDER BY updated_at DESC LIMIT 100"
    ));
    return json({ articles: result.rows }, 200, origin);
  }

  if (url.pathname === "/api/admin/articles" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const excerpt = String(body.excerpt || "").trim();
    const category = String(body.category || "Actualités").trim();
    const status = body.status === "published" ? "published" : "draft";
    const cover = String(body.cover_image_url || "").trim();
    const id = body.id ? Number(body.id) : null;
    if (!title || title.length > 180 || content.length > 100000 || excerpt.length > 320 || category.length > 80 || cover.length > 2000) {
      return json({ error: "INVALID_FIELDS" }, 400, origin);
    }
    if (cover && !/^https:\/\//i.test(cover)) return json({ error: "INVALID_IMAGE_URL" }, 400, origin);
    const baseSlug = slugify(body.slug || title);
    if (!baseSlug) return json({ error: "INVALID_SLUG" }, 400, origin);

    const result = await withDatabase(env, async (db) => {
      const slug = id
        ? baseSlug
        : (await db.query("SELECT CASE WHEN EXISTS (SELECT 1 FROM articles WHERE slug = $1) THEN $1 || '-' || floor(extract(epoch from now()))::text ELSE $1 END AS slug", [baseSlug])).rows[0].slug;
      if (id) {
        const updated = await db.query(
          `UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, cover_image_url=$5, category=$6,
             status=$7, published_at=CASE WHEN $7='published' THEN COALESCE(published_at, NOW()) ELSE NULL END,
             updated_at=NOW() WHERE id=$8
           RETURNING id, title, slug, status, published_at`,
          [title, slug, excerpt || null, content, cover || null, category, status, id]
        );
        return updated.rows[0] || null;
      }
      const inserted = await db.query(
        `INSERT INTO articles (title, slug, excerpt, content, cover_image_url, category, status, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='published' THEN NOW() ELSE NULL END)
         RETURNING id, title, slug, status, published_at`,
        [title, slug, excerpt || null, content, cover || null, category, status]
      );
      return inserted.rows[0];
    });
    if (!result) return json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
    return json({ article: result }, 200, origin);
  }

  const deleteMatch = url.pathname.match(/^\/api\/admin\/articles\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const result = await withDatabase(env, (db) => db.query(
      "UPDATE articles SET status='archived', published_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING id",
      [Number(deleteMatch[1])]
    ));
    return result.rowCount ? json({ ok: true }, 200, origin) : json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
  }
  return json({ error: "NOT_FOUND" }, 404, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (url.pathname.startsWith("/api/") && origin && !allowedOrigins.has(origin)) {
      return new Response(null, { status: 403 });
    }

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
        return json({ ok: false, database: false, reason: configured ? "DATABASE_UNAVAILABLE" : "DATABASE_NOT_CONFIGURED" }, 503, origin);
      }
    }

    if (url.pathname === "/api/articles" && request.method === "GET") {
      try {
        const result = await withDatabase(env, (db) => db.query(
          `SELECT id, title, slug, excerpt, cover_image_url, category, published_at
           FROM articles WHERE status = 'published' AND published_at <= NOW()
           ORDER BY published_at DESC LIMIT 50`
        ));
        return json({ articles: result.rows }, 200, origin);
      } catch (error) {
        console.error("Articles request failed:", error.message);
        return json({ error: "ARTICLES_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname.startsWith("/api/admin/")) {
      try { return await handleAdmin(request, env, url, origin); }
      catch (error) {
        console.error("Admin API failed:", error.message);
        return json({ error: "ADMIN_API_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404, origin);
    return env.ASSETS.fetch(request);
  },
};
