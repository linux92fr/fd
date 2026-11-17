import { createRemoteJWKSet, jwtVerify } from "jose";

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


async function handleSurvey(request, env) {
  if (!env.SURVEYS_DB) return json({ error: "SURVEY_STORAGE_UNAVAILABLE" }, 503);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415);
  }
  const origin = request.headers.get("Origin");
  if (origin !== "https://fd-preview.linux92fr.workers.dev") {
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


const ACCESS_ISSUER = "https://linux92fr.cloudflareaccess.com";
const ACCESS_AUDIENCE = "ab91754815c5c7684a9204a3a63dc9a474d1ae991fd425eb6d9ca5e1174f325e";
const ACCESS_JWKS = createRemoteJWKSet(new URL(ACCESS_ISSUER + "/cdn-cgi/access/certs"));
const SURVEY_ADMIN_EMAIL = "free-distri@focom-iliad.fr";

async function requireSurveyAdmin(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  try {
    const { payload } = await jwtVerify(assertion, ACCESS_JWKS, {
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE,
    });
    return typeof payload.email === "string" && payload.email.toLowerCase() === SURVEY_ADMIN_EMAIL;
  } catch (error) {
    console.warn("Access JWT rejected:", error?.code || error?.name || "unknown");
    return false;
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
<main><span class="eyebrow">Consultation des salariés · préproduction</span><h1>Résultats du questionnaire</h1>
<p class="muted">Données anonymes recueillies sur l'environnement de préproduction. Accès réservé à l'administrateur.</p>
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
 const text=[headers,...rowsOut].map(row=>row.map(quote).join(';')).join('\r\n');
 const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fd-questionnaire-reponses-anonymes.csv';a.click();URL.revokeObjectURL(url);
}
$('#csv').onclick=csv;$('#pdf').onclick=()=>window.print();$('#refresh').onclick=load;load();
</script></body></html>`;
}

async function surveyResults(request, env) {
  if (!await requireSurveyAdmin(request)) return json({ error: "ACCESS_DENIED" }, 403);
  try {
    const result = await env.SURVEYS_DB.prepare(
      "SELECT created_at, answers_json FROM survey_responses ORDER BY created_at DESC"
    ).all();
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, preview: true, database: false, mode: "read-only-demo" });
    }

    if (url.pathname === "/api/admin/survey-results" && request.method === "GET") {
      return surveyResults(request, env);
    }

    if (url.pathname === "/admin/questionnaire" && request.method === "GET") {
      if (!await requireSurveyAdmin(request)) return html("Accès réservé à l’administrateur authentifié par Cloudflare Access.", 403);
      return withPreviewHeaders(new Response(dashboardHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }));
    }

    if (url.pathname === "/api/survey" && request.method === "POST") {
      return handleSurvey(request, env);
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
