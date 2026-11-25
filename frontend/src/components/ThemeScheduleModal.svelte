<script>
  import { stopPropagation } from '../lib/events';
  import { createEventDispatcher } from 'svelte';
  import { themeSchedule } from '../lib/theme.ts';
  import { lang, t } from '../lib/i18n.ts';

  const dispatch = createEventDispatcher();

  function toggleEnabled() {
    themeSchedule.update((s) => ({ ...s, enabled: !s.enabled }));
  }

  function toggleHour(h) {
    themeSchedule.update((s) => {
      const darkHours = [...s.darkHours];
      darkHours[h] = !darkHours[h];
      return { ...s, darkHours };
    });
  }

  function fmtHour(h) {
    return h.toString().padStart(2, '0') + 'h';
  }
</script>

<div class="modal-overlay" onclick={() => dispatch('close')} onkeydown={(e) => e.key === 'Escape' && dispatch('close')} role="presentation">
  <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <div class="modal-header">
      <h2>{$t('Programmation du thème')}</h2>
      <button class="close-btn" onclick={() => dispatch('close')} title={$t('Fermer')}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      <label class="schedule-enable">
        <input type="checkbox" checked={$themeSchedule.enabled} onchange={toggleEnabled} />
        {$t('Activer la programmation automatique')}
      </label>

      <p class="hint">
        {$lang === 'fr'
          ? $t('Cochez les heures où le mode sombre doit être actif.')
          : 'Check the hours during which dark mode should be active.'}
      </p>

      <div class="hour-grid" class:disabled={!$themeSchedule.enabled}>
        {#each $themeSchedule.darkHours as isDark, h}
          <button
            type="button"
            class="hour-cell {isDark ? 'is-dark' : 'is-light'}"
            disabled={!$themeSchedule.enabled}
            onclick={() => toggleHour(h)}
            title={isDark ? ($t('Sombre')) : ($t('Clair'))}
          >
            {fmtHour(h)}
          </button>
        {/each}
      </div>

      <div class="legend">
        <span class="legend-item"><span class="legend-swatch is-dark"></span>{$t('Sombre')}</span>
        <span class="legend-item"><span class="legend-swatch is-light"></span>{$t('Clair')}</span>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-confirm" onclick={() => dispatch('close')}>
        {$t('Fermer')}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-card {
    background: var(--card);
    border-radius: 12px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: 90%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-1);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-2);
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: var(--text-1);
  }

  .modal-body {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
  }

  .schedule-enable {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-1);
    cursor: pointer;
  }

  .hint {
    margin: 10px 0 14px;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .hour-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  .hour-grid.disabled {
    opacity: 0.5;
  }

  .hour-cell {
    padding: 8px 0;
    border-radius: 6px;
    border: 1px solid var(--border);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-ui);
  }

  .hour-cell:disabled {
    cursor: not-allowed;
  }

  .hour-cell.is-light {
    background: var(--card-hover);
    color: var(--text-2);
  }

  .hour-cell.is-dark {
    background: var(--cobalt);
    color: white;
    border-color: var(--cobalt);
  }

  .legend {
    display: flex;
    gap: 16px;
    margin-top: 14px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--text-2);
  }

  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--border);
  }

  .legend-swatch.is-dark {
    background: var(--cobalt);
    border-color: var(--cobalt);
  }

  .legend-swatch.is-light {
    background: var(--card-hover);
  }

  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .btn-confirm {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--cobalt);
    color: white;
  }

  .btn-confirm:hover {
    background: #1d4ed8;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
</style>
