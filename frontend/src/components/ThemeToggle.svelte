<script>
  import { theme, themeSchedule } from '../lib/theme.ts';
  import { lang, t } from '../lib/i18n.ts';
  import Icon from './Icon.svelte';
  import ThemeScheduleModal from './ThemeScheduleModal.svelte';

  let showScheduleModal = $state(false);

  function toggle() {
    if ($themeSchedule.enabled) return;
    theme.set($theme === 'light' ? 'dark' : 'light');
  }

  let scheduleTitle = $derived($t('Contrôlé par la programmation'));
  let switchTitle = $derived($themeSchedule.enabled ? scheduleTitle : ($theme === 'light' ? $t('Mode sombre') : $t('Mode clair')));
</script>

<button
  class="side-row theme-switch"
  class:disabled={$themeSchedule.enabled}
  role="switch"
  aria-checked={$theme === 'dark'}
  aria-disabled={$themeSchedule.enabled}
  title={switchTitle}
  onclick={toggle}
>
  <span class="side-row-icon"><Icon name={$theme === 'dark' ? 'moon' : 'sun'} /></span>
  <span class="side-row-label">{$t('Mode sombre')}</span>
  <span class="switch-track" class:active={$theme === 'dark'}><span class="switch-thumb"></span></span>
</button>

<button class="side-row" onclick={() => (showScheduleModal = true)}>
  <span class="side-row-icon"><Icon name="clock" /></span>
  <span class="side-row-label">{$t('Programmation automatique')}</span>
</button>

{#if showScheduleModal}
  <ThemeScheduleModal on:close={() => (showScheduleModal = false)} />
{/if}

<style>
  .theme-switch.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
