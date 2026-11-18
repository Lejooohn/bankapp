<script lang="ts">
  import { login, verifyMfa } from '../lib/api.js';
  import { lang, t } from '../lib/i18n.ts';

  let { onLogin } = $props();

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let showPassword = $state(false);
  // Second step: set after a correct password when the account has a second factor.
  let mfaToken = $state('');
  let code = $state('');
  let remember = $state(false);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return;
    loading = true;
    error = '';
    try {
      const result = await login(username, password);
      if (result.mfaRequired) {
        mfaToken = result.mfaToken;
        password = '';
        code = '';
      } else {
        onLogin();
      }
    } catch (err) {
      error = err.message || $t('Erreur de connexion');
    } finally {
      loading = false;
    }
  }

  async function handleMfa() {
    if (!code.trim()) return;
    loading = true;
    error = '';
    try {
      await verifyMfa(mfaToken, code.trim(), remember);
      onLogin();
    } catch (err) {
      error = err.message || $t('Erreur de connexion');
    } finally {
      loading = false;
    }
  }

  function backToPassword() {
    mfaToken = '';
    code = '';
    error = '';
  }

  function onKey(e) {
    if (e.key === 'Enter') (mfaToken ? handleMfa() : handleLogin());
  }

  function toggleShowPassword() {
    showPassword = !showPassword;
  }
</script>

<div class="login-wrap">
  <div class="login-card">
    <div class="login-icon">🏦</div>
    <h1>BankApp</h1>

    {#if mfaToken}
      <p class="subtitle">{$t('Code de vérification')}</p>
      <input
        type="text"
        inputmode="text"
        autocomplete="one-time-code"
        bind:value={code}
        onkeydown={onKey}
        placeholder={$t('Code à 6 chiffres ou code de secours')}
        autofocus
        disabled={loading}
      />
      <label class="remember">
        <input type="checkbox" bind:checked={remember} disabled={loading} />
        {$t('Se souvenir de cet appareil pendant 20 jours')}
      </label>
      {#if error}
        <p class="error">{error}</p>
      {/if}
      <button onclick={handleMfa} disabled={loading || !code.trim()}>
        {loading ? '...' : $t('Vérifier')}
      </button>
      <button type="button" class="secondary" onclick={backToPassword} disabled={loading}>{$t('Retour')}</button>
    {:else}
    <p class="subtitle">{$t('Se connecter à votre profil')}</p>

    <input
      type="text"
      bind:value={username}
      onkeydown={onKey}
      placeholder={$t('Nom d\'utilisateur')}
      autofocus
      disabled={loading}
    />

    <div class="password-input-wrapper">
      <input
        type={showPassword ? 'text' : 'password'}
        value={password}
        oninput={(e) => password = (e.target as HTMLInputElement).value}
        onkeydown={onKey}
        placeholder={$t('Mot de passe')}
        disabled={loading}
      />
      <button type="button" class="toggle-password" onclick={toggleShowPassword} title={$t('Montrer/Cacher')} aria-label={$t('Montrer/Cacher le mot de passe')}>
        {#if showPassword}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.9 18.9 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.9 18.9 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
        {/if}
      </button>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button onclick={handleLogin} disabled={loading || !username.trim() || !password.trim()}>
      {loading ? '...' : $t('Se connecter')}
    </button>
    {/if}
  </div>
</div>

<style>
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--login-gradient);
  }
  .login-card {
    background: var(--card);
    border-radius: 16px;
    box-shadow: 0 8px 32px var(--shadow-modal);
    padding: 2.5rem 2rem;
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  .login-icon { font-size: 2.5rem; }
  h1 { margin: 0; font-size: 1.6rem; color: var(--cobalt); }
  .subtitle { margin: 0; color: var(--text-2); font-size: 0.9rem; }
  input {
    padding: 0.75rem 1rem;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
    background: var(--input-bg);
    color: var(--text-1);
    transition: border-color 0.2s;
  }
  input:focus { border-color: var(--cobalt); }
  input:disabled { opacity: 0.6; cursor: not-allowed; }
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px var(--input-bg) inset !important;
    -webkit-text-fill-color: var(--text-1) !important;
    caret-color: var(--text-1);
    transition: background-color 9999s ease-in-out 0s;
  }
  button {
    padding: 0.75rem;
    background: var(--cobalt);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover:not(:disabled) { background: #1d4ed8; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .remember { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-2); }
  .remember input { padding: 0; }
  button.secondary { background: transparent; color: var(--cobalt); border: 1.5px solid var(--border); }
  button.secondary:hover:not(:disabled) { background: transparent; }
  .error { color: #991b1b; font-size: 0.85rem; margin: 0; background: #fee2e2; padding: 8px; border-radius: 6px; }
  .password-input-wrapper {
    position: relative;
    width: 100%;
  }
  .password-input-wrapper input {
    width: 100%;
    padding-right: 2.5rem;
  }
  .toggle-password {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    padding: 4px;
    width: auto;
    height: auto;
    line-height: 1;
  }
  .toggle-password:hover {
    color: var(--cobalt);
    background: transparent;
  }
  .toggle-password:focus {
    outline: none;
    box-shadow: none;
  }
</style>
