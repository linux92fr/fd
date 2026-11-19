import { Client } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

const allowedOrigins = new Set(["https://fd-preview.linux92fr.workers.dev"]);
const AUTH_BASE_URL = "https://ep-crimson-wave-b972yi2i.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth";
const AUTH_JWKS = createRemoteJWKSet(new URL(AUTH_BASE_URL + "/.well-known/jwks.json"));
const AUTH_ISSUER = new URL(AUTH_BASE_URL).origin;
const ADMIN_EMAIL = "free-distri@focom-iliad.fr";
const HOMEPAGE_DEFAULTS = {"hero_eyebrow":"FOCOM · Free Distribution","hero_title":"La voix des salariés\ndes boutiques Free.","hero_text":"Un espace d’information, de dialogue et d’action syndicale dédié aux équipes de Free Distribution.","hero_primary_label":"Nos revendications","hero_primary_url":"#revendications","hero_secondary_label":"Nous contacter","hero_secondary_url":"/contact","intro_eyebrow":"Notre engagement","intro_title":"À vos côtés, au quotidien.","intro_text":"La vente, le conseil et l’accompagnement des clients en boutique mobilisent des compétences et un engagement essentiels. FO Free Distribution porte la parole des salariés et défend leurs intérêts professionnels.","news_eyebrow":"Restez informés","news_title":"Actualités","news_note":"Les informations dédiées à Free Distribution","claims_eyebrow":"Élections professionnelles · FO Free Distribution","claims_title":"Nos revendications","claims_lead":"Notre ambition : obtenir des avancées concrètes sur les salaires, les commissions, les conditions de travail et la reconnaissance des équipes en boutique. Voici les engagements que FO souhaite porter avec vous.","rights_eyebrow":"Mieux connaître vos droits","rights_title":"Vos droits au travail","rights_lead":"Des repères pratiques pour comprendre vos droits et savoir vers qui vous tourner. Les contenus détaillés seront publiés prochainement.","survey_eyebrow":"Votre avis compte","survey_title":"Donnez votre avis en toute confidentialité.","survey_text":"Cette consultation permet de faire remonter les attentes et les priorités des salariés de Free Distribution. Vos réponses sont enregistrées sans nom ni adresse e-mail.","hero_image":"","intro_image":"","news_image":"","claims_image":"","rights_image":"","survey_image":""};
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
    "content-security-policy": "default-src 'none'; frame-src 'self'; frame-ancestors 'none'",
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


