<script lang="ts">
  import { lang, t } from '../lib/i18n.ts';
  let { onUnlock, onLogout } = $props();

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function unlock() {
    if (!username.trim() || !password.trim()) return;
    loading = true;
    error = '';
    try {
      const token = localStorage.getItem('bankapp_token');
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      if (res.status === 401) {
        error = $t('Identifiants incorrects.');
        password = '';
      } else if (res.ok) {
        onUnlock();
      } else {
        error = $t('Erreur lors de la vérification.');
        password = '';
      }
    } catch {
      error = $t('Impossible de contacter le serveur.');
    } finally {
      loading = false;
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') unlock();
  }
</script>

<div class="lock-overlay">
  <div class="lock-card">
    <div class="lock-icon">🔒</div>
    <h2>{$t('Session verrouillée')}</h2>
    <p class="sub">{$t('Inactivité détectée. Entrez vos identifiants pour reprendre.')}</p>
    <input
      type="text"
      bind:value={username}
      onkeydown={onKey}
      placeholder={$t('Nom d\'utilisateur')}
      autofocus
      disabled={loading}
    />
    <input
      type="password"
      bind:value={password}
      onkeydown={onKey}
      placeholder={$t('Mot de passe')}
      disabled={loading}
    />
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <button class="btn-unlock" onclick={unlock} disabled={loading || !username.trim() || !password.trim()}>
      {loading ? $t('Vérification…') : $t('Déverrouiller')}
    </button>
    <button class="btn-logout" onclick={onLogout}>
      {$t('Se déconnecter')}
    </button>
  </div>
</div>

<style>
  .lock-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(18px) saturate(0.6);
    -webkit-backdrop-filter: blur(18px) saturate(0.6);
  }
  .lock-card {
    background: var(--card, white);
    border-radius: 18px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.22);
    padding: 2.5rem 2rem;
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    text-align: center;
    animation: pop-in 0.18s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes pop-in {
    from { transform: scale(0.92); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .lock-icon { font-size: 2.2rem; }
  h2 { margin: 0; font-size: 1.3rem; color: var(--text-1, #1e293b); }
  .sub { margin: 0; font-size: 0.82rem; color: var(--text-3, #94a3b8); line-height: 1.4; }
  input {
    padding: 0.72rem 1rem;
    border: 1.5px solid var(--border, #e2e8f0);
    border-radius: 8px;
    font-size: 1rem;
    background: var(--card, white);
    color: var(--text-1, #1e293b);
    outline: none;
    transition: border-color 0.2s;
  }
  input:focus { border-color: #3b82f6; }
  .btn-unlock {
    padding: 0.72rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-unlock:hover:not(:disabled) { background: #1d4ed8; }
  .btn-unlock:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-logout {
    background: none;
    border: none;
    color: var(--text-3, #94a3b8);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    transition: color 0.15s;
  }
  .btn-logout:hover { color: #dc2626; }
  .error { color: #dc2626; font-size: 0.82rem; margin: 0; }
</style>
