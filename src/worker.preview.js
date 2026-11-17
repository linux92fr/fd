const PREVIEW_ARTICLES = [
  {
    id: "preview-1",
    title: "Exemple — Bienvenue sur la préproduction FO Free Distributions",
    slug: "exemple-bienvenue-preproduction",
    excerpt: "Cet article fictif permet de vérifier la présentation des actualités avant leur publication sur le site public.",
    cover_image_url: null,
    category: "Démonstration",
    published_at: "2026-11-17T09:00:00.000Z",
  },
  {
    id: "preview-2",
    title: "Exemple — Informations et revendications des salariés",
    slug: "exemple-informations-revendications",
    excerpt: "Contenu de démonstration : les données affichées ici ne proviennent pas de la base de production.",
    cover_image_url: null,
    category: "Démonstration",
    published_at: "2026-11-16T09:00:00.000Z",
  },
];

const PREVIEW_BANNER = `
  <div id="fd-preview-banner" role="status">PRÉPRODUCTION — FO FREE DISTRIBUTIONS · Données fictives · Aucun changement sur le site public</div>
  <style>
    #fd-preview-banner {
      position: fixed; inset: 0 0 auto; z-index: 2147483647;
      min-height: 34px; box-sizing: border-box; padding: 8px 14px;
      background: #8b1e2d; color: #fff; text-align: center;
      font: 700 12px/18px system-ui, sans-serif; letter-spacing: .04em;
      box-shadow: 0 2px 8px rgba(0,0,0,.18);
    }
    body { padding-top: 34px !important; }
  </style>
`;

function withPreviewHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("content-length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data, status = 200) {
  return withPreviewHeaders(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  }));
}

function html(message, status = 403) {
  return withPreviewHeaders(new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Préproduction FO Free Distributions</title><body style="font:16px system-ui,sans-serif;max-width:680px;margin:70px auto;padding:24px;color:#222"><p style="background:#8b1e2d;color:white;padding:10px 14px;font-weight:700">PRÉPRODUCTION — FO FREE DISTRIBUTIONS</p><h1>Administration désactivée</h1><p>${message}</p><p><a href="/">← Retour au site de démonstration</a></p></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, preview: true, database: false, mode: "read-only-demo" });
    }

    if (url.pathname === "/api/articles" && request.method === "GET") {
      return json({ articles: PREVIEW_ARTICLES });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "PREVIEW_READ_ONLY", message: "Les API et les écritures sont désactivées en préproduction." }, 403);
    }

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return html("La connexion et les fonctions d’administration sont volontairement désactivées en préproduction. Aucun accès à Neon Auth ou à la base de production n’est effectué.");
    }

    const response = await env.ASSETS.fetch(request);
    if (response.headers.get("content-type")?.includes("text/html") && response.status === 200) {
      const source = await response.text();
      const page = source.replace(/<body([^>]*)>/i, "<body$1>" + PREVIEW_BANNER);
      return withPreviewHeaders(new Response(page, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }));
    }

    return withPreviewHeaders(response);
  },
};
