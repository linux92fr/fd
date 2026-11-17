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
const SURVEY_ACCESS_ISSUER = "https://linux92fr.cloudflareaccess.com";
const SURVEY_ACCESS_AUDIENCE = "e58983dc65cd10dd66fdb66e69e85c1e099f2427f9de1e8fb03b84b961bb22ed";
const SURVEY_ACCESS_JWKS = createRemoteJWKSet(new URL(SURVEY_ACCESS_ISSUER + "/cdn-cgi/access/certs"));
const SURVEY_ADMIN_EMAIL = "free-distri@focom-iliad.fr";

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

async function requireSurveyAdmin(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  try {
    const { payload } = await jwtVerify(assertion, SURVEY_ACCESS_JWKS, {
      issuer: SURVEY_ACCESS_ISSUER, audience: SURVEY_ACCESS_AUDIENCE,
    });
    return typeof payload.email === "string" && payload.email.toLowerCase() === SURVEY_ADMIN_EMAIL;
  } catch (error) {
    console.warn("Survey Access JWT rejected:", error?.code || error?.name || "unknown");
    return false;
  }
}


async function handleContact(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return json({ error: "INVALID_ORIGIN" }, 403, origin);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415, origin);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Votre message a bien été envoyé." }, 200, origin);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (name.length > 120 || !validEmail || email.length > 254 ||
      !subject || subject.length > 160 || message.length < 10 || message.length > 5000) {
    return json({ error: "INVALID_FIELDS", message: "Vérifiez votre adresse e-mail, l'objet et le contenu du message (10 à 5 000 caractères)." }, 400, origin);
  }

  const safeName = name.replace(/[\r\n<>]/g, " ").trim();
  const safeSubject = subject.replace(/[\r\n]/g, " ").trim();
  const textContent = [
    "Nouveau message depuis le formulaire de contact FO Free Distributions",
    "",
    "Nom : " + (safeName || "Non renseigné"),
    "Adresse de réponse : " + email,
    "Objet : " + safeSubject,
    "",
    message,
  ].join("\n");

  try {
    await withDatabase(env, db => db.query(
      "INSERT INTO public.contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)",
      [safeName || null, email, safeSubject, message]
    ));
  } catch (error) {
    console.error("Contact message storage failed:", error?.code || error?.name || "unknown");
    return json({ error: "MESSAGE_STORAGE_FAILED", message: "Votre message n'a pas pu être enregistré. Merci de réessayer ultérieurement." }, 503, origin);
  }

  if (!env.BREVO_API_KEY) {
    console.warn("Contact notification not sent: BREVO_API_KEY is missing.");
    return json({ ok: true, message: "Votre message a bien été reçu et enregistré. L'équipe FO pourra le consulter dans l'espace d'administration." }, 200, origin);
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "FO Free Distributions", email: "contact@focom-iliad.fr" },
        to: [{ email: "free-distri@focom-iliad.fr", name: "FO Free Distributions" }],
        replyTo: { email, ...(safeName ? { name: safeName } : {}) },
        subject: "[Contact site FD] " + safeSubject,
        textContent,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Brevo contact delivery failed:", response.status, detail.slice(0, 500));
      return json({ ok: true, message: "Votre message a bien été reçu et enregistré. La notification par e-mail n'a pas abouti, mais l'équipe FO pourra consulter votre message dans l'espace d'administration." }, 200, origin);
    }
    return json({ ok: true, message: "Merci, votre message a bien été envoyé à l'équipe FO." }, 200, origin);
  } catch (error) {
    console.error("Contact email request failed:", error?.name || "unknown");
    return json({ ok: true, message: "Votre message a bien été reçu et enregistré. La notification par e-mail n'a pas abouti, mais l'équipe FO pourra consulter votre message dans l'espace d'administration." }, 200, origin);
  }
}

