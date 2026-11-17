import './style.css';
if (/^\/admin\/?$/.test(location.pathname)) {
  import('./admin.js');
} else {
const nav = [
  ['Accueil', '#accueil'],
  ['Actualités', '#actualites'],
  ['Nos revendications', '#revendications'],
  ['Vos droits', '#droits'],
  ['Questionnaires', '#questionnaires'],
  ['Contact', '#contact'],
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
          <a class="button button-outline" href="#contact">Nous contacter</a>
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
      <a class="text-link" href="#contact">Une question ? Contactez FO <span>→</span></a>
    </section>

    <section class="section survey-section" id="questionnaires">
      <div><span class="eyebrow">Votre avis compte</span><h2>Questionnaires & consultations</h2><p>Des consultations pourront être proposées aux salariés de Free Distributions pour recueillir leurs attentes et faire remonter leurs priorités.</p></div>
      <div class="survey-symbol">?</div>
    </section>

    <section class="contact-section" id="contact">
      <div><span class="eyebrow">Restons en contact</span><h2>Votre voix compte.</h2><p>Une question, une difficulté ou une idée à partager ? L’équipe FO Free Distributions sera à votre écoute.</p></div>
      <a class="button button-white" href="mailto:contact@focom-iliad.fr?subject=FO%20Free%20Distributions">Écrire à FO <span>→</span></a>
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

}
