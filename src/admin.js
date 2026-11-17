function renderArticleMarkup(source) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const inline = value => escape(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  const blocks = String(source || '').trim().split(/\n\s*\n/).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.every(line => /^[-*]\s+/.test(line))) return '<ul>' + lines.map(line => '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>').join('') + '</ul>';
    if (lines.every(line => /^\d+[.)]\s+/.test(line))) return '<ol>' + lines.map(line => '<li>' + inline(line.replace(/^\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
    if (lines.every(line => /^>\s?/.test(line))) return '<blockquote>' + lines.map(line => inline(line.replace(/^>\s?/, ''))).join('<br>') + '</blockquote>';
    if (lines.length === 1 && /^###\s+/.test(lines[0])) return '<h3>' + inline(lines[0].replace(/^###\s+/, '')) + '</h3>';
    if (lines.length === 1 && /^##\s+/.test(lines[0])) return '<h2>' + inline(lines[0].replace(/^##\s+/, '')) + '</h2>';
    if (lines.length === 1 && /^#\s+/.test(lines[0])) return '<h2>' + inline(lines[0].replace(/^#\s+/, '')) + '</h2>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}

import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient('https://ep-sweet-resonance-b9ov2yaa.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth');
const root = document.querySelector('#app');
let mediaReturn = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function token() {
  const result = await auth.token();
  if (result?.error) throw new Error(result.error.message || 'Session expirée');
  return result?.data?.token || null;
}
async function call(path, options = {}) {
  const jwt = await token();
  if (!jwt) throw new Error('Session expirée');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}
function frame(content) {
  root.innerHTML = '<div class="admin-shell"><header class="admin-header"><a class="admin-brand" href="/"><strong>FO</strong> FOCOM · Free Distributions</a><a href="/">← Voir le site</a></header><main class="admin-main">' + content + '</main></div>';
}
function login(message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Espace sécurisé</span><h1>Administration</h1><p>Connectez-vous avec le compte administrateur.</p><form id="login"><label>Adresse e-mail<input name="email" type="email" value="free-distri@focom-iliad.fr" required autocomplete="username"></label><label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><button class="button button-red">Se connecter</button><p class="admin-message">' + esc(message) + '</p></form><button type="button" id="forgot-password" class="text-button">Mot de passe oublié ?</button><p><button type="button" id="verify-email-link" class="text-button">Vérifier mon adresse e-mail</button></p></section>');
  root.querySelector('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      const result = await auth.signIn.email({ email: data.get('email'), password: data.get('password') });
      if (result?.error) throw new Error(result.error.message);
      await dashboard();
    } catch (err) { login(err.message || 'Connexion impossible.'); }
  });
  root.querySelector('#forgot-password').addEventListener('click', () => passwordRequest());
  root.querySelector('#verify-email-link').addEventListener('click', () => emailVerification());
}
function emailVerification(message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Vérification du compte</span><h1>Confirmer votre adresse e-mail</h1><p>Un code de vérification sera envoyé à <strong>free-distri@focom-iliad.fr</strong>. Saisissez-le ci-dessous.</p><form id="send-verification"><button class="button button-outline-dark">Envoyer un nouveau code</button></form><form id="verify-email" style="margin-top:1rem"><label>Code reçu par e-mail<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button class="button button-red">Vérifier mon adresse</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="back-login" class="text-button">← Retour à la connexion</button></section>');
  root.querySelector('#back-login').onclick = () => login();
  root.querySelector('#send-verification').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const result = await auth.emailOtp.sendVerificationOtp({ email: 'free-distri@focom-iliad.fr', type: 'email-verification' });
      if (result?.error) throw new Error(result.error.message || 'Envoi impossible.');
      emailVerification('Un nouveau code vient d’être envoyé. Vérifiez votre boîte de réception.');
    } catch (err) { emailVerification(err.message || 'Impossible d’envoyer le code.'); }
  });
  root.querySelector('#verify-email').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const otp = new FormData(form).get('otp');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await auth.emailOtp.verifyEmail({ email: 'free-distri@focom-iliad.fr', otp });
      if (result?.error) throw new Error(result.error.message || 'Code invalide ou expiré.');
      login('Adresse e-mail vérifiée. Vous pouvez maintenant réinitialiser votre mot de passe.');
    } catch (err) {
      form.querySelector('.admin-message').textContent = err.message || 'Code invalide ou expiré. Demandez un nouveau code.';
      button.disabled = false;
    }
  });
}
function passwordRequest(message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Récupération du compte</span><h1>Réinitialiser le mot de passe</h1><p>Saisissez l’adresse e-mail de votre compte administrateur. Vous recevrez un lien pour choisir un nouveau mot de passe.</p><form id="password-request"><label>Adresse e-mail<input name="email" type="email" value="free-distri@focom-iliad.fr" required autocomplete="email"></label><button class="button button-red">Envoyer le lien</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="back-login" class="text-button">← Retour à la connexion</button></section>');
  root.querySelector('#back-login').onclick = () => login();
  root.querySelector('#password-request').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('button[type="submit"], button:not([type])');
    button.disabled = true;
    try {
      const email = new FormData(e.currentTarget).get('email');
      const result = await auth.requestPasswordReset({ email, redirectTo: location.origin + '/admin?reset-password=1' });
      if (result?.error) throw new Error(result.error.message || 'Envoi impossible.');
      passwordRequest('Si cette adresse correspond à un compte, un e-mail de réinitialisation vient d’être envoyé. Vérifiez aussi vos courriers indésirables.');
    } catch (err) {
      passwordRequest(err.message || 'Impossible d’envoyer le lien. Réessayez.');
    }
  });
}
function passwordReset() {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('token');
  const authError = params.get('error');
  if (!resetToken) {
    passwordRequest(authError ? 'Le lien est invalide ou expiré. Vous pouvez demander un nouvel e-mail.' : 'Le lien de réinitialisation est incomplet.');
    return;
  }
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Sécurisation du compte</span><h1>Choisir un nouveau mot de passe</h1><form id="password-reset"><label>Nouveau mot de passe<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirmer le mot de passe<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label><button class="button button-red">Enregistrer le nouveau mot de passe</button><p class="admin-message" role="status"></p></form></section>');
  root.querySelector('#password-reset').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    const password = values.get('password');
    const message = form.querySelector('.admin-message');
    if (password !== values.get('confirm')) { message.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await auth.resetPassword({ newPassword: password, token: resetToken });
      if (result?.error) throw new Error(result.error.message || 'Réinitialisation impossible.');
      history.replaceState({}, '', '/admin');
      login('Mot de passe modifié. Vous pouvez maintenant vous connecter.');
    } catch (err) {
      message.textContent = err.message || 'Le lien est invalide ou expiré. Demandez-en un nouveau.';
      button.disabled = false;
    }
  });
}
async function dashboard() {
  try {
    const { overview = {} } = await call('/api/admin/overview');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Espace sécurisé FO</span><h1>Tableau de bord</h1><p>Vue d’ensemble de l’activité du site et accès rapide aux outils de gestion.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Vue d’ensemble</h2><button id="refresh-overview" class="button button-outline-dark">Actualiser</button></div><div class="admin-stats-grid"><article class="admin-stat"><span>Articles</span><strong>' + Number(overview.articles_total || 0) + '</strong><small>' + Number(overview.articles_published || 0) + ' publiés · ' + Number(overview.articles_draft || 0) + ' brouillons</small></article><article class="admin-stat"><span>Messages reçus</span><strong>' + Number(overview.messages_total || 0) + '</strong><small>' + Number(overview.messages_new || 0) + ' nouveaux · ' + Number(overview.messages_in_progress || 0) + ' en cours</small></article><article class="admin-stat"><span>Messages traités</span><strong>' + Number(overview.messages_resolved || 0) + '</strong><small>Demandes marquées comme traitées</small></article></div></section><section class="admin-panel"><div class="admin-toolbar"><h2>Accès rapides</h2></div><div class="admin-quick-links"><button id="open-articles" class="button button-red">Gérer les articles</button><button id="open-messages" class="button button-outline-dark">Messages reçus</button><button id="open-survey" class="button button-outline-dark">Bilan du questionnaire</button><button id="open-media" class="button button-outline-dark">Médiathèque</button><button id="open-homepage" class="button button-outline-dark">Page d’accueil</button></div><p class="admin-help">Le bilan du questionnaire reste dans son espace sécurisé dédié. Les médias et les autres réglages seront ajoutés progressivement.</p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#refresh-overview').onclick = () => dashboard();
    root.querySelector('#open-articles').onclick = () => articlesPage();
    root.querySelector('#open-messages').onclick = () => messages();
    root.querySelector('#open-survey').onclick = () => surveyPage();
    root.querySelector('#open-media').onclick = () => mediaPage();
    root.querySelector('#open-homepage').onclick = () => homepagePage();
  } catch (err) { login('Impossible de charger le tableau de bord : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
async function surveyPage() {
  try {
    const { responses = [] } = await call('/api/admin/secure-survey-results');
    const labels = { salary:'Salaires et pouvoir d’achat', commissions:'Primes et commissions', staffing:'Effectifs et moyens en boutique', schedules:'Horaires et équilibre vie pro/perso', workload:'Charge et organisation du travail', training:'Formation', career:'Évolution professionnelle', management:'Management et communication', health:'Santé, sécurité et conditions de travail', recognition:'Reconnaissance du travail', other:'Autre sujet' };
    const conditions = {}, recognition = {}, priorities = {};
    for (let n=1;n<=5;n++) { conditions[n]=0; recognition[n]=0; }
    let sumConditions=0, sumRecognition=0;
    responses.forEach(row => {
      const a=row.answers||{};
      if (conditions[a.conditions] !== undefined) { conditions[a.conditions]++; sumConditions += Number(a.conditions); }
      if (recognition[a.recognition] !== undefined) { recognition[a.recognition]++; sumRecognition += Number(a.recognition); }
      (Array.isArray(a.priorities)?a.priorities:[]).forEach(key => { const label=labels[key]||key; priorities[label]=(priorities[label]||0)+1; });
    });
    const barRows = (obj,total) => Object.entries(obj).map(([label,count]) => '<div class="survey-admin-bar"><span>'+esc(label)+'</span><div><i style="width:'+(total?count/total*100:0)+'%"></i></div><b>'+count+'</b></div>').join('');
    const comments=responses.filter(row=>row.answers?.comment).map(row=>'<article class="survey-admin-comment">'+esc(row.answers.comment)+'</article>').join('');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Consultation des salariés</span><h1>Bilan du questionnaire</h1><p>Résultats anonymes et synthèse des réponses enregistrées.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Résultats globaux</h2><div class="admin-form-actions"><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button><button id="export-survey-csv" class="button button-outline-dark">Exporter CSV</button><button id="export-survey-pdf" class="button button-red">Exporter PDF</button></div></div><div class="admin-stats-grid"><article class="admin-stat"><span>Réponses reçues</span><strong>'+responses.length+'</strong><small>Participation totale enregistrée</small></article><article class="admin-stat"><span>Conditions de travail</span><strong>'+(responses.length?(sumConditions/responses.length).toFixed(1).replace('.',',')+'/5':'—')+'</strong><small>Note moyenne</small></article><article class="admin-stat"><span>Reconnaissance</span><strong>'+(responses.length?(sumRecognition/responses.length).toFixed(1).replace('.',',')+'/5':'—')+'</strong><small>Note moyenne</small></article></div></section><section class="admin-panel"><h2>Conditions de travail</h2>'+barRows(conditions,responses.length)+'</section><section class="admin-panel"><h2>Reconnaissance au travail</h2>'+barRows(recognition,responses.length)+'</section><section class="admin-panel"><h2>Priorités exprimées</h2>'+barRows(Object.fromEntries(Object.entries(priorities).sort((x,y)=>y[1]-x[1])),responses.length)+'</section><section class="admin-panel"><h2>Commentaires libres ('+responses.filter(row=>row.answers?.comment).length+')</h2><div class="survey-admin-comments">'+(comments||'<p>Aucun commentaire libre pour le moment.</p>')+'</div><p class="admin-help">Les réponses sont présentées de manière anonyme. Évitez de rechercher l’identité des participants à partir de leurs commentaires.</p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#export-survey-pdf').onclick = () => window.print();
    root.querySelector('#export-survey-csv').onclick = () => {
      const headers=['Date de réception','Conditions de travail','Reconnaissance','Priorités','Commentaire'];
      const rows=responses.map(row=>[row.created_at,row.answers?.conditions,row.answers?.recognition,(row.answers?.priorities||[]).map(k=>labels[k]||k).join(' | '),row.answers?.comment||'']);
      const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
      const csv=[headers,...rows].map(row=>row.map(quote).join(';')).join('\r\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='fd-questionnaire-reponses-anonymes.csv';link.click();URL.revokeObjectURL(url);
    };
  } catch (err) { login('Impossible de charger les résultats : '+(err.message||'ERREUR_INCONNUE')+'.'); }
}

async function homepagePage() {
  try {
    const { content = {} } = await call('/api/admin/homepage');
    const fields = [
      ['hero_eyebrow','Petit titre d’accueil'],['hero_title','Grand titre d’accueil'],['hero_text','Texte d’introduction'],
      ['hero_primary_label','Bouton principal — texte'],['hero_primary_url','Bouton principal — lien'],
      ['hero_secondary_label','Bouton secondaire — texte'],['hero_secondary_url','Bouton secondaire — lien'],
      ['intro_eyebrow','Engagement — petit titre'],['intro_title','Engagement — titre'],['intro_text','Engagement — texte'],
      ['news_eyebrow','Actualités — petit titre'],['news_title','Actualités — titre'],['news_note','Actualités — texte complémentaire'],
      ['claims_eyebrow','Revendications — petit titre'],['claims_title','Revendications — titre'],['claims_lead','Revendications — introduction'],
      ['rights_eyebrow','Droits — petit titre'],['rights_title','Droits — titre'],['rights_lead','Droits — introduction'],
      ['survey_eyebrow','Questionnaire — petit titre'],['survey_title','Questionnaire — titre'],['survey_text','Questionnaire — introduction']
    ];
    frame('<div class="admin-title-row"><div><span class="eyebrow">Contenu du site</span><h1>Page d’accueil</h1><p>Modifiez les textes principaux affichés sur la page d’accueil. Les articles, revendications détaillées et questions du questionnaire restent gérés dans leurs espaces respectifs.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Textes de la page d’accueil</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><form id="homepage-form" class="admin-form-grid">' + fields.map(([key,label]) => '<label>' + esc(label) + (key.endsWith('_text') || key.endsWith('_lead') || key.endsWith('_title') ? '<textarea name="' + key + '" rows="' + (key.endsWith('_title') ? '2' : '4') + '">' + esc(content[key] || '') + '</textarea>' : '<input name="' + key + '" value="' + esc(content[key] || '') + '">') + '</label>').join('') + '<div class="admin-form-actions"><button class="button button-red" type="submit">Enregistrer les modifications</button><button class="button button-outline-dark" type="button" id="reset-homepage">Recharger les textes actuels</button></div><p class="admin-message" id="homepage-status" role="status"></p></form></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#reset-homepage').onclick = () => homepagePage();
    root.querySelector('#homepage-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const content = {};
      for (const [key] of fields) content[key] = form.elements.namedItem(key).value;
      button.disabled = true;
      const status = root.querySelector('#homepage-status');
      status.textContent = 'Enregistrement…';
      try {
        await call('/api/admin/homepage', { method: 'PUT', body: JSON.stringify({ content }) });
        status.textContent = 'Les textes de la page d’accueil ont été enregistrés.';
      } catch (error) {
        status.textContent = 'Enregistrement impossible : ' + error.message;
      } finally { button.disabled = false; }
    });
  } catch (error) {
    frame('<section class="admin-panel"><h1>Page d’accueil</h1><p class="admin-message">Chargement impossible : ' + esc(error.message) + '</p><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></section>');
    root.querySelector('#back-dashboard').onclick = () => dashboard();
  }
}

async function mediaPage() {
  try {
    const { media = [], truncated = false } = await call('/api/admin/media');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Images du site</span><h1>Médiathèque</h1><p>Importez et réutilisez les images de vos articles. Formats JPG, PNG, WebP ou GIF · 8 Mo maximum.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Importer une image</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><form id="media-upload" class="admin-form-actions"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required><button class="button button-red">Importer</button></form><p class="admin-message" id="media-status" role="status"></p></section><section class="admin-panel"><div class="admin-toolbar"><h2>Images disponibles ('+media.length+')</h2><button id="refresh-media" class="button button-outline-dark">Actualiser</button></div><div class="media-grid">'+(media.length?media.map(item=>'<article class="media-item"><img src="'+esc(item.url)+'" alt=""><div><small>'+esc(item.key.split('/').pop())+'</small><p>'+Math.round(item.size/1024)+' Ko</p><button class="button button-outline-dark media-select" data-url="'+esc(item.url)+'">Utiliser cette image</button> <button class="text-button media-delete" data-key="'+esc(item.key)+'">Supprimer</button></div></article>').join(''):'<p>Aucune image enregistrée pour le moment.</p>')+'</div>'+(truncated?'<p class="admin-help">Affichage limité aux 200 premières images.</p>':'')+'</section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => { mediaReturn=null; dashboard(); };
    root.querySelector('#refresh-media').onclick = () => mediaPage();
    root.querySelector('#media-upload').onsubmit = async e => {
      e.preventDefault();
      const uploadForm = e.currentTarget;
      const button=uploadForm.querySelector('button'); button.disabled=true;
      try {
        const jwt=await token();
        const form=new FormData(uploadForm);
        const response=await fetch('/api/admin/media',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:form});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||'Import impossible');
        mediaPage();
      } catch(err) { root.querySelector('#media-status').textContent='Erreur : '+err.message; button.disabled=false; }
    };
    root.querySelectorAll('.media-select').forEach(button=>button.onclick=()=>{
      const url=button.dataset.url;
      if(mediaReturn){const callback=mediaReturn;mediaReturn=null;callback(url);}
      else { navigator.clipboard?.writeText(new URL(url, location.origin).href); root.querySelector('#media-status').textContent='Adresse de l’image copiée.'; }
    });
    root.querySelectorAll('.media-delete').forEach(button=>button.onclick=async()=>{
      if(!confirm('Supprimer définitivement cette image ?')) return;
      try { await call('/api/admin/media/'+button.dataset.key.split('/').map(encodeURIComponent).join('/'),{method:'DELETE'}); mediaPage(); }
      catch(err){ root.querySelector('#media-status').textContent='Suppression impossible : '+err.message; }
    });
  } catch(err) { login('Impossible de charger la médiathèque : '+err.message+'.'); }
}

async function articlesPage() {
  try {
    const { articles = [] } = await call('/api/admin/articles');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Gestion du contenu</span><h1>Actualités</h1><p>Créer, modifier et publier les communications FO.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Articles (' + articles.length + ')</h2><div class="admin-form-actions"><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button><button id="new" class="button button-red">＋ Nouvel article</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Titre</th><th>Catégorie</th><th>Statut</th><th></th></tr></thead><tbody>' + (articles.length ? articles.map(a => '<tr><td><b>' + esc(a.title) + '</b><small>' + esc(a.slug) + '</small></td><td>' + esc(a.category) + '</td><td>' + esc(a.status) + '</td><td><button class="text-button edit" data-id="' + a.id + '">Modifier</button></td></tr>').join('') : '<tr><td colspan="4">Aucun article pour le moment.</td></tr>') + '</tbody></table></div></section><section id="editor" class="admin-panel" hidden></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#new').onclick = () => editor();
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelectorAll('.edit').forEach(b => b.onclick = () => editor(articles.find(a => String(a.id) === b.dataset.id)));
  } catch (err) { login('Diagnostic de connexion : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
async function messages() {
  try {
    const { messages: items = [], permissions = {} } = await call('/api/admin/messages');
    const statusLabels = { new: 'Nouveau', in_progress: 'En cours', resolved: 'Traité', archived: 'Archivé' };
    frame('<div class="admin-title-row"><div><span class="eyebrow">Espace de contact</span><h1>Messages reçus</h1><p>Les messages envoyés depuis le formulaire de contact du site.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>' + items.length + ' message(s)</h2><div class="admin-form-actions"><button id="back-articles" class="button button-outline-dark">← Articles</button><button id="refresh-messages" class="button button-outline-dark">Actualiser</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Reçu le</th><th>Expéditeur</th><th>Objet et message</th><th>Suivi</th></tr></thead><tbody>' + (items.length ? items.map(m => '<tr><td>' + esc(new Date(m.received_at).toLocaleString('fr-FR')) + '</td><td><b>' + esc(m.name || 'Nom non renseigné') + '</b><small>' + esc(m.email) + '</small></td><td><details><summary>' + esc(m.subject) + '</summary><p style="white-space:pre-wrap;max-width:520px">' + esc(m.message) + '</p><a href="mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + m.subject) + '">Répondre par e-mail</a></details></td><td><select class="message-status" data-id="' + esc(m.id) + '" aria-label="Statut du message"><option value="new"' + (m.status === 'new' ? ' selected' : '') + '>Nouveau</option><option value="in_progress"' + (m.status === 'in_progress' ? ' selected' : '') + '>En cours</option><option value="resolved"' + (m.status === 'resolved' ? ' selected' : '') + '>Traité</option><option value="archived"' + (m.status === 'archived' ? ' selected' : '') + '>Archivé</option></select>' + (permissions.canDelete ? ' <button type="button" class="text-button message-delete" data-id="' + esc(m.id) + '">Supprimer</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="4">Aucun message reçu pour le moment.</td></tr>') + '</tbody></table></div><p class="admin-message" id="messages-status" role="status"></p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-articles').onclick = () => dashboard();
    root.querySelector('#refresh-messages').onclick = () => messages();
    root.querySelectorAll('.message-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Supprimer définitivement ce message ? Cette action est irréversible.')) return;
        button.disabled = true;
        try {
          await call('/api/admin/messages/' + encodeURIComponent(button.dataset.id), { method: 'DELETE' });
          await messages();
        } catch (err) {
          root.querySelector('#messages-status').textContent = 'Suppression impossible : ' + err.message;
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll('.message-status').forEach(select => {
      select.addEventListener('change', async () => {
        const previous = select.dataset.previous || select.value;
        select.disabled = true;
        try {
          await call('/api/admin/messages/' + encodeURIComponent(select.dataset.id), { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          select.dataset.previous = select.value;
          root.querySelector('#messages-status').textContent = 'Statut du message mis à jour.';
        } catch (err) {
          select.value = previous;
          root.querySelector('#messages-status').textContent = 'Modification impossible : ' + err.message;
        } finally { select.disabled = false; }
      });
      select.dataset.previous = select.value;
    });
  } catch (err) { login('Impossible de charger les messages : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
function editor(a = {}) {
  const el = root.querySelector('#editor'); el.hidden = false;
  el.innerHTML = '<div class="admin-toolbar"><h2>' + (a.id ? 'Modifier' : 'Nouvel') + ' article</h2><button id="close" class="text-button">Fermer</button></div><form id="article-form" class="article-form"><input type="hidden" name="id" value="' + esc(a.id || '') + '"><label>Titre<input name="title" maxlength="180" required value="' + esc(a.title || '') + '"></label><label>Slug<input name="slug" maxlength="180" value="' + esc(a.slug || '') + '"></label><label>Catégorie<input name="category" maxlength="80" value="' + esc(a.category || 'Actualités') + '"></label><label>Résumé<textarea name="excerpt" maxlength="320" rows="2">' + esc(a.excerpt || '') + '</textarea></label><label>Contenu<div class="article-format-toolbar" aria-label="Mise en forme du contenu"><button type="button" data-format="**|**" title="Gras"><strong>G</strong></button><button type="button" data-format="*|*" title="Italique"><em>I</em></button><button type="button" data-prefix="## " title="Titre">Titre</button><button type="button" data-prefix="- " title="Liste à puces">• Liste</button><button type="button" data-prefix="1. " title="Liste numérotée">1. Liste</button><button type="button" data-prefix="> " title="Citation">Citation</button><span>Raccourcis : **gras**, *italique*, ## titre, - liste, [lien](https://…)</span></div><textarea name="content" rows="14" required>' + esc(a.content || '') + '</textarea></label><label>Image (URL HTTPS)<input name="cover_image_url" type="url" value="' + esc(a.cover_image_url || '') + '"></label><button type="button" id="choose-media" class="button button-outline-dark">Choisir dans la médiathèque</button><div class="admin-form-actions"><button type="button" id="preview-toggle" class="button button-outline-dark">Aperçu de l’article</button><button class="button button-outline-dark" name="status" value="draft">Enregistrer le brouillon</button><button class="button button-red" name="status" value="published">Publier</button>' + (a.id ? '<button type="button" id="archive" class="text-button">Archiver</button>' : '') + '</div><p class="admin-message" role="status"></p></form><section id="article-preview" class="article-preview" hidden aria-live="polite"><div class="preview-heading"><span class="eyebrow">Prévisualisation · non publiée</span><span class="preview-status">Visible uniquement ici</span></div><article class="preview-article"><img class="preview-cover" alt="" hidden><span class="preview-category"></span><h1 class="preview-title"></h1><p class="preview-excerpt"></p><div class="preview-content"></div></article></section>';
  const form = el.querySelector('#article-form');
  const preview = el.querySelector('#article-preview');
  const fields = name => form.elements.namedItem(name);
  const contentField = fields('content');
  el.querySelectorAll('.article-format-toolbar button').forEach(button => {
    button.addEventListener('click', () => {
      const start = contentField.selectionStart;
      const end = contentField.selectionEnd;
      const selected = contentField.value.slice(start, end);
      if (button.dataset.format) {
        const [before, after] = button.dataset.format.split('|');
        contentField.setRangeText(before + (selected || 'texte') + after, start, end, 'select');
      } else if (button.dataset.prefix) {
        const lineStart = contentField.value.lastIndexOf('\\n', Math.max(0, start - 1)) + 1;
        contentField.setRangeText(button.dataset.prefix + selected, lineStart, end, 'select');
      }
      contentField.focus();
      contentField.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  const renderPreview = () => {
    const title = fields('title').value.trim();
    const content = fields('content').value.trim();
    preview.querySelector('.preview-category').textContent = fields('category').value.trim() || 'Actualités';
    preview.querySelector('.preview-title').textContent = title || 'Titre de votre article';
    preview.querySelector('.preview-excerpt').textContent = fields('excerpt').value.trim();
    preview.querySelector('.preview-excerpt').hidden = !fields('excerpt').value.trim();
    const body = preview.querySelector('.preview-content');
    body.replaceChildren();
    body.innerHTML = renderArticleMarkup(content);
    const image = preview.querySelector('.preview-cover');
    const imageUrl = fields('cover_image_url').value.trim();
    if (/^https:\/\//i.test(imageUrl)) {
      image.src = imageUrl;
      image.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
    }
  };
  el.querySelector('#close').onclick = () => { el.hidden = true; };
  el.querySelector('#choose-media').onclick = () => { const saved = Object.fromEntries(new FormData(form).entries()); mediaReturn = url => { saved.cover_image_url = new URL(url, location.origin).href; articlesPage().then(() => editor(saved)); }; mediaPage(); };
  el.querySelector('#preview-toggle').onclick = event => {
    preview.hidden = !preview.hidden;
    event.currentTarget.textContent = preview.hidden ? 'Aperçu de l’article' : 'Masquer l’aperçu';
    if (!preview.hidden) {
      renderPreview();
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  form.addEventListener('input', () => { if (!preview.hidden) renderPreview(); });
  form.onsubmit = async e => {
    e.preventDefault(); const submit = e.submitter;
    const values = Object.fromEntries(new FormData(form).entries()); values.id = values.id ? Number(values.id) : null; values.status = submit.value;
    submit.disabled = true;
    try { await call('/api/admin/articles', { method: 'POST', body: JSON.stringify(values) }); await dashboard(); }
    catch (err) { form.querySelector('.admin-message').textContent = err.message; submit.disabled = false; }
  };
  el.querySelector('#archive')?.addEventListener('click', async () => {
    if (!confirm('Archiver cet article ?')) return;
    try { await call('/api/admin/articles/' + a.id, { method: 'DELETE' }); await dashboard(); }
    catch (err) { el.querySelector('.admin-message').textContent = err.message; }
  });
}
if (location.pathname === '/admin' || location.pathname === '/admin/') {
  if (new URLSearchParams(location.search).has('reset-password')) passwordReset();
  else dashboard();
}