async function handleSurvey(request, env) {
  if (!env.SURVEYS_DB) return json({ error: "SURVEY_STORAGE_UNAVAILABLE" }, 503);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415);
  }
  const origin = request.headers.get("Origin");
  if (!allowedOrigins.has(origin)) {
    return json({ error: "INVALID_ORIGIN" }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  // Honeypot: silently accept bots without storing their content.
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Merci pour votre participation." });
  }

  const conditions = Number(body.conditions);
  const recognition = Number(body.recognition);
  const allowedPriorities = new Set([
    "salary", "commissions", "staffing", "schedules", "workload",
    "training", "career", "management", "health", "recognition", "other"
  ]);
  const priorities = Array.isArray(body.priorities)
    ? [...new Set(body.priorities.filter(value => typeof value === "string" && allowedPriorities.has(value)))]
    : [];
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  if (!Number.isInteger(conditions) || conditions < 1 || conditions > 5 ||
      !Number.isInteger(recognition) || recognition < 1 || recognition > 5 ||
      priorities.length < 1 || priorities.length > allowedPriorities.size ||
      comment.length > 1500) {
    return json({ error: "INVALID_ANSWERS", message: "Vérifiez les réponses obligatoires et la longueur du commentaire." }, 400);
  }

  const id = crypto.randomUUID();
  const answers = JSON.stringify({ conditions, recognition, priorities, comment });
  try {
    await env.SURVEYS_DB.prepare(
      "INSERT INTO survey_responses (id, answers_json) VALUES (?, ?)"
    ).bind(id, answers).run();
    return json({ ok: true, message: "Merci pour votre participation. Votre réponse anonyme a bien été enregistrée." });
  } catch (error) {
    console.error("Survey submission failed:", error?.message || "unknown");
    return json({ error: "SURVEY_SAVE_FAILED", message: "L'enregistrement a échoué. Merci de réessayer." }, 503);
  }
}


