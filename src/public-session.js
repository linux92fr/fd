import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient('https://ep-crimson-wave-b972yi2i.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth');
const roleLabels = {
  admin: 'Super administrateur',
  admin_delegate: 'Administrateur délégué',
  editor: 'Rédacteur',
  employee: 'Salarié / adhérent',
};

async function installPublicAccountHeader() {
  const header = document.querySelector('.site-header');
  if (!header || header.querySelector('.public-account-tools')) return;

  try {
    const result = await auth.token();
    const jwt = result?.data?.token;
    if (!jwt) return;

    const response = await fetch('/api/admin/overview', {
      headers: { Authorization: 'Bearer ' + jwt, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return;
    const data = await response.json();
    const user = data.user || {};
    if (!user.email || !roleLabels[user.role]) return;

    const tools = document.createElement('div');
    tools.className = 'public-account-tools';
    tools.innerHTML = `
      <span class="public-session-chip" title="Session connectée">
        <span class="public-session-dot" aria-hidden="true"></span>
        <span class="public-session-copy"><strong>${escapeHtml(user.name || user.email)}</strong><small>${roleLabels[user.role]}</small></span>
      </span>
      <button class="public-notification-placeholder" type="button" disabled aria-label="Notifications — bientôt disponible" title="Notifications et messagerie interne : bientôt disponibles">
        <span aria-hidden="true">♧</span>
      </button>
    `;
    header.append(tools);
  } catch {
    // Public pages remain fully usable when no authenticated admin session exists.
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installPublicAccountHeader, { once: true });
} else {
  installPublicAccountHeader();
}
