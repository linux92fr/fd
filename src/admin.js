import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient('https://ep-sweet-resonance-b9ov2yaa.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth');
const root = document.querySelector('#app');
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
    const { articles = [] } = await call('/api/admin/articles');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Gestion du contenu</span><h1>Actualités</h1><p>Créer, modifier et publier les communications FO.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Articles (' + articles.length + ')</h2><button id="new" class="button button-red">＋ Nouvel article</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Titre</th><th>Catégorie</th><th>Statut</th><th></th></tr></thead><tbody>' + (articles.length ? articles.map(a => '<tr><td><b>' + esc(a.title) + '</b><small>' + esc(a.slug) + '</small></td><td>' + esc(a.category) + '</td><td>' + esc(a.status) + '</td><td><button class="text-button edit" data-id="' + a.id + '">Modifier</button></td></tr>').join('') : '<tr><td colspan="4">Aucun article pour le moment.</td></tr>') + '</tbody></table></div></section><section id="editor" class="admin-panel" hidden></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#new').onclick = () => editor();
    root.querySelectorAll('.edit').forEach(b => b.onclick = () => editor(articles.find(a => String(a.id) === b.dataset.id)));
  } catch (err) { login('Diagnostic de connexion : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
function editor(a = {}) {
  const el = root.querySelector('#editor'); el.hidden = false;
  el.innerHTML = '<div class="admin-toolbar"><h2>' + (a.id ? 'Modifier' : 'Nouvel') + ' article</h2><button id="close" class="text-button">Fermer</button></div><form id="article-form" class="article-form"><input type="hidden" name="id" value="' + esc(a.id || '') + '"><label>Titre<input name="title" maxlength="180" required value="' + esc(a.title || '') + '"></label><label>Slug<input name="slug" maxlength="180" value="' + esc(a.slug || '') + '"></label><label>Catégorie<input name="category" maxlength="80" value="' + esc(a.category || 'Actualités') + '"></label><label>Résumé<textarea name="excerpt" maxlength="320" rows="2">' + esc(a.excerpt || '') + '</textarea></label><label>Contenu<textarea name="content" rows="10" required>' + esc(a.content || '') + '</textarea></label><label>Image (URL HTTPS)<input name="cover_image_url" type="url" value="' + esc(a.cover_image_url || '') + '"></label><div class="admin-form-actions"><button class="button button-outline-dark" name="status" value="draft">Enregistrer le brouillon</button><button class="button button-red" name="status" value="published">Publier</button>' + (a.id ? '<button type="button" id="archive" class="text-button">Archiver</button>' : '') + '</div><p class="admin-message" role="status"></p></form>';
  el.querySelector('#close').onclick = () => { el.hidden = true; };
  el.querySelector('#article-form').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget; const submit = e.submitter;
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