async function surveyResults(request, env) {
  if (!await requireSurveyAdmin(request)) return json({ error: "ACCESS_DENIED" }, 403);
  try {
    const result = await env.SURVEYS_DB.prepare("SELECT created_at, answers_json FROM survey_responses ORDER BY created_at DESC").all();
    const responses = (result.results || []).map(row => {
      let answers = {};
      try { answers = JSON.parse(row.answers_json); } catch {}
      return { created_at: row.created_at, answers };
    });
    return json({ responses });
  } catch (error) {
    console.error("Survey results read failed:", error?.message || "unknown");
    return json({ error: "SURVEY_RESULTS_UNAVAILABLE" }, 503);
  }
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Résultats questionnaire · FO Free Distributions</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#22232a;font:15px system-ui,sans-serif}
header{background:#25262b;color:white;padding:22px max(5vw,20px);display:flex;justify-content:space-between;align-items:center;gap:20px}
header strong{color:#ff526b}header a{color:white;text-decoration:none}
main{max-width:1120px;margin:36px auto;padding:0 20px 70px}
h1{font-size:clamp(28px,4vw,40px);margin:8px 0}h2{font-size:20px;margin:0 0 18px}
.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#c8102e;font-weight:800}
.actions{display:flex;gap:10px;flex-wrap:wrap}.btn{border:0;border-radius:6px;padding:12px 16px;background:#c8102e;color:white;font-weight:700;cursor:pointer}.btn.alt{background:white;color:#24252b;border:1px solid #ddd}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:26px 0}
.card,.panel{background:white;border:1px solid #e5e6e9;border-radius:11px;padding:22px;box-shadow:0 4px 16px #20203008}
.metric{font-size:36px;font-weight:800;margin-top:8px}.muted{color:#70737d;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.barrow{display:grid;grid-template-columns:minmax(130px,1fr) 2fr 35px;gap:10px;align-items:center;margin:13px 0;font-size:13px}
.track{height:12px;background:#f0f0f2;border-radius:20px;overflow:hidden}.fill{height:100%;background:#c8102e;border-radius:20px}
.comments{display:grid;gap:10px}.comment{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px;white-space:pre-wrap;line-height:1.6}
.status{padding:15px;background:#fff4f5;border-radius:8px;color:#8d1729;margin:18px 0}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:10px;border-bottom:1px solid #eee}
@media(max-width:720px){.cards,.grid{grid-template-columns:1fr}.barrow{grid-template-columns:120px 1fr 28px}header{align-items:flex-start;flex-direction:column}}
@media print{body{background:white}header{background:white;color:#222;border-bottom:1px solid #ccc;padding:12px 0}header a,.actions{display:none!important}main{max-width:none;margin:15px 0;padding:0}.card,.panel{box-shadow:none;break-inside:avoid}.cards{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr 1fr}}
</style></head><body>
<header><div><strong>FO</strong> FOCOM · Free Distributions — Administration</div><a href="/">← Retour au site</a></header>
<main><span class="eyebrow">Consultation des salariés · production</span><h1>Résultats du questionnaire</h1>
<p class="muted">Données anonymes recueillies sur l'environnement de production. Accès réservé à l'administrateur.</p>
<div class="actions"><button class="btn" id="csv">Exporter en CSV</button><button class="btn alt" id="pdf">Imprimer / Enregistrer en PDF</button><button class="btn alt" id="refresh">Actualiser</button></div>
<div id="status" class="status">Chargement des résultats…</div>
<div id="results" hidden>
<div class="cards"><section class="card"><span class="muted">Réponses reçues</span><div class="metric" id="count">0</div></section><section class="card"><span class="muted">Note moyenne — conditions de travail</span><div class="metric" id="conditions-average">—</div></section><section class="card"><span class="muted">Note moyenne — reconnaissance</span><div class="metric" id="recognition-average">—</div></section></div>
<div class="grid"><section class="panel"><h2>Conditions de travail</h2><div id="conditions-chart"></div></section><section class="panel"><h2>Reconnaissance au travail</h2><div id="recognition-chart"></div></section></div>
<section class="panel" style="margin-top:16px"><h2>Priorités des salariés</h2><div id="priorities-chart"></div></section>
<section class="panel" style="margin-top:16px"><h2>Commentaires libres</h2><div id="comments" class="comments"></div></section>
<p class="muted" id="updated"></p></div></main>
<script>
const labels={salary:"Salaires et pouvoir d'achat",commissions:"Primes et commissions",staffing:"Effectifs et moyens en boutique",schedules:"Horaires et équilibre des temps de vie",workload:"Charge et organisation du travail",training:"Formation",career:"Évolution professionnelle",management:"Management et communication",health:"Santé, sécurité et conditions de travail",recognition:"Reconnaissance du travail",other:"Autre sujet"};
let rows=[];
const $=s=>document.querySelector(s);
function chart(target,counts,total){$(target).innerHTML=Object.entries(counts).map(([key,n])=>'<div class="barrow"><span>'+key+'</span><div class="track"><div class="fill" style="width:'+(total?n/total*100:0)+'%"></div></div><b>'+n+'</b></div>').join('')}
async function load(){
 $('#status').hidden=false;$('#status').textContent='Chargement des résultats…';$('#results').hidden=true;
 try{
  const response=await fetch('/api/admin/survey-results',{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Accès refusé. Vérifiez votre connexion Cloudflare Access.':'Lecture des résultats impossible.');
  const data=await response.json();rows=data.responses||[];
  $('#count').textContent=rows.length;
  const c={},r={},p={};let cs=0,rs=0;
  for(let i=1;i<=5;i++){c[i]=0;r[i]=0}
  rows.forEach(row=>{const a=row.answers;c[a.conditions]=(c[a.conditions]||0)+1;r[a.recognition]=(r[a.recognition]||0)+1;(a.priorities||[]).forEach(k=>p[labels[k]||k]=(p[labels[k]||k]||0)+1);cs+=a.conditions;rs+=a.recognition});
  $('#conditions-average').textContent=rows.length?(cs/rows.length).toFixed(1).replace('.',',')+'/5':'—';
  $('#recognition-average').textContent=rows.length?(rs/rows.length).toFixed(1).replace('.',',')+'/5':'—';
  chart('#conditions-chart',c,rows.length);chart('#recognition-chart',r,rows.length);
  chart('#priorities-chart',Object.fromEntries(Object.entries(p).sort((a,b)=>b[1]-a[1])),rows.length);
  $('#comments').innerHTML=rows.filter(x=>x.answers.comment).map(x=>'<div class="comment"></div>').join('');
  const comments=[...$('#comments').children];rows.filter(x=>x.answers.comment).forEach((x,i)=>comments[i].textContent=x.answers.comment);
  if(!comments.length)$('#comments').innerHTML='<p class="muted">Aucun commentaire libre pour le moment.</p>';
  $('#updated').textContent='Dernière actualisation : '+new Date().toLocaleString('fr-FR');
  $('#status').hidden=true;$('#results').hidden=false;
 }catch(e){$('#status').textContent=e.message;$('#results').hidden=true}
}
function csv(){
 const headers=['Date de réception','Conditions de travail','Reconnaissance','Priorités','Commentaire'];
 const rowsOut=rows.map(x=>[x.created_at,x.answers.conditions,x.answers.recognition,(x.answers.priorities||[]).map(k=>labels[k]||k).join(' | '),x.answers.comment||'']);
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const text=[headers,...rowsOut].map(row=>row.map(quote).join(';')).join('\\r\\n');
 const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fd-questionnaire-reponses-anonymes.csv';a.click();URL.revokeObjectURL(url);
}
$('#csv').onclick=csv;$('#pdf').onclick=()=>window.print();$('#refresh').onclick=load;load();
</script></body></html>`;
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 8192) return { denied: "TOKEN_MISSING" };

  let payload;
  try {
    ({ payload } = await jwtVerify(token, AUTH_JWKS, { issuer: AUTH_ISSUER }));
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.warn("Admin JWT verification failed:", code);
    return { denied: "JWT_VERIFICATION_FAILED_" + code };
  }
  if (typeof payload.sub !== "string") return { denied: "TOKEN_SUBJECT_MISSING" };

  try {
    return await withDatabase(env, async (db) => {
      const result = await db.query(
        'SELECT id, email, role FROM neon_auth."user" WHERE id = $1 AND email = $2 AND "emailVerified" = TRUE',
        [payload.sub, ADMIN_EMAIL]
      );
      if (!result.rows[0]) return { denied: "USER_NOT_FOUND_OR_EMAIL_UNVERIFIED" };
      if (result.rows[0].role !== "admin") return { denied: "USER_ROLE_NOT_ADMIN" };
      return { admin: result.rows[0] };
    });
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.error("Admin database check failed:", code);
    return { denied: "DATABASE_CHECK_FAILED_" + code };
  }
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}

async function handleAdmin(request, env, url, origin) {
  const access = await requireAdmin(request, env);
  if (access.denied) return json({ error: access.denied }, 401, origin);
  const admin = access.admin;

  if (url.pathname === "/api/admin/media" && request.method === "GET") {
    if (!env.MEDIA) return json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, 503, origin);
    const listed = await env.MEDIA.list({ prefix: "uploads/", limit: 200 });
    const media = listed.objects.map(object => ({
      key: object.key, size: object.size, uploaded: object.uploaded,
      url: "/media/" + object.key.split("/").map(encodeURIComponent).join("/")
    }));
    return json({ media, truncated: listed.truncated }, 200, origin);
  }

  if (url.pathname === "/api/admin/media" && request.method === "POST") {
    if (!env.MEDIA) return json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, 503, origin);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 9 * 1024 * 1024) return json({ error: "FILE_TOO_LARGE" }, 413, origin);
    let form;
    try { form = await request.formData(); } catch { return json({ error: "INVALID_UPLOAD" }, 400, origin); }
    const file = form.get("file");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!(file instanceof File) || !allowed.has(file.type)) return json({ error: "INVALID_IMAGE_TYPE" }, 415, origin);
    if (file.size < 1 || file.size > 8 * 1024 * 1024) return json({ error: "FILE_TOO_LARGE" }, 413, origin);
    const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[file.type];
    const key = "uploads/" + new Date().toISOString().slice(0,10) + "/" + crypto.randomUUID() + "." + ext;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { originalName: String(file.name || "image").slice(0,200) } });
    return json({ ok: true, key, url: "/media/" + key.split("/").map(encodeURIComponent).join("/") }, 201, origin);
  }

  const mediaDeleteMatch = url.pathname.match(/^\/api\/admin\/media\/(.+)$/);
  if (mediaDeleteMatch && request.method === "DELETE") {
    const key = decodeURIComponent(mediaDeleteMatch[1]);
    if (!key.startsWith("uploads/") || key.includes("..")) return json({ error: "INVALID_MEDIA_KEY" }, 400, origin);
    await env.MEDIA.delete(key);
    return json({ ok: true }, 200, origin);
  }

  if (url.pathname === "/api/admin/secure-survey-results" && request.method === "GET") {
    if (!env.SURVEYS_DB) return json({ error: "SURVEY_STORAGE_UNAVAILABLE" }, 503, origin);
    const result = await env.SURVEYS_DB.prepare("SELECT created_at, answers_json FROM survey_responses ORDER BY created_at DESC").all();
    const responses = (result.results || []).map(row => {
      let answers = {};
      try { answers = JSON.parse(row.answers_json); } catch {}
      return { created_at: row.created_at, answers };
    });
    return json({ responses }, 200, origin);
  }

  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM public.articles) AS articles_total,
        (SELECT COUNT(*)::int FROM public.articles WHERE status='published') AS articles_published,
        (SELECT COUNT(*)::int FROM public.articles WHERE status='draft') AS articles_draft,
        (SELECT COUNT(*)::int FROM public.contact_messages) AS messages_total,
        (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='new') AS messages_new,
        (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='in_progress') AS messages_in_progress,
        (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='resolved') AS messages_resolved`
    ));
    return json({ overview: result.rows[0] }, 200, origin);
  }

  if (url.pathname === "/api/admin/messages" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query(
      "SELECT id, name, email, subject, message, status, received_at, updated_at, processed_at FROM public.contact_messages ORDER BY received_at DESC LIMIT 100"
    ));
    return json({ messages: result.rows }, 200, origin);
  }

  const messageMatch = url.pathname.match(/^\/api\/admin\/messages\/(\d+)$/);
  if (messageMatch && request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const status = String(body.status || "");
    if (!["new", "in_progress", "resolved", "archived"].includes(status)) {
      return json({ error: "INVALID_STATUS" }, 400, origin);
    }
    const result = await withDatabase(env, db => db.query(
      "UPDATE public.contact_messages SET status=$1, updated_at=NOW(), processed_at=CASE WHEN $1 IN ('resolved','archived') THEN COALESCE(processed_at, NOW()) ELSE NULL END WHERE id=$2 RETURNING id, status, updated_at, processed_at",
      [status, Number(messageMatch[1])]
    ));
    return result.rowCount ? json({ message: result.rows[0] }, 200, origin) : json({ error: "MESSAGE_NOT_FOUND" }, 404, origin);
  }

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
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      if (!env.MEDIA) return new Response("Not found", { status: 404 });
      let key;
      try { key = url.pathname.slice("/media/".length).split("/").map(decodeURIComponent).join("/"); }
      catch { return new Response("Bad request", { status: 400 }); }
      if (!key.startsWith("uploads/") || key.includes("..")) return new Response("Not found", { status: 404 });
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
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

    if (url.pathname === "/api/contact" && request.method === "POST") return handleContact(request, env);

    if (url.pathname === "/api/survey" && request.method === "POST") return handleSurvey(request, env);

    if (url.pathname === "/api/admin/survey-results" && request.method === "GET") return surveyResults(request, env);

    if (url.pathname === "/admin/questionnaire" && request.method === "GET") {
      if (!await requireSurveyAdmin(request)) return new Response("Accès réservé à l’administrateur.", { status: 403 });
      return new Response(dashboardHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      try { return await handleAdmin(request, env, url, origin); }
      catch (error) {
        console.error("Admin API failed:", error.message);
        return json({ error: "ADMIN_API_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404, origin);
    // Explicitly serve the SPA entry point for the admin route.
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), { method: "GET", headers: request.headers }));
    }
    return env.ASSETS.fetch(request);
  },
};