async function handleNewsletterSubscribe(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return json({ error: "INVALID_ORIGIN" }, 403, origin);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415, origin);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Votre demande d’inscription a bien été prise en compte." }, 200, origin);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "INVALID_EMAIL", message: "Vérifiez votre adresse e-mail." }, 400, origin);
  }
  if (body.consent_confirmed !== true) {
    return json({ error: "EXPLICIT_CONSENT_REQUIRED", message: "Cochez la case pour confirmer votre inscription à la newsletter." }, 400, origin);
  }
  try {
    const result = await withDatabase(env, db => db.query(
      "INSERT INTO public.newsletter_subscribers AS existing(email,status,subscribed_at,unsubscribed_at) VALUES($1,'subscribed',NOW(),NULL) ON CONFLICT(email) DO UPDATE SET status='subscribed',subscribed_at=NOW(),unsubscribed_at=NULL WHERE existing.status='subscribed' OR $2::boolean RETURNING id,status",
      [email, body.consent_confirmed]
    ));
    if (!result.rows[0]) return json({ error: "RECONSENT_REQUIRED", message: "Cette adresse est désinscrite. Une nouvelle confirmation explicite est nécessaire." }, 409, origin);
    return json({ ok: true, message: "Votre inscription à la newsletter FO Free Distribution est bien enregistrée." }, 200, origin);
  } catch (error) {
    console.error("Newsletter subscription failed:", error?.code || error?.name || "unknown");
    return json({ error: "SUBSCRIPTION_UNAVAILABLE", message: "L’inscription n’a pas pu être enregistrée. Merci de réessayer ultérieurement." }, 503, origin);
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
    "Nouveau message depuis le formulaire de contact FO Free Distribution",
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
        sender: { name: "FO Free Distribution", email: "contact@focom-iliad.fr" },
        to: [{ email: "free-distri@focom-iliad.fr", name: "FO Free Distribution" }],
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
<meta name="robots" content="noindex,nofollow"><title>Résultats questionnaire · FO Free Distribution</title>
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
<header><div><strong>FO</strong> FOCOM · Free Distribution — Administration</div><a href="/">← Retour au site</a></header>
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

async function requireSiteAccess(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 8192) return { denied: "TOKEN_MISSING" };
  let payload;
  try {
    ({ payload } = await jwtVerify(token, AUTH_JWKS, { issuer: AUTH_ISSUER }));
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.warn("Site access JWT verification failed:", code);
    return { denied: "JWT_VERIFICATION_FAILED_" + code };
  }
  if (typeof payload.sub !== "string") return { denied: "TOKEN_SUBJECT_MISSING" };
  try {
    return await withDatabase(env, async db => {
      const result = await db.query(
        `SELECT u.id, u.email, u.name,
                CASE WHEN lower(u.email) = lower($2) THEN 'admin' ELSE COALESCE(a.role, 'employee') END AS role,
                CASE WHEN lower(u.email) = lower($2) THEN 'active' ELSE COALESCE(a.status, 'pending') END AS status
         FROM neon_auth."user" u
         LEFT JOIN public.site_user_access a ON a.user_id = u.id
         WHERE u.id = $1 AND u."emailVerified" = TRUE`,
        [payload.sub, ADMIN_EMAIL]
      );
      const user = result.rows[0];
      if (!user) return { denied: "USER_NOT_FOUND_OR_EMAIL_UNVERIFIED" };
      if (user.status !== "active") return { denied: user.status === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_PENDING_APPROVAL" };
      if (!["admin", "admin_delegate", "editor", "employee"].includes(user.role)) return { denied: "INVALID_SITE_ROLE" };
      return { user };
    });
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.error("Site access database check failed:", code);
    return { denied: "DATABASE_CHECK_FAILED_" + code };
  }
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}


function escapeEmailHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifyNeonWebhook(rawBody, headers) {
  const signature = headers.get("x-neon-signature") || "";
  const kid = headers.get("x-neon-signature-kid") || "";
  const timestamp = headers.get("x-neon-timestamp") || "";
  if (!signature || !kid || !/^\d{10,16}$/.test(timestamp)) throw new Error("MISSING_WEBHOOK_SIGNATURE");
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    throw new Error("WEBHOOK_TIMESTAMP_INVALID");
  }

  const parts = signature.split(".");
  if (parts.length !== 3 || parts[1] !== "") throw new Error("WEBHOOK_SIGNATURE_FORMAT_INVALID");
  const [headerB64, , signatureB64] = parts;
  let protectedHeader;
  try { protectedHeader = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64))); }
  catch { throw new Error("WEBHOOK_SIGNATURE_HEADER_INVALID"); }
  if (protectedHeader.alg !== "EdDSA") throw new Error("WEBHOOK_SIGNATURE_ALGORITHM_INVALID");

  const jwksResponse = await fetch(AUTH_BASE_URL + "/.well-known/jwks.json", {
    headers: { "accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!jwksResponse.ok) throw new Error("WEBHOOK_JWKS_UNAVAILABLE");
  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === kid && key.kty === "OKP" && key.crv === "Ed25519") : null;
  if (!jwk) throw new Error("WEBHOOK_SIGNING_KEY_NOT_FOUND");

  const payloadB64 = btoa(String.fromCharCode(...new TextEncoder().encode(rawBody)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const signaturePayload = timestamp + "." + payloadB64;
  const signaturePayloadB64 = btoa(String.fromCharCode(...new TextEncoder().encode(signaturePayload)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const signingInput = new TextEncoder().encode(headerB64 + "." + signaturePayloadB64);
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, base64UrlToBytes(signatureB64), signingInput);
  if (!valid) throw new Error("WEBHOOK_SIGNATURE_INVALID");
  return JSON.parse(rawBody);
}

function renderOtpEmail(payload, isInitialPasswordSetup = false) {
  const email = String(payload?.user?.email || "").trim().toLowerCase();
  const name = String(payload?.user?.name || "").trim().slice(0, 120);
  const code = String(payload?.event_data?.otp_code || "");
  const type = String(payload?.event_data?.otp_type || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return null;

  const greeting = name ? "Bonjour " + escapeEmailHtml(name) + "," : "Bonjour,";
  let subject, title, explanation, extra = "";
  if (type === "email-verification") {
    subject = "Vérifiez votre adresse e-mail – FO Free Distribution";
    title = "Confirmez votre adresse e-mail";
    explanation = "Voici votre code pour vérifier votre adresse e-mail sur l’espace FO Free Distribution.";
    extra = "<p><strong>Important :</strong> la vérification de votre adresse e-mail ne vaut pas approbation de votre compte. Votre accès restera en attente jusqu’à validation par un administrateur FO.</p>";
  } else if (type === "forget-password" && isInitialPasswordSetup) {
    subject = "Définissez votre mot de passe – FO Free Distribution";
    title = "Définir votre mot de passe";
    explanation = "Utilisez ce code pour choisir votre mot de passe et terminer la première étape de votre inscription à l’espace FO Free Distribution.";
    extra = "<p>Votre compte restera en attente jusqu’à son approbation par un administrateur FO. La définition de votre mot de passe ne donne pas encore accès à l’espace d’administration.</p>";
  } else if (type === "forget-password") {
    subject = "Votre code de réinitialisation – FO Free Distribution";
    title = "Réinitialiser votre mot de passe";
    explanation = "Utilisez ce code pour poursuivre la réinitialisation de votre mot de passe.";
  } else if (type === "sign-in") {
    subject = "Votre code de connexion – FO Free Distribution";
    title = "Confirmez votre connexion";
    explanation = "Utilisez ce code pour confirmer votre connexion à l’espace FO Free Distribution.";
  } else {
    return null;
  }

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#25262b;line-height:1.6"><div style="background:#c8102e;color:#fff;padding:22px 28px;font-size:20px;font-weight:bold">FO Free Distribution</div><div style="padding:28px"><p>' + greeting + '</p><h1 style="font-size:24px">' + title + '</h1><p>' + explanation + '</p><p style="margin:24px 0;padding:18px;background:#f4f4f5;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px">' + code + '</p>' + extra + '<p>Ce code est à usage unique. Ne le communiquez à personne.</p><p style="color:#666;font-size:13px">FO Free Distribution · <a href="https://fd.focom-iliad.fr">fd.focom-iliad.fr</a></p></div></div>';
  const text = greeting.replace(/<[^>]+>/g, "") + "\n\n" + title + "\n\n" + explanation + "\n\nCode : " + code + (type === "email-verification" ? "\n\\nImportant : la vérification de votre adresse e-mail ne vaut pas approbation de votre compte. Votre accès restera en attente jusqu’à validation par un administrateur FO." : "") + "\n\\nCe code est à usage unique. Ne le communiquez à personne.\nFO Free Distribution";
  return { email, subject, html, text };
}

async function handleNeonAuthWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.BREVO_API_KEY) return json({ error: "EMAIL_PROVIDER_NOT_CONFIGURED" }, 503);
  const rawBody = await request.text();
  if (rawBody.length > 32768) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  let payload;
  try { payload = await verifyNeonWebhook(rawBody, request.headers); }
  catch (error) {
    console.warn("Neon Auth webhook rejected:", error?.message || "verification failed");
    return json({ error: "INVALID_WEBHOOK_SIGNATURE" }, 401);
  }

  if (payload?.event_type !== "send.otp") return json({ success: true, ignored: true }, 200);
  const eventId = typeof payload.event_id === "string" ? payload.event_id.trim() : "";
  if (!eventId || eventId.length > 200) return json({ error: "INVALID_EVENT_ID" }, 400);
  let isInitialPasswordSetup = false;
  try {
    const accountState = await withDatabase(env, db => db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM neon_auth."user" u
         JOIN public.site_user_access a ON a.user_id = u.id
         WHERE lower(u.email) = lower($1)
           AND a.status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM neon_auth.account ac
             WHERE ac."userId" = u.id
               AND ac."providerId" = 'credential'
               AND NULLIF(ac.password, '') IS NOT NULL
           )
       ) AS initial_setup`,
      [String(payload?.user?.email || "").trim().toLowerCase()]
    ));
    isInitialPasswordSetup = accountState.rows[0]?.initial_setup === true;
  } catch (error) {
    console.error("Neon OTP account-state lookup failed:", error?.code || error?.name || "unknown");
    return json({ error: "OTP_ACCOUNT_STATE_UNAVAILABLE" }, 503);
  }
  const email = renderOtpEmail(payload, isInitialPasswordSetup);
  if (!email) return json({ error: "INVALID_OTP_EVENT" }, 400);

  let claimed = false;
  try {
    const claim = await withDatabase(env, db => db.query(
      "INSERT INTO public.neon_auth_webhook_events (event_id,event_type,status) VALUES ($1,'send.otp','processing') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [eventId]
    ));
    claimed = claim.rows.length === 1;
    if (!claimed) {
      const existing = await withDatabase(env, db => db.query(
        "SELECT status FROM public.neon_auth_webhook_events WHERE event_id=$1",
        [eventId]
      ));
      if (existing.rows[0]?.status === "sent") return json({ success: true, duplicate: true }, 200);
      return json({ error: "EVENT_ALREADY_PROCESSING" }, 503);
    }
  } catch (error) {
    console.error("Neon webhook idempotency check failed:", error?.code || error?.name || "unknown");
    return json({ error: "WEBHOOK_STORAGE_UNAVAILABLE" }, 503);
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: email.email }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Neon OTP email delivery failed:", response.status, detail.slice(0, 300));
      await withDatabase(env, db => db.query("DELETE FROM public.neon_auth_webhook_events WHERE event_id=$1 AND status='processing'", [eventId]));
      return json({ error: "EMAIL_DELIVERY_FAILED" }, 502);
    }
    await withDatabase(env, db => db.query(
      "UPDATE public.neon_auth_webhook_events SET status='sent',sent_at=now() WHERE event_id=$1 AND status='processing'",
      [eventId]
    ));
    return json({ success: true }, 200);
  } catch (error) {
    console.error("Neon OTP email request failed:", error?.name || "unknown");
    if (claimed) {
      await withDatabase(env, db => db.query("DELETE FROM public.neon_auth_webhook_events WHERE event_id=$1 AND status='processing'", [eventId])).catch(() => {});
    }
    return json({ error: "EMAIL_PROVIDER_UNAVAILABLE" }, 502);
  }
}

function renderAccountEmail(type, name) {
  const safeName = String(name || "").trim().slice(0, 120);
  const greeting = safeName ? "Bonjour " + safeName + "," : "Bonjour,";
  const common = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#25262b;line-height:1.6"><div style="background:#c8102e;color:#fff;padding:22px 28px;font-size:20px;font-weight:bold">FO Free Distribution</div><div style="padding:28px">';
  const footer = '<p style="margin-top:28px;color:#666;font-size:13px">FO Free Distribution<br><a href="https://fd.focom-iliad.fr" style="color:#c8102e">fd.focom-iliad.fr</a></p></div></div>';
  if (type === "welcome") {
    const subject = "Bienvenue sur l’espace FO Free Distribution";
    const intro = "Votre compte a bien été créé. Il reste à vérifier votre adresse e-mail si cette étape vous est demandée, puis à attendre l’activation de votre accès par l’équipe FO.";
    const html = common + '<p>' + escapeEmailHtml(greeting) + '</p><h1 style="font-size:24px">Bienvenue !</h1><p>' + intro + '</p><p>Vous recevrez un autre message lorsque votre accès sera activé. En attendant, aucune action supplémentaire n’est nécessaire.</p>' + footer;
    const text = greeting + "\n\nBienvenue sur l’espace FO Free Distribution.\n\n" + intro + "\n\nVous recevrez un autre message lorsque votre accès sera activé.";
    return { subject, html, text };
  }
  if (type === "activation") {
    const subject = "Votre accès à l’espace FO Free Distribution est activé";
    const intro = "Un administrateur vient d’activer votre compte. Vous pouvez désormais vous connecter à votre espace FO Free Distribution.";
    const html = common + '<p>' + escapeEmailHtml(greeting) + '</p><h1 style="font-size:24px">Votre compte est activé</h1><p>' + intro + '</p><p style="margin:26px 0"><a href="https://fd.focom-iliad.fr/admin" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:5px;font-weight:bold">Accéder à mon espace</a></p>' + footer;
    const text = greeting + "\n\nVotre compte est activé.\n\n" + intro + "\n\nConnexion : https://fd.focom-iliad.fr/admin";
    return { subject, html, text };
  }
  return null;
}


async function sendAccountEmailDetailed(env, recipient, name, type) {
  const email = renderAccountEmail(type, name);
  if (!email) return { sent: false, reason: "INVALID_TEMPLATE" };
  if (!env.BREVO_API_KEY) return { sent: false, reason: "BREVO_API_KEY_MISSING" };
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: recipient }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (response.ok) return { sent: true, status: response.status };
    const detail = await response.json().catch(() => ({}));
    const message = String(detail.message || detail.code || "Brevo a refusé la demande").slice(0, 180);
    console.error("Account email delivery failed:", type, response.status, message);
    return { sent: false, status: response.status, reason: message };
  } catch (error) {
    console.error("Account email request failed:", type, error?.name || "unknown");
    return { sent: false, reason: "NETWORK_ERROR" };
  }
}

async function sendAccountEmail(env, recipient, name, type) {
  const email = renderAccountEmail(type, name);
  if (!email || !env.BREVO_API_KEY) return false;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: recipient }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Account email delivery failed:", type, response.status, detail.slice(0, 240));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Account email request failed:", type, error?.name || "unknown");
    return false;
  }
}

async function handleAdmin(request, env, url, origin) {
  const access = await requireSiteAccess(request, env);
  if (access.denied) return json({ error: access.denied }, 401, origin);
  const admin = access.user;
  const isAdmin = admin.role === "admin";
  const isAdminDelegate = admin.role === "admin_delegate";
  const canAdminister = isAdmin || isAdminDelegate;
  if (url.pathname === "/api/admin/account-email-preview" && request.method === "GET") {
    if (!isAdmin) return json({ error: "SUPER_ADMIN_REQUIRED" }, 403, origin);
    const type = url.searchParams.get("type") || "";
    const name = url.searchParams.get("name") || "";
    const email = renderAccountEmail(type, name);
    if (!email) return json({ error: "INVALID_EMAIL_TEMPLATE" }, 400, origin);
    return json({ previewOnly: true, sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" }, replyTo: { email: "contact@focom-iliad.fr" }, ...email }, 200, origin);
  }
  const isEditor = admin.role === "editor";
  const editorAllowed = url.pathname === "/api/admin/articles" || url.pathname === "/api/admin/overview" || /^\/api\/admin\/articles\/\d+$/.test(url.pathname);
  if (admin.role === "employee" || (isEditor && !editorAllowed)) return json({ error: "INSUFFICIENT_PERMISSIONS" }, 403, origin);


  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role || "employee";
    if (isAdminDelegate && (role === "admin" || role === "admin_delegate")) return json({ error: "DELEGATE_CANNOT_ASSIGN_ADMIN" }, 403, origin);
    if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !["employee", "editor", "admin", "admin_delegate"].includes(role)) {
      return json({ error: "INVALID_USER_FIELDS", message: "Vérifiez le nom, l’adresse e-mail et le rôle." }, 400, origin);
    }
    if (!env.NEON_API_KEY) return json({ error: "NEON_API_KEY_MISSING", message: "La clé API Neon n’est pas configurée sur ce Worker." }, 503, origin);
    try {
      const neonResponse = await fetch("https://console.neon.tech/api/v2/projects/delicate-lake-24433548/branches/br-square-shadow-b90emym2/auth/users", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.NEON_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const neonData = await neonResponse.json().catch(() => ({}));
      if (!neonResponse.ok) {
        const neonError = String(neonData.message || neonData.error || neonData.code || "Erreur Neon sans détail");
        const duplicate = neonResponse.status === 409 || /already exists|duplicate|user already exists/i.test(neonError);
        console.error("Neon user creation rejected:", neonResponse.status, neonError.slice(0, 240));
        return json({
          error: duplicate ? "USER_ALREADY_EXISTS" : "NEON_USER_CREATE_FAILED",
          message: duplicate ? "Un compte existe déjà pour cette adresse e-mail." : "Neon a refusé la création (" + neonResponse.status + ") : " + neonError.slice(0, 180)
        }, duplicate ? 409 : 502, origin);
      }
      if (!neonData.id) return json({ error: "NEON_INVALID_RESPONSE" }, 502, origin);
      try {
        await withDatabase(env, db => db.query(
          `INSERT INTO public.site_user_access (user_id, role, status, approved_by, approved_at, updated_at)
           VALUES ($1, $2, 'pending', $3, NULL, now())
           ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = 'pending',
             approved_by = EXCLUDED.approved_by, approved_at = NULL, updated_at = now()`,
          [neonData.id, role, admin.id]
        ));
      } catch (dbError) {
        console.error("Site access record creation failed after Neon user creation:", dbError?.code || dbError?.name || "unknown");
        return json({ error: "USER_CREATED_ACCESS_PENDING", message: "Le compte d’authentification a été créé, mais son accès au site n’a pas pu être initialisé. Ne relancez pas la création ; actualisez la liste et contactez l’administrateur." }, 503, origin);
      }
      const emailSent = await sendAccountEmail(env, email, name, "welcome");
      return json({ success: true, user: { id: neonData.id, name, email, role, status: "pending" }, emailSent }, 201, origin);
    } catch (error) {
      console.error("Neon user creation request failed:", error?.name || "unknown");
      return json({ error: "NEON_API_UNAVAILABLE", message: "Le service de création de compte est momentanément indisponible." }, 503, origin);
    }
  }

  const resendWelcomeMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/send-welcome$/i);
  if (resendWelcomeMatch && request.method === "POST") {
    if (!isAdmin) return json({ error: "SUPER_ADMIN_REQUIRED" }, 403, origin);
    const result = await withDatabase(env, db => db.query(
      'SELECT u.email, u.name FROM neon_auth."user" u JOIN public.site_user_access a ON a.user_id=u.id WHERE u.id=$1 AND a.status=\'pending\'',
      [resendWelcomeMatch[1]]
    ));
    if (!result.rows.length) return json({ error: "PENDING_USER_NOT_FOUND" }, 404, origin);
    const delivery = await sendAccountEmailDetailed(env, result.rows[0].email, result.rows[0].name, "welcome");
    return json({ success: delivery.sent, emailSent: delivery.sent, diagnostic: delivery }, delivery.sent ? 200 : 502, origin);
  }

  const deleteUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
  if (deleteUserMatch && request.method === "DELETE") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    const targetId = deleteUserMatch[1];
    if (targetId === admin.id) return json({ error: "CANNOT_DELETE_SELF", message: "Vous ne pouvez pas supprimer votre propre compte." }, 403, origin);
    const target = await withDatabase(env, db => db.query(
      'SELECT id, email FROM neon_auth."user" WHERE id=$1 LIMIT 1', [targetId]
    ));
    if (!target.rows.length) return json({ error: "USER_NOT_FOUND" }, 404, origin);
    if (isAdminDelegate && String(target.rows[0].email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) return json({ error: "SUPER_ADMIN_PROTECTED" }, 403, origin);
    if (String(target.rows[0].email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return json({ error: "PROTECTED_ACCOUNT", message: "Le compte administrateur principal est protégé." }, 403, origin);
    }
    if (!env.NEON_API_KEY) return json({ error: "NEON_API_KEY_MISSING" }, 503, origin);
    const neonResponse = await fetch(
      "https://console.neon.tech/api/v2/projects/delicate-lake-24433548/branches/br-square-shadow-b90emym2/auth/users/" + encodeURIComponent(targetId),
      { method: "DELETE", headers: { "Authorization": "Bearer " + env.NEON_API_KEY, "Accept": "application/json" } }
    );
    if (!neonResponse.ok && neonResponse.status !== 404) {
      const detail = await neonResponse.text();
      console.error("Neon user deletion failed:", neonResponse.status, detail.slice(0, 180));
      return json({ error: "NEON_USER_DELETE_FAILED", message: "Neon a refusé la suppression du compte (" + neonResponse.status + ")." }, 502, origin);
    }
    try {
      await withDatabase(env, db => db.query("DELETE FROM public.site_user_access WHERE user_id=$1", [targetId]));
    } catch (error) {
      console.error("User access cleanup failed:", error?.code || error?.name || "unknown");
      return json({ success: true, accessCleanupPending: true, message: "Le compte Neon est supprimé, mais le nettoyage de son autorisation nécessite une vérification." }, 200, origin);
    }
    return json({ success: true, deletedEmail: target.rows[0].email }, 200, origin);
  }

  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const r = await withDatabase(env, db => db.query(
      `SELECT u.id, u.name, u.email, u."emailVerified" AS email_verified, u."createdAt" AS created_at,
              COALESCE(a.role, CASE WHEN lower(u.email) = lower($1) THEN 'admin' ELSE 'employee' END) AS role,
              COALESCE(a.status, CASE WHEN lower(u.email) = lower($1) THEN 'active' ELSE 'pending' END) AS status
       FROM neon_auth."user" u LEFT JOIN public.site_user_access a ON a.user_id = u.id
       AND ($2::boolean OR lower(u.email) <> lower($1))
       ORDER BY u."createdAt" DESC LIMIT 500`, [ADMIN_EMAIL, !isAdminDelegate]
    ));
    return json({ users: r.rows, canAssignDelegate: isAdmin }, 200, origin);
  }
  const userId = url.pathname.startsWith("/api/admin/users/") ? url.pathname.slice("/api/admin/users/".length) : "";
  if (/^[0-9a-f-]{36}$/i.test(userId) && request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const role = body.role, status = body.status;
    if (!["admin", "admin_delegate", "editor", "employee"].includes(role) || !["pending", "active", "suspended"].includes(status)) return json({ error: "INVALID_ROLE_OR_STATUS" }, 400, origin);
    const result = await withDatabase(env, async db => {
      const target = await db.query(
        `SELECT u.id, u.email, u.name, COALESCE(a.status, 'pending') AS previous_status
         FROM neon_auth."user" u LEFT JOIN public.site_user_access a ON a.user_id = u.id
         WHERE u.id = $1`, [userId]
      );
      if (!target.rows[0]) return { missing: true };
      if (target.rows[0].email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && (role !== "admin" || status !== "active")) return { protected: true };
      if (isAdminDelegate && (role === "admin" || role === "admin_delegate")) return { forbiddenTarget: true };
      if (userId === admin.id && (role !== "admin" || status !== "active")) return { selfProtected: true };
      await db.query(
        `INSERT INTO public.site_user_access (user_id, role, status, approved_by, approved_at, updated_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'active' THEN now() ELSE NULL END, now())
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status,
           approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, updated_at = now()`,
        [userId, role, status, admin.id]
      );
      return { updated: true, email: target.rows[0].email, name: target.rows[0].name, activated: target.rows[0].previous_status !== "active" && status === "active" };
    });
    if (result.missing) return json({ error: "USER_NOT_FOUND" }, 404, origin);
    if (result.protected) return json({ error: "SUPER_ADMIN_PROTECTED" }, 403, origin);
    if (result.forbiddenTarget) return json({ error: "DELEGATE_CANNOT_ASSIGN_ADMIN" }, 403, origin);
    if (result.selfProtected) return json({ error: "CANNOT_CHANGE_OWN_ADMIN_ACCESS", message: "Un administrateur ne peut pas rétrograder ou suspendre son propre compte." }, 403, origin);
    const activationEmailSent = result.activated ? await sendAccountEmail(env, result.email, result.name, "activation") : null;
    return json({ success: true, activationEmailSent }, 200, origin);
  }

  if (url.pathname === "/api/admin/newsletter/brevo-status" && request.method === "GET") {
    // Read-only authentication check. Never sends email and never exposes the API key.
    if (!env.BREVO_API_KEY) return json({ configured: false, valid: false }, 200, origin);
    try {
      const response = await fetch("https://api.brevo.com/v3/account", {
        method: "GET",
        headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY },
      });
      return json({ configured: true, valid: response.ok }, 200, origin);
    } catch {
      return json({ configured: true, valid: false }, 200, origin);
    }
  }

  if (url.pathname === "/api/admin/newsletter/subscribers" && request.method === "GET") {
    const r=await withDatabase(env,db=>db.query("SELECT id,email,status,subscribed_at FROM public.newsletter_subscribers ORDER BY subscribed_at DESC LIMIT 2000"));
    return json({subscribers:r.rows},200,origin);
  }
  if (url.pathname === "/api/admin/newsletter/subscribers" && request.method === "POST") {
    let b;try{b=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const email=String(b.email||"").trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"INVALID_EMAIL"},400,origin);
    if(b.consent_confirmed!==true)return json({error:"EXPLICIT_CONSENT_REQUIRED",message:"Confirmez que cette personne a explicitement accepté de recevoir la newsletter."},400,origin);
    const r=await withDatabase(env,db=>db.query("INSERT INTO public.newsletter_subscribers AS existing(email,status,subscribed_at,unsubscribed_at) VALUES($1,'subscribed',NOW(),NULL) ON CONFLICT(email) DO UPDATE SET status='subscribed',subscribed_at=NOW(),unsubscribed_at=NULL WHERE existing.status='subscribed' OR $2::boolean RETURNING id,email,status,subscribed_at",[email,b.consent_confirmed]));
    if(!r.rows[0])return json({error:"RECONSENT_REQUIRED",message:"Cette adresse est désinscrite. Une nouvelle confirmation explicite de consentement est nécessaire avant sa réinscription."},409,origin);
    return json({subscriber:r.rows[0]},200,origin);
  }
  const subMatch=url.pathname.match(/^\/api\/admin\/newsletter\/subscribers\/(.+)$/);
  if(subMatch&&request.method==="DELETE"){
    const email=decodeURIComponent(subMatch[1]).toLowerCase();
    const r=await withDatabase(env,db=>db.query("UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=NOW() WHERE email=$1 RETURNING email",[email]));
    return r.rowCount?json({ok:true},200,origin):json({error:"SUBSCRIBER_NOT_FOUND"},404,origin);
  }
  if(url.pathname==="/api/admin/newsletter/campaigns"&&request.method==="GET"){
    const r=await withDatabase(env,db=>db.query("SELECT c.id,c.subject,c.preview_text,c.html_content,c.status,c.recipient_count,c.sent_count,c.failed_count,c.created_at,c.updated_at,c.sent_at,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='unknown') AS unknown_count,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='pending') AS pending_count,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='failed') AS failed_recipient_count FROM public.newsletter_campaigns c ORDER BY c.updated_at DESC LIMIT 200"));
    return json({campaigns:r.rows},200,origin);
  }
  if(url.pathname==="/api/admin/newsletter/campaigns"&&request.method==="POST"){
    let b;try{b=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const subject=String(b.subject||"").trim(),preview=String(b.preview_text||"").trim(),html=String(b.html_content||"").trim(),id=b.id?Number(b.id):null;
    if(!subject||subject.length>180||preview.length>240||!html||html.length>100000||(id&&(!Number.isSafeInteger(id)||id<1)))return json({error:"INVALID_CAMPAIGN_FIELDS"},400,origin);
    const r=await withDatabase(env,async db=>id?(await db.query("UPDATE public.newsletter_campaigns SET subject=$1,preview_text=$2,html_content=$3,updated_at=NOW() WHERE id=$4 AND status='draft' RETURNING id,subject,preview_text,html_content,status,recipient_count,sent_count,failed_count,created_at,updated_at,sent_at",[subject,preview,html,id])).rows[0]||null:(await db.query("INSERT INTO public.newsletter_campaigns(subject,preview_text,html_content) VALUES($1,$2,$3) RETURNING id,subject,preview_text,html_content,status,recipient_count,sent_count,failed_count,created_at,updated_at,sent_at",[subject,preview,html])).rows[0]);
    return r?json({campaign:r},200,origin):json({error:"CAMPAIGN_NOT_EDITABLE"},409,origin);
  }
  const testSendMatch=url.pathname.match(/^\/api\/admin\/newsletter\/campaigns\/(\d+)\/test-send$/);
  if(testSendMatch&&request.method==="POST"){
    if(url.hostname!=="fd-preview.linux92fr.workers.dev")return json({error:"TEST_SEND_PREVIEW_ONLY"},404,origin);
    const id=Number(testSendMatch[1]);
    const campaign=await withDatabase(env,async db=>(await db.query("SELECT id FROM public.newsletter_campaigns WHERE id=$1",[id])).rows[0]||null);
    if(!campaign)return json({error:"CAMPAIGN_NOT_FOUND"},404,origin);
    return json({ok:true,simulated:true,message:"Test simulé en préproduction : aucun e-mail n’a été envoyé."},200,origin);
  }

  const sendMatch=url.pathname.match(/^\/api\/admin\/newsletter\/campaigns\/(\d+)\/send$/);
  if(sendMatch&&request.method==="POST"){
    const newsletterSimulator=env.NEWSLETTER_SIMULATOR==="true"&&new URL(request.url).hostname==="fd-preview.linux92fr.workers.dev";
    if(!env.BREVO_API_KEY&&!newsletterSimulator)return json({error:"BREVO_NOT_CONFIGURED"},503,origin);
    const id=Number(sendMatch[1]);
    let body={};try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const action=body.action||"start";
    if(!["start","resume","retry_failed"].includes(action))return json({error:"INVALID_ACTION"},400,origin);
    const prepared=await withDatabase(env,async db=>{
      const campaign=(await db.query("SELECT id,status FROM public.newsletter_campaigns WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!campaign)return {error:"CAMPAIGN_NOT_FOUND"};
      if(action==="start"){
        if(campaign.status!=="draft")return {error:"CAMPAIGN_NOT_STARTABLE"};
        await db.query("INSERT INTO public.newsletter_campaign_recipients(campaign_id,subscriber_id,email) SELECT $1,id,email FROM public.newsletter_subscribers WHERE status='subscribed' ON CONFLICT(campaign_id,subscriber_id) DO NOTHING",[id]);
      } else {
        if(!["sending","partial"].includes(campaign.status))return {error:"CAMPAIGN_NOT_RESUMABLE"};
        const active=await db.query("SELECT COUNT(*)::int AS n FROM public.newsletter_campaign_recipients WHERE campaign_id=$1 AND status='sending' AND updated_at>NOW()-INTERVAL '5 minutes'",[id]);
        if(active.rows[0].n)return {error:"DELIVERY_STILL_RUNNING"};
        // Only stale attempts become uncertain; they are never resent automatically.
        await db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error='Interruption pendant la tentative : résultat Brevo indéterminé',updated_at=NOW() WHERE campaign_id=$1 AND status='sending' AND updated_at<=NOW()-INTERVAL '5 minutes'",[id]);
        if(action==="retry_failed")await db.query("UPDATE public.newsletter_campaign_recipients r SET status='pending',last_error=NULL,updated_at=NOW() FROM public.newsletter_subscribers s WHERE r.campaign_id=$1 AND r.status='failed' AND s.id=r.subscriber_id AND s.status='subscribed'",[id]);
      }
      const counts=await db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='sent')::int AS sent, COUNT(*) FILTER(WHERE status='failed')::int AS failed, COUNT(*) FILTER(WHERE status='unknown')::int AS unknown, COUNT(*) FILTER(WHERE status='pending')::int AS pending FROM public.newsletter_campaign_recipients WHERE campaign_id=$1",[id]);
      if(!counts.rows[0].total)return {error:"NO_ACTIVE_SUBSCRIBERS"};
      if(counts.rows[0].total>500)return {error:"TOO_MANY_SUBSCRIBERS_FOR_SINGLE_SEND"};
      await db.query("UPDATE public.newsletter_campaigns SET status='sending',recipient_count=$1,sent_count=$2,failed_count=$3,updated_at=NOW() WHERE id=$4",[counts.rows[0].total,counts.rows[0].sent,counts.rows[0].failed,id]);
      return {counts:counts.rows[0]};
    });
    if(prepared.error){
      if(prepared.error==="NO_ACTIVE_SUBSCRIBERS")return json({error:prepared.error},409,origin);
      if(prepared.error==="TOO_MANY_SUBSCRIBERS_FOR_SINGLE_SEND")return json({error:prepared.error,limit:500},413,origin);
      return json({error:prepared.error},409,origin);
    }
    let processed=0;
    while(processed<10){
      const item=await withDatabase(env,async db=>{
        const r=await db.query("UPDATE public.newsletter_campaign_recipients cr SET status='sending',attempts=attempts+1,updated_at=NOW(),last_error=NULL WHERE cr.id=(SELECT cr2.id FROM public.newsletter_campaign_recipients cr2 JOIN public.newsletter_subscribers s ON s.id=cr2.subscriber_id AND s.status='subscribed' WHERE cr2.campaign_id=$1 AND cr2.status='pending' ORDER BY cr2.id LIMIT 1 FOR UPDATE OF cr2 SKIP LOCKED) RETURNING cr.id,cr.email",[id]);
        return r.rows[0]||null;
      });
      if(!item)break;
      processed++;
      const sub=await withDatabase(env,db=>db.query("SELECT unsubscribe_token FROM public.newsletter_subscribers WHERE email=$1",[item.email]));
      const token=sub.rows[0]?.unsubscribe_token;
      if(!token){
        await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='failed',last_error='Jeton de désinscription introuvable',updated_at=NOW() WHERE id=$1",[item.id]));
        continue;
      }
      const unsubscribeUrl=new URL("/newsletter/desinscription",url.origin);unsubscribeUrl.searchParams.set("token",token);const u=unsubscribeUrl.toString();
      const c=await withDatabase(env,db=>db.query("SELECT subject,preview_text,html_content FROM public.newsletter_campaigns WHERE id=$1",[id]));
      const campaign=c.rows[0];
      const html=(campaign.preview_text?'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'+campaign.preview_text.replace(/[&<>]/g," ")+'</div>':"")+campaign.html_content+'<hr><p style="font:12px Arial;color:#666">Vous recevez cette newsletter FO Free Distribution. <a href="'+u+'">Se désinscrire</a>.</p>';
      try{
        let response;
        if(newsletterSimulator){
          // Preview-only deterministic test: example.com succeeds; the seeded Gmail test row fails.
          response={ok:item.email==="test-desinscription@example.com",status:item.email==="test-desinscription@example.com"?201:400};
        } else {
          response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"accept":"application/json","api-key":env.BREVO_API_KEY,"content-type":"application/json"},body:JSON.stringify({sender:{name:"FO Free Distribution",email:"newsletter@focom-iliad.fr"},to:[{email:item.email}],subject:campaign.subject,htmlContent:html,textContent:html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()+"\n\nSe désinscrire : "+u,headers:{"List-Unsubscribe":"<"+u+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}})});
        }
        if(response.ok)await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='sent',sent_at=NOW(),updated_at=NOW() WHERE id=$1",[item.id]));
        else if(response.status>=500)await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error=$2,updated_at=NOW() WHERE id=$1",[item.id,"Réponse Brevo HTTP "+response.status]));
        else await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='failed',last_error=$2,updated_at=NOW() WHERE id=$1",[item.id,newsletterSimulator?"Échec simulé (aucun email envoyé)":"Réponse Brevo HTTP "+response.status]));
      }catch(e){
        await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error='Erreur réseau : résultat Brevo indéterminé',updated_at=NOW() WHERE id=$1",[item.id]));
      }
    }
    const final=await withDatabase(env,async db=>{
      const r=await db.query("SELECT COUNT(*) FILTER(WHERE status='sent')::int AS sent,COUNT(*) FILTER(WHERE status='failed')::int AS failed,COUNT(*) FILTER(WHERE status='unknown')::int AS unknown,COUNT(*) FILTER(WHERE status IN ('pending','sending'))::int AS remaining FROM public.newsletter_campaign_recipients WHERE campaign_id=$1",[id]);
      const x=r.rows[0],status=x.remaining?"sending":(x.failed||x.unknown)?"partial":"sent";
      await db.query("UPDATE public.newsletter_campaigns SET status=$1,sent_count=$2,failed_count=$3,sent_at=CASE WHEN $4 THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$5",[status,x.sent,x.failed+x.unknown,(status==="sent"||status==="partial"),id]);
      return {...x,status};
    });
    return json({ok:true,...final},200,origin);
  }

  if (url.pathname === "/api/admin/homepage" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query("SELECT content FROM public.homepage_content WHERE id=1"));
    return json({ content: { ...HOMEPAGE_DEFAULTS, ...(result.rows[0]?.content || {}) } }, 200, origin);
  }
  if (url.pathname === "/api/admin/homepage" && request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    if (!body || typeof body.content !== "object" || Array.isArray(body.content)) return json({ error: "INVALID_CONTENT" }, 400, origin);
    const content = {};
    for (const [key, fallback] of Object.entries(HOMEPAGE_DEFAULTS)) {
      const value = body.content[key] === undefined ? fallback : String(body.content[key]);
      if (value.length > 2000) return json({ error: "FIELD_TOO_LONG", field: key }, 400, origin);
      if (key.endsWith("_image") && value && !/^\/media\/uploads\/[a-zA-Z0-9._/-]+$/.test(value)) return json({ error: "INVALID_IMAGE", field: key }, 400, origin);
      if ((key === "hero_primary_url" || key === "hero_secondary_url") && !(/^(https:\/\/|\/[a-z0-9#?/_-]*|#[a-z0-9_-]+)$/i.test(value))) return json({ error: "INVALID_LINK", field: key }, 400, origin);
      content[key] = value;
    }
    await withDatabase(env, db => db.query(
      "INSERT INTO public.homepage_content (id, content, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content, updated_at=NOW()",
      [JSON.stringify(content)]
    ));
    return json({ ok: true, content }, 200, origin);
  }

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
    return json({ overview: result.rows[0], user: { role: admin.role } }, 200, origin);
  }

  if (url.pathname === "/api/admin/messages" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query(
      "SELECT id, name, email, subject, message, status, received_at, updated_at, processed_at FROM public.contact_messages ORDER BY received_at DESC LIMIT 100"
    ));
    return json({ messages: result.rows, permissions: { canDelete: admin.email.toLowerCase() === ADMIN_EMAIL } }, 200, origin);
  }

  const messageMatch = url.pathname.match(/^\/api\/admin\/messages\/(\d+)$/);
  if (messageMatch && request.method === "DELETE") {
    if (!isAdmin || admin.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return json({ error: "SUPER_ADMIN_REQUIRED" }, 403, origin);
    const result = await withDatabase(env, db => db.query(
      "DELETE FROM public.contact_messages WHERE id=$1::bigint RETURNING id",
      [Number(messageMatch[1])]
    ));
    return result.rowCount ? json({ ok: true, deletedId: result.rows[0].id }, 200, origin) : json({ error: "MESSAGE_NOT_FOUND" }, 404, origin);
  }
  if (messageMatch && request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const status = String(body.status || "");
    if (!["new", "in_progress", "resolved", "archived"].includes(status)) {
      return json({ error: "INVALID_STATUS" }, 400, origin);
    }
    const result = await withDatabase(env, db => db.query(
      "UPDATE public.contact_messages SET status=$1::varchar, updated_at=NOW(), processed_at=CASE WHEN $1::varchar IN ('resolved','archived') THEN COALESCE(processed_at, NOW()) ELSE NULL END WHERE id=$2::bigint RETURNING id, status, updated_at, processed_at",
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
             status=$7::varchar, published_at=CASE WHEN $7::varchar='published' THEN COALESCE(published_at, NOW()) ELSE NULL END,
             updated_at=NOW() WHERE id=$8
           RETURNING id, title, slug, status, published_at`,
          [title, slug, excerpt || null, content, cover || null, category, status, id]
        );
        return updated.rows[0] || null;
      }
      const inserted = await db.query(
        `INSERT INTO articles (title, slug, excerpt, content, cover_image_url, category, status, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,CASE WHEN $7::varchar='published' THEN NOW() ELSE NULL END)
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

    if (url.pathname === "/api/webhooks/neon-auth") return handleNeonAuthWebhook(request, env);

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

    if (url.pathname === "/robots.txt" && request.method === "GET") {
      return new Response("User-agent: *\\nAllow: /\\nDisallow: /admin\\nDisallow: /api/\\nSitemap: https://fd.focom-iliad.fr/sitemap.xml\\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" }
      });
    }

    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      try {
        const result = await withDatabase(env, db => db.query(
          "SELECT slug, updated_at, published_at FROM articles WHERE status='published' AND published_at <= NOW() ORDER BY published_at DESC LIMIT 1000"
        ));
        const entries = result.rows.map(article => {
          const loc = "https://fd.focom-iliad.fr/actualites/" + encodeURIComponent(article.slug);
          const lastmod = new Date(article.updated_at || article.published_at).toISOString();
          return "<url><loc>" + loc + "</loc><lastmod>" + lastmod + "</lastmod></url>";
        }).join("");
        const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          '<url><loc>https://fd.focom-iliad.fr/</loc></url>' + entries + '</urlset>';
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      } catch (error) {
        console.error("Sitemap generation failed:", error.message);
        return new Response("Sitemap temporairement indisponible", { status: 503 });
      }
    }

    const seoArticleMatch = url.pathname.match(new RegExp("^/actualites/([a-z0-9-]+)/?$", "i"));
    if (seoArticleMatch && request.method === "GET") {
      try {
        const slug = decodeURIComponent(seoArticleMatch[1]);
        const result = await withDatabase(env, db => db.query(
          "SELECT title, excerpt, cover_image_url, category FROM articles WHERE slug=$1 AND status='published' AND published_at <= NOW() LIMIT 1",
          [slug]
        ));
        if (!result.rows.length) return new Response("Article introuvable", { status: 404 });
        const article = result.rows[0];
        const escapeMeta = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const description = escapeMeta((article.excerpt || article.title).split(" ").join(" ").slice(0, 250));
        const title = escapeMeta(article.title + " – FO Free Distribution");
        const canonical = "https://fd.focom-iliad.fr/actualites/" + encodeURIComponent(slug);
        const image = article.cover_image_url ? '<meta property="og:image" content="' + escapeMeta(article.cover_image_url) + '">' : "";
        const tags = '<title>' + title + '</title>' +
          '<meta name="description" content="' + description + '">' +
          '<link rel="canonical" href="' + canonical + '">' +
          '<meta property="og:type" content="article">' +
          '<meta property="og:site_name" content="FO Free Distribution">' +
          '<meta property="og:title" content="' + title + '">' +
          '<meta property="og:description" content="' + description + '">' +
          '<meta property="og:url" content="' + canonical + '">' + image +
          '<meta name="twitter:card" content="' + (article.cover_image_url ? "summary_large_image" : "summary") + '">' +
          '<meta name="twitter:title" content="' + title + '">' +
          '<meta name="twitter:description" content="' + description + '">';
        const page = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), {
          method: "GET",
          headers: request.headers,
        }));
        if (!page.ok) throw new Error("ASSET_INDEX_UNAVAILABLE_" + page.status);
        const sourceHtml = await page.text();
        if (!sourceHtml || !/<!doctype html>/i.test(sourceHtml)) throw new Error("ASSET_INDEX_INVALID_HTML");
        const html = sourceHtml.replace("</head>", tags + "</head>");
        return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
      } catch (error) {
        console.error("Article SEO page failed:", error.message);
        return new Response("Page temporairement indisponible", { status: 503 });
      }
    }

    const publicArticleMatch = url.pathname.match(/^\/api\/articles\/([a-z0-9-]+)\/?$/i);
    if (publicArticleMatch && request.method === "GET") {
      try {
        const slug = decodeURIComponent(publicArticleMatch[1]);
        const result = await withDatabase(env, (db) => db.query(
          `SELECT id, title, slug, excerpt, content, cover_image_url, category, published_at
           FROM articles WHERE slug = $1 AND status = 'published' AND published_at <= NOW() LIMIT 1`,
          [slug]
        ));
        if (!result.rows.length) return json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
        return json({ article: result.rows[0] }, 200, origin);
      } catch (error) {
        console.error("Public article request failed:", error.message);
        return json({ error: "ARTICLE_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname === "/api/homepage" && request.method === "GET") {
      try {
        const result = await withDatabase(env, db => db.query("SELECT content FROM public.homepage_content WHERE id=1"));
        return json({ content: { ...HOMEPAGE_DEFAULTS, ...(result.rows[0]?.content || {}) } }, 200, origin);
      } catch (error) {
        console.error("Homepage content request failed:", error?.code || error?.name || "unknown");
        return json({ content: HOMEPAGE_DEFAULTS }, 200, origin);
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

    if (url.pathname === "/api/newsletter/subscribe" && request.method === "POST") return handleNewsletterSubscribe(request, env);

    if (url.pathname === "/api/contact" && request.method === "POST") return handleContact(request, env);

    if (url.pathname === "/api/survey" && request.method === "POST") return handleSurvey(request, env);

    if (url.pathname === "/api/admin/survey-results" && request.method === "GET") return surveyResults(request, env);

    if (url.pathname === "/admin/questionnaire" && request.method === "GET") {
      if (!await requireSurveyAdmin(request)) return new Response("Accès réservé à l’administrateur.", { status: 403 });
      return new Response(dashboardHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }


    if(url.pathname==="/newsletter/desinscription"&&(request.method==="GET"||request.method==="POST")){
      const token=url.searchParams.get("token")||"";
      const validToken=/^[0-9a-f-]{36}$/i.test(token);
      const headers={"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
      if(request.method==="GET"){
        const message=validToken
          ? "Pour confirmer votre désinscription de la newsletter FO Free Distribution, cliquez sur le bouton ci-dessous."
          : "Ce lien de désinscription est invalide ou expiré.";
        const action=validToken
          ? '<form method="post" action="/newsletter/desinscription?token='+encodeURIComponent(token)+'"><input type="hidden" name="confirm" value="1"><button type="submit">Confirmer ma désinscription</button></form>'
          : "";
        return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Désinscription</title><body style="font:16px Arial;max-width:620px;margin:12vh auto;padding:24px"><h1>FO Free Distribution</h1><p>'+message+'</p>'+action+'<p><a href="https://fd.focom-iliad.fr/">Retour au site</a></p></body></html>',{headers});
      }
      if(!validToken) return new Response("Lien de désinscription invalide ou expiré.",{status:400,headers});
      const postBody=await request.text();
      const contentType=request.headers.get("content-type")||"";
      const oneClick=contentType.toLowerCase().includes("application/x-www-form-urlencoded")&&postBody==="List-Unsubscribe=One-Click";
      const manualConfirm=new URLSearchParams(postBody).get("confirm")==="1";
      if(!oneClick&&!manualConfirm)return new Response("Confirmation de désinscription invalide.",{status:400,headers});
      try{
        const r=await withDatabase(env,db=>db.query("UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=NOW() WHERE unsubscribe_token=$1::uuid AND status='subscribed' RETURNING email",[token]));
        const message=r.rowCount?"Votre désinscription a bien été prise en compte.":"Cette adresse était déjà désinscrite ou le lien est expiré.";
        return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Désinscription confirmée</title><body style="font:16px Arial;max-width:620px;margin:12vh auto;padding:24px"><h1>FO Free Distribution</h1><p>'+message+'</p><a href="https://fd.focom-iliad.fr/">Retour au site</a></body></html>',{headers});
      }catch(e){
        console.error("Newsletter unsubscribe:",e?.code||e?.name||"unknown");
        return new Response("La désinscription n'a pas pu être enregistrée. Merci de réessayer.",{status:503,headers});
      }
    }

    if (url.pathname.startsWith("/api/admin/")) {
      try { return await handleAdmin(request, env, url, origin); }
      catch (error) {
        console.error("Admin API failed:", error?.name || "Error", error?.code || "NO_CODE", String(error?.message || "unknown").slice(0, 240));
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
