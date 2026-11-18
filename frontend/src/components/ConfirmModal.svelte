<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  interface Props {
    title?: string;
    message?: string;
    confirmText?: any;
    confirmClass?: string;
    isLoading?: boolean;
    children?: import('svelte').Snippet;
  }

  let {
    title = '',
    message = '',
    confirmText = $t('Supprimer'),
    confirmClass = 'btn-danger-ghost',
    isLoading = false,
    children
  }: Props = $props();
  const dispatch = createEventDispatcher();

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      dispatch('cancel');
    }
  }
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation" style="width:360px;">
    <h2 class="modal-title">{title}</h2>
    {#if children}{@render children()}{:else}
      <p style="font-size:13.5px; color:var(--text-2); line-height:1.5;">{message}</p>
    {/if}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={() => dispatch('cancel')}>{$t('Annuler')}</button>
      <button class="btn {confirmClass}" onclick={() => dispatch('confirm')} disabled={isLoading}>
        {isLoading ? $t('Suppression…') : confirmText}
      </button>
    </div>
  </div>
</div>
