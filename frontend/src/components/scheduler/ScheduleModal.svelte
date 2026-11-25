<script lang="ts">
  import { self } from '../../lib/events';
  import { t } from '../../lib/i18n.ts';

  // Modal chrome shared by the scheduler dialogs: backdrop, header with close button,
  // body and an optional footer. Closing on backdrop click, close button or Escape.
  let { title, onclose, boxClass = '', bodyClass = '', children, footer }: {
    title: string;
    onclose: () => void;
    boxClass?: string;
    bodyClass?: string;
    children?: any;
    footer?: any;
  } = $props();
</script>

<div class="modal-backdrop" onclick={self(onclose)} onkeydown={(e) => e.key === 'Escape' && onclose()} role="presentation">
  <div class="modal-box {boxClass}" role="dialog" aria-modal="true">
    <div class="modal-header">
      <span class="modal-title">{title}</span>
      <button class="btn-icon" onclick={onclose} aria-label={$t('Fermer')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="modal-body {bodyClass}">
      {@render children?.()}
    </div>
    {#if footer}
      <div class="modal-footer">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Modals shared ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(15,23,42,0.2);
    display: flex; flex-direction: column;
    max-height: 88vh;
    animation: slideUp 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Form modal — fixed width, no scroll needed */
  .form-modal-box { width: 900px; max-width: calc(100vw - 40px); max-height: 95vh; }

  .modal-header {
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    border-radius: 12px 12px 0 0;
  }
  .modal-title { width: 100%; text-align: center; font-size: 14px; font-weight: 600; color: var(--text-1); font-family: var(--font-ui); }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 28px 32px 32px;
    min-height: 0;
  }

  .modal-footer {
    flex-shrink: 0;
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    border-radius: 0 0 12px 12px;
  }

  /* Delete modal specific */
  .delete-modal-box {
    max-width: 450px;
  }

  /* Choice modal */
  .choice-modal-box {
    width: 560px;
    max-width: calc(100vw - 40px);
  }

  .choice-modal-body {
    padding: 28px 32px 32px;
  }
</style>
