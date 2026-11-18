<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.ts';

  let { onClose = () => {} } = $props();

  let countdown = $state(5);
  let intervalId: number | null = null;

  onMount(() => {
    intervalId = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        if (intervalId !== null) clearInterval(intervalId);
        onClose();
      }
    }, 1000) as unknown as number;

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
    };
  });

  function handleClose() {
    if (intervalId !== null) clearInterval(intervalId);
    onClose();
  }
</script>

<div class="modal-overlay" onclick={self(handleClose)} onkeydown={(e) => e.key === 'Escape' && handleClose()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <div class="modal-content">
      <div class="modal-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2" opacity="0.1"/>
          <path d="M24 16v8M24 32v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>
        </svg>
      </div>

      <div class="modal-text">
        <h2 class="modal-title">{$t('Aucune opération à mettre à jour')}</h2>
        <p class="modal-description">
          {$t('Les règles ont été appliquées, mais aucune opération ne correspondait aux critères')}
        </p>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" onclick={handleClose}>
          {$t('Fermer')}
        </button>
        <div class="countdown-text">
          {$t('Fermeture automatique dans')} <strong>{countdown}s</strong>
        </div>
      </div>
    </div>

    <button class="modal-close" onclick={handleClose} aria-label={$t('Fermer')}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 250;
    backdrop-filter: blur(2px);
  }

  .modal-box {
    position: relative;
    background: var(--card);
    border-radius: 16px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: min(420px, 90vw);
    padding: 40px 32px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 16px;
  }

  .modal-icon {
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-1);
    margin: 0;
    font-family: 'Inter', sans-serif;
  }

  .modal-description {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
    line-height: 1.6;
    font-family: 'Inter', sans-serif;
    max-width: 340px;
  }

  .modal-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin-top: 8px;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #3B82F6;
    color: white;
    min-width: 140px;
  }

  .btn-primary:hover {
    background: #2563EB;
  }

  .countdown-text {
    font-size: 12px;
    color: var(--text-3);
    font-family: 'Inter', sans-serif;
  }

  .countdown-text strong {
    color: var(--text-2);
    font-weight: 600;
  }

  .modal-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-3);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s, background 0.1s;
  }

  .modal-close:hover {
    color: var(--text-1);
    background: var(--surface);
  }
</style>
