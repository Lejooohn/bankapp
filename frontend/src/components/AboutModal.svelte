<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  // "À propos": application version, build commit and the main tools in use.
  let { onclose }: { onclose: () => void } = $props();

  let info: any = $state(null);
  let error = $state('');
  const frontendLibs: Record<string, string> = __FRONTEND_LIBS__;

  onMount(async () => {
    try {
      info = await api.get('/api/about');
    } catch (e: any) {
      error = e.message || $t('Erreur');
    }
  });
</script>

<div class="modal-overlay" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={(e) => e.key === 'Escape' && onclose()} role="presentation">
  <div class="modal-box" role="dialog" aria-modal="true" style="width:460px;">
    <div class="modal-header">
      <span class="modal-title">{$t('À propos')}</span>
    </div>
    <div class="modal-body">
      {#if error}
        <div class="error-banner">{error}</div>
      {:else if !info}
        <div class="state-loading">{$t('Chargement…')}</div>
      {:else}
        <h3 class="about-title">BankApp {info.app.version}</h3>
        <table class="about-table">
          <tbody>
            <tr><th>{$t('Version')}</th><td>{info.app.version}</td></tr>
            <tr><th>{$t('Commit')}</th><td><code>{info.app.commit}</code></td></tr>
            <tr><th>Node.js</th><td>{info.runtime.node}</td></tr>
            <tr><th>PostgreSQL</th><td>{info.runtime.postgres}</td></tr>
          </tbody>
        </table>

        <h4 class="about-section">{$t('Bibliothèques backend')}</h4>
        <table class="about-table">
          <tbody>
            {#each Object.entries(info.backend.libraries) as [name, version] (name)}
              <tr><th>{name}</th><td>{version}</td></tr>
            {/each}
          </tbody>
        </table>

        <h4 class="about-section">{$t('Bibliothèques frontend')}</h4>
        <table class="about-table">
          <tbody>
            {#each Object.entries(frontendLibs) as [name, version] (name)}
              <tr><th>{name}</th><td>{version}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={onclose}>{$t('Fermer')}</button>
    </div>
  </div>
</div>

<style>
  .about-title { font-size: 15px; font-weight: 600; margin: 0 0 12px; color: var(--text-1); }
  .about-section { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); margin: 16px 0 6px; }
  .about-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .about-table th { text-align: left; font-weight: 500; color: var(--text-2); padding: 4px 8px 4px 0; width: 45%; }
  .about-table td { color: var(--text-1); padding: 4px 0; font-family: var(--font-mono); }
</style>
