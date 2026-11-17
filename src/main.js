import './style.css';
if (/^\/admin\/?$/.test(location.pathname)) {
  import('./admin.js');
} else if (/^\/contact\/?$/.test(location.pathname)) {
  document.querySelector('#app').innerHTML = `
    <header class="site-header">
      <a class="brand" href="/" aria-label="FO Free Distributions, accueil">
        <span class="fo-mark">FO</span>
        <span class="brand-copy"><strong>FOCOM</strong><b><em>Free</em> Distributions</b><small>Le syndicat des salariés de Free Distributions</small></span>
      </a>
      <a class="button button-outline" href="/">← Retour à l'accueil</a>
    </header>
    <main class="contact-page">
      <section class="contact-page-hero">
        <span class="eyebrow">FO Free Distributions</span>
        <h1>Contactez <span>FO.</span></h1>
        <p>Une question, une difficulté au travail, une suggestion ou besoin d'un échange ? L'équipe FO Free Distributions est à votre écoute.</p>
      </section>
      <section class="contact-page-card contact-form-card">
        <div class="contact-icon" aria-hidden="true">✉</div>
        <div>
          <span class="eyebrow">Écrivez-nous</span>
          <h2>Envoyer un message à l'équipe FO</h2>
          <p>Votre message sera transmis à l'équipe FO Free Distributions. Les champs marqués d'un astérisque sont obligatoires.</p>
          <form id="fd-contact-form" class="contact-form">
            <label>Nom et prénom <span>(facultatif)</span><input name="name" type="text" maxlength="120" autocomplete="name" placeholder="Votre nom"></label>
            <label>Adresse e-mail <b>*</b><input name="email" type="email" maxlength="254" required autocomplete="email" placeholder="vous@exemple.fr"></label>
            <label>Objet <b>*</b><input name="subject" type="text" maxlength="160" required placeholder="Objet de votre demande"></label>
            <label>Votre message <b>*</b><textarea name="message" rows="7" minlength="10" maxlength="5000" required placeholder="Décrivez votre demande (5 000 caractères maximum)."></textarea></label>
            <div class="contact-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
            <p class="contact-form-privacy">Les informations saisies sont utilisées uniquement pour répondre à votre demande. Votre adresse e-mail sera utilisée pour vous répondre et ne sera pas affichée sur le site.</p>
            <button class="button button-red" type="submit">Envoyer le message <span>→</span></button>
            <p id="contact-message" class="contact-message" role="status" aria-live="polite"></p>
          </form>
        </div>
      </section>
      <section class="contact-page-note">
        <h2>Vous souhaitez partager une préoccupation ?</h2>
        <p>Vous pouvez également consulter le <a href="/#questionnaires">questionnaire destiné aux salariés</a> pour faire connaître vos attentes et vos priorités de manière anonyme.</p>
      </section>
    </main>
    <footer class="site-footer"><a class="footer-brand" href="/"><strong>FO</strong> FOCOM · Free Distributions</a><span>À l'écoute des salariés</span><a href="/">Retour à l'accueil ↑</a></footer>
  `;
} else {
const nav = [
  ['Accueil', '#accueil'],
  ['Actualités', '#actualites'],
  ['Nos revendications', '#revendications'],
  ['Vos droits', '#droits'],
  ['Questionnaires', '#questionnaires'],
  ['Contact', '/contact'],
];

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#accueil" aria-label="FO Free Distributions, accueil">
      <span class="fo-mark">FO</span>
      <span class="brand-copy"><strong>FOCOM</strong><b><em>Free</em> Distributions</b><small>Le syndicat des salariés de Free Distributions</small></span>
    </a>
    <button class="menu-toggle" aria-label="Ouvrir le menu" aria-expanded="false">☰</button>
    <nav class="main-nav" aria-label="Navigation principale">
      ${nav.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}
    </nav>
  </header>

  <main>
    <section class="hero" id="accueil">
      <div class="hero-content">
        <span class="eyebrow">FOCOM · Free Distributions</span>
        <h1>La voix des salariés<br><span>des boutiques Free.</span></h1>
        <p>Un espace d’information, de dialogue et d’action syndicale dédié aux équipes de Free Distributions.</p>
        <div class="hero-actions">
          <a class="button button-red" href="#revendications">Nos revendications</a>
          <a class="button button-outline" href="/contact">Nous contacter</a>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="store">
          <div class="store-awning"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="store-sign">free</div>
          <div class="store-window">
            <span class="device phone"></span><span class="device box"></span>
            <span class="wifi">⌁</span><span class="people">● ●</span>
          </div>
          <div class="store-base"></div>
        </div>
        <div class="visual-caption">Écouter · Informer · Défendre</div>
      </div>
    </section>

    <section class="intro section">
      <div><span class="eyebrow">Notre engagement</span><h2>À vos côtés, <span>au quotidien.</span></h2></div>
      <p>La vente, le conseil et l’accompagnement des clients en boutique mobilisent des compétences et un engagement essentiels. FO Free Distributions porte la parole des salariés et défend leurs intérêts professionnels.</p>
    </section>

    <section class="section light-section" id="actualites">
      <div class="section-heading"><div><span class="eyebrow">Restez informés</span><h2>Actualités</h2></div><span class="section-note">Les informations dédiées à Free Distributions</span></div>
      <div id="articles-list" aria-live="polite">
        <div class="empty-state"><span class="empty-icon">✦</span><h3>Chargement des actualités…</h3><p>Nous récupérons les dernières publications.</p></div>
      </div>
    </section>

    <section class="section" id="revendications">
      <span class="eyebrow">Faire entendre votre voix</span><h2>Nos priorités</h2>
      <div class="cards">
        <article class="info-card"><span class="card-number">01</span><h3>Rémunération</h3><p>Salaires, primes, commissions et reconnaissance du travail réalisé en boutique.</p></article>
        <article class="info-card"><span class="card-number">02</span><h3>Conditions de travail</h3><p>Organisation des équipes, horaires, charge de travail et moyens mis à disposition.</p></article>
        <article class="info-card"><span class="card-number">03</span><h3>Formation & évolution</h3><p>Accompagnement des compétences, parcours professionnels et perspectives d’évolution.</p></article>
      </div>
      <p class="disclaimer">Ces thèmes constituent les axes de présentation du site. Les revendications officielles seront publiées après validation par les représentants FO.</p>
    </section>

    <section class="section light-section" id="droits">
      <div class="section-heading"><div><span class="eyebrow">Mieux connaître vos droits</span><h2>Vos droits au travail</h2></div></div>
      <p class="section-lead">Des repères pratiques pour comprendre vos droits et savoir vers qui vous tourner. Les contenus détaillés seront publiés prochainement.</p>
      <a class="text-link" href="/contact">Une question ? Contactez FO <span>→</span></a>
    </section>

    <section class="section light-section survey-section" id="questionnaires">
      <div class="survey-intro">
        <span class="eyebrow">Votre avis compte</span>
        <h2>Donnez votre avis <span>en toute confidentialité.</span></h2>
        <p>Cette consultation permet de faire remonter les attentes et les priorités des salariés de Free Distributions. Vos réponses sont enregistrées sans nom ni adresse e-mail.</p>
        <div class="survey-privacy"><strong>Questionnaire anonyme</strong><span>Aucun nom ni e-mail n'est demandé. Évitez toutefois de mentionner des personnes ou des informations permettant de vous identifier dans votre commentaire.</span></div>
      </div>
      <form id="fd-survey-form" class="survey-form">
        <fieldset class="survey-question">
          <legend><span>01</span> Comment évaluez-vous globalement vos conditions de travail ? <b>*</b></legend>
          <div class="rating-options">
            <label><input type="radio" name="conditions" value="1" required><span>1</span><small>Très mauvaises</small></label>
            <label><input type="radio" name="conditions" value="2"><span>2</span><small>Mauvaises</small></label>
            <label><input type="radio" name="conditions" value="3"><span>3</span><small>Moyennes</small></label>
            <label><input type="radio" name="conditions" value="4"><span>4</span><small>Bonnes</small></label>
            <label><input type="radio" name="conditions" value="5"><span>5</span><small>Très bonnes</small></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>02</span> Quels sujets devraient être prioritaires ? <b>*</b></legend>
          <p class="survey-hint">Plusieurs choix possibles.</p>
          <div class="priority-options">
            <label><input type="checkbox" name="priorities" value="salary"><span>Salaires et pouvoir d'achat</span></label>
            <label><input type="checkbox" name="priorities" value="commissions"><span>Primes et commissions</span></label>
            <label><input type="checkbox" name="priorities" value="staffing"><span>Effectifs et moyens en boutique</span></label>
            <label><input type="checkbox" name="priorities" value="schedules"><span>Horaires et équilibre vie professionnelle / personnelle</span></label>
            <label><input type="checkbox" name="priorities" value="workload"><span>Charge et organisation du travail</span></label>
            <label><input type="checkbox" name="priorities" value="training"><span>Formation</span></label>
            <label><input type="checkbox" name="priorities" value="career"><span>Évolution professionnelle</span></label>
            <label><input type="checkbox" name="priorities" value="management"><span>Management et communication</span></label>
            <label><input type="checkbox" name="priorities" value="health"><span>Santé, sécurité et conditions de travail</span></label>
            <label><input type="checkbox" name="priorities" value="recognition"><span>Reconnaissance du travail</span></label>
            <label><input type="checkbox" name="priorities" value="other"><span>Autre sujet</span></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>03</span> Vous sentez-vous reconnu(e) pour le travail que vous accomplissez ? <b>*</b></legend>
          <div class="rating-options">
            <label><input type="radio" name="recognition" value="1" required><span>1</span><small>Pas du tout</small></label>
            <label><input type="radio" name="recognition" value="2"><span>2</span><small>Peu</small></label>
            <label><input type="radio" name="recognition" value="3"><span>3</span><small>Moyennement</small></label>
            <label><input type="radio" name="recognition" value="4"><span>4</span><small>Bien</small></label>
            <label><input type="radio" name="recognition" value="5"><span>5</span><small>Tout à fait</small></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>04</span> Quelle amélioration vous paraît la plus urgente ?</legend>
          <textarea name="comment" rows="5" maxlength="1500" placeholder="Exprimez librement vos attentes ou vos propositions (1 500 caractères maximum). Ne mentionnez pas de nom ni d'information permettant de vous identifier."></textarea>
          <p class="survey-hint"><span id="survey-char-count">0</span> / 1 500 caractères · réponse facultative</p>
        </fieldset>
        <div class="survey-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
        <div class="survey-submit-row">
          <p>Les réponses sont utilisées pour établir une synthèse collective des attentes exprimées.</p>
          <button class="button button-red" type="submit">Envoyer mes réponses <span>→</span></button>
        </div>
        <p id="survey-message" class="survey-message" role="status" aria-live="polite"></p>
      </form>
    </section>

    <section class="contact-section" id="contact">
      <div><span class="eyebrow">Restons en contact</span><h2>Votre voix compte.</h2><p>Une question, une difficulté ou une idée à partager ? L’équipe FO Free Distributions sera à votre écoute.</p></div>
      <a class="button button-white" href="/contact">Nous contacter <span>→</span></a>
    </section>
  </main>

  <footer class="site-footer"><a class="footer-brand" href="#accueil"><strong>FO</strong> FOCOM · Free Distributions</a><span>Un site dédié aux salariés de Free Distributions</span><a href="#accueil">Retour en haut ↑</a></footer>
`;

const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.main-nav');
toggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}));

// Public articles are served by the Worker; draft and archived content never reaches this page.
const articlesList = document.querySelector('#articles-list');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

async function loadArticles() {
  try {
    const response = await fetch('/api/articles', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Articles indisponibles');
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];

    if (!articles.length) {
      articlesList.innerHTML = `<div class="empty-state"><span class="empty-icon">✦</span><h3>Les actualités arrivent bientôt</h3><p>Retrouvez ici les informations, prises de position et communications de FO Free Distributions.</p></div>`;
      return;
    }

    articlesList.innerHTML = `<div class="article-grid">${articles.map(article => {
      const date = article.published_at
        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(article.published_at))
        : '';
      return `<article class="article-card">
        <span class="article-category">${escapeHtml(article.category)}</span>
        <h3>${escapeHtml(article.title)}</h3>
        ${article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : ''}
        ${date ? `<time datetime="${escapeHtml(article.published_at)}">${escapeHtml(date)}</time>` : ''}
      </article>`;
    }).join('')}</div>`;
  } catch (error) {
    console.error('Chargement des actualités impossible:', error);
    articlesList.innerHTML = `<div class="empty-state"><h3>Actualités momentanément indisponibles</h3><p>Merci de réessayer dans quelques instants.</p></div>`;
  }
}

loadArticles();

// Contact form: sends messages through the Worker to the FO mailbox.
const contactForm = document.querySelector('#fd-contact-form');
if (contactForm) {
  const contactStatus = document.querySelector('#contact-message');
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = contactForm.querySelector('button[type="submit"]');
    const data = new FormData(contactForm);
    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    contactStatus.textContent = '';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') || ''),
          email: String(data.get('email') || ''),
          subject: String(data.get('subject') || ''),
          message: String(data.get('message') || ''),
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible d’envoyer votre message.');
      contactForm.reset();
      contactStatus.textContent = result.message || 'Votre message a bien été envoyé.';
      contactStatus.className = 'contact-message is-success';
    } catch (error) {
      contactStatus.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      contactStatus.className = 'contact-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Envoyer le message <span>→</span>';
    }
  });
}

// Anonymous employee questionnaire. No name, email or IP address is requested or stored by this endpoint.
const surveyForm = document.querySelector('#fd-survey-form');
if (surveyForm) {
  const surveyMessage = document.querySelector('#survey-message');
  const commentField = surveyForm.elements.namedItem('comment');
  const charCount = document.querySelector('#survey-char-count');
  commentField.addEventListener('input', () => { charCount.textContent = String(commentField.value.length); });
  surveyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = surveyForm.querySelector('button[type="submit"]');
    const data = new FormData(surveyForm);
    const priorities = data.getAll('priorities');
    if (!priorities.length) {
      surveyMessage.textContent = 'Merci de sélectionner au moins un sujet prioritaire.';
      surveyMessage.className = 'survey-message is-error';
      surveyForm.querySelector('.priority-options').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    surveyMessage.textContent = '';
    try {
      const response = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          conditions: Number(data.get('conditions')),
          recognition: Number(data.get('recognition')),
          priorities,
          comment: String(data.get('comment') || ''),
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible d’enregistrer vos réponses.');
      surveyForm.reset();
      charCount.textContent = '0';
      surveyMessage.textContent = result.message || 'Merci pour votre participation.';
      surveyMessage.className = 'survey-message is-success';
    } catch (error) {
      surveyMessage.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      surveyMessage.className = 'survey-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Envoyer mes réponses <span>→</span>';
    }
  });
}



}
