<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { stopPropagation } from '../lib/events';
  import { t } from '../lib/i18n.ts';
  import { getMfaStatus, startMfaEnrolment, confirmMfaEnrolment, disableMfa } from '../lib/api.js';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let status = $state<{ enabled: boolean; recovery_codes_remaining: number } | null>(null);
  // idle: status only. start: password needed to get a key. enrol: enter the key, then confirm.
  // codes: shown once. disable: turn off.
  let step = $state<'idle' | 'start' | 'enrol' | 'codes' | 'disable'>('idle');
  let secret = $state('');
  let otpauth = $state('');
  let qrDataUrl = $state('');
  let code = $state('');
  let password = $state('');
  let recoveryCodes = $state<string[]>([]);
  let error = $state('');
  let busy = $state(false);

  function message(err: unknown): string {
    return err instanceof Error ? err.message : $t('Une erreur est survenue');
  }

  async function refresh() {
    try {
      status = await getMfaStatus();
    } catch (err) {
      error = message(err);
    }
  }

  onMount(refresh);

  function reset() {
    step = 'idle';
    code = '';
    password = '';
    error = '';
  }

  function beginEnrolment() {
    password = '';
    error = '';
    step = 'start';
  }

  // Activation starts by asking for the password again: a session alone may not add a factor.
  async function startEnrolment() {
    busy = true;
    error = '';
    try {
      const r = await startMfaEnrolment(password);
      secret = r.secret;
      otpauth = r.otpauth;
      // Rendered in the browser from the otpauth URI: the QR code never leaves the page.
      qrDataUrl = await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220 });
      code = '';
      step = 'enrol';
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  async function confirmEnrolment() {
    busy = true;
    error = '';
    try {
      const r = await confirmMfaEnrolment(password, code.trim());
      recoveryCodes = r.recovery_codes;
      code = '';
      step = 'codes';
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  // Builds a plain-text file in the browser; nothing is sent anywhere.
  function downloadRecoveryCodes() {
    const lines = [
      $t('Codes de secours BankApp'),
      `${$t('Généré le')} ${new Date().toISOString().slice(0, 10)}`,
      '',
      ...recoveryCodes,
      '',
      $t('Chaque code ne fonctionne qu’une fois. Conservez ce fichier en lieu sûr.'),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bankapp-codes-secours.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function finishCodes() {
    recoveryCodes = [];
    secret = '';
    otpauth = '';
    qrDataUrl = '';
    reset();
    await refresh();
  }

  async function turnOff() {
    busy = true;
    error = '';
    try {
      await disableMfa(password, code.trim());
      reset();
      await refresh();
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="modal-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
  <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="dialog" aria-modal="true" aria-label={$t('Double authentification')}>
    <div class="modal-header">
      <h2>{$t('Double authentification')}</h2>
      <button class="close-btn" onclick={onClose} title={$t('Fermer')} aria-label={$t('Fermer')}>✕</button>
    </div>

    <div class="modal-body">
      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if step === 'idle'}
        {#if status === null}
          <p class="muted">…</p>
        {:else if status.enabled}
          <p>{$t('La double authentification est activée.')}</p>
          <p class="muted">{$t('Codes de secours restants')} : {status.recovery_codes_remaining}</p>
          <button class="danger" onclick={() => { step = 'disable'; error = ''; }}>{$t('Désactiver la double authentification')}</button>
        {:else}
          <p>{$t('La double authentification est désactivée.')}</p>
          <button class="primary" onclick={beginEnrolment} disabled={busy}>{$t('Activer')}</button>
        {/if}

      {:else if step === 'start'}
        <p>{$t('Confirmez votre mot de passe pour continuer.')}</p>
        <input type="password" bind:value={password} placeholder={$t('Mot de passe')} autocomplete="current-password" />
        <div class="row">
          <button class="secondary" onclick={reset} disabled={busy}>{$t('Annuler')}</button>
          <button class="primary" onclick={startEnrolment} disabled={busy || !password}>{$t('Continuer')}</button>
        </div>

      {:else if step === 'enrol'}
        <p>{$t('Ajoutez ce compte dans votre application d’authentification, ou saisissez la clé manuellement.')}</p>
        {#if qrDataUrl}
          <img class="qr" src={qrDataUrl} alt={$t('QR code à scanner avec votre application d’authentification')} width="220" height="220" />
        {/if}
        <p class="muted">{$t('Clé')} : <code class="secret">{secret}</code></p>
        <p><a href={otpauth}>{$t('Ouvrir dans l’application')}</a></p>
        <p class="muted">{$t('Entrez le code affiché par votre application pour confirmer.')}</p>
        <input type="text" inputmode="numeric" autocomplete="one-time-code" bind:value={code} placeholder="123456" />
        <div class="row">
          <button class="secondary" onclick={reset} disabled={busy}>{$t('Annuler')}</button>
          <button class="primary" onclick={confirmEnrolment} disabled={busy || code.trim().length !== 6}>{$t('Confirmer')}</button>
        </div>

      {:else if step === 'codes'}
        <p>{$t('Conservez ces codes en lieu sûr. Chacun ne fonctionne qu’une fois. Ils ne seront plus affichés.')}</p>
        <h3>{$t('Codes de secours')}</h3>
        <ul class="codes">
          {#each recoveryCodes as recovery (recovery)}
            <li><code>{recovery}</code></li>
          {/each}
        </ul>
        <div class="row">
          <button class="secondary" onclick={downloadRecoveryCodes}>{$t('Télécharger (.txt)')}</button>
          <button class="primary" onclick={finishCodes}>{$t('Terminé')}</button>
        </div>

      {:else if step === 'disable'}
        <input type="password" bind:value={password} placeholder={$t('Mot de passe')} autocomplete="current-password" />
        <input type="text" inputmode="text" autocomplete="one-time-code" bind:value={code} placeholder={$t('Code à 6 chiffres ou code de secours')} />
        <div class="row">
          <button class="secondary" onclick={reset} disabled={busy}>{$t('Annuler')}</button>
          <button class="danger" onclick={turnOff} disabled={busy || !password || !code.trim()}>{$t('Désactiver')}</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
  .modal-card { background: var(--surface, #fff); color: var(--text-1); border-radius: 12px; width: min(440px, 100%); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  h2 { margin: 0; font-size: 1.1rem; }
  h3 { margin: 12px 0 6px; font-size: 0.95rem; }
  .modal-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
  .close-btn { background: transparent; border: none; color: var(--text-2); cursor: pointer; font-size: 1rem; }
  .muted { color: var(--text-2); font-size: 0.9rem; margin: 0; }
  .secret { word-break: break-all; }
  .qr { align-self: center; background: #fff; padding: 8px; border-radius: 8px; }
  .codes { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .codes code { font-size: 1rem; }
  .row { display: flex; gap: 8px; justify-content: flex-end; }
  input { padding: 0.6rem 0.8rem; border: 1.5px solid var(--border); border-radius: 8px; background: var(--input-bg); color: var(--text-1); font-size: 1rem; }
  button { padding: 0.6rem 0.9rem; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button.primary { background: var(--cobalt, #2563eb); color: #fff; }
  button.secondary { background: transparent; color: var(--cobalt, #2563eb); border: 1.5px solid var(--border); }
  button.danger { background: #b91c1c; color: #fff; }
  .error-message { color: #991b1b; background: #fee2e2; padding: 8px; border-radius: 6px; font-size: 0.9rem; }
</style>
