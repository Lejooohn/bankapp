<script>
  import { theme, themeSchedule } from '../lib/theme.ts';
  import { lang, t } from '../lib/i18n.ts';
  import ThemeScheduleModal from './ThemeScheduleModal.svelte';

  let showScheduleModal = $state(false);

  function toggle() {
    if ($themeSchedule.enabled) return;
    theme.set($theme === 'light' ? 'dark' : 'light');
  }

  let scheduleTitle = $derived($t('Contrôlé par la programmation'));
  let lightTitle = $derived($themeSchedule.enabled ? scheduleTitle : ($t('Mode clair')));
  let darkTitle = $derived($themeSchedule.enabled ? scheduleTitle : ($t('Mode sombre')));
</script>

<button
  class="theme-switch"
  class:disabled={$themeSchedule.enabled}
  onclick={toggle}
>
  <span class="theme-text" class:active={$theme === 'light'} title={lightTitle}>☀️</span>
  <div class="switch-track" class:active={$theme === 'dark'} title={$themeSchedule.enabled ? scheduleTitle : ($theme === 'light' ? darkTitle : lightTitle)}>
    <div class="switch-thumb"></div>
  </div>
  <span class="theme-text" class:active={$theme === 'dark'} title={darkTitle}>🌙</span>
</button>

<button class="schedule-expand" onclick={() => (showScheduleModal = true)}>
  <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4"/>
    <path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  {$t('Programmation automatique')}
</button>

{#if showScheduleModal}
  <ThemeScheduleModal on:close={() => (showScheduleModal = false)} />
{/if}

<style>
  .theme-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 7px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: all 0.12s;
  }

  .theme-switch:hover {
    background: var(--card-hover);
  }

  .theme-switch.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .theme-switch.disabled:hover {
    background: none;
  }

  .schedule-expand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    margin-bottom: 8px;
    background: none;
    border: none;
    color: var(--text-3);
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: color 0.15s;
  }

  .schedule-expand:hover {
    color: var(--text-2);
  }

  .theme-text {
    font-size: 16px;
    min-width: 18px;
    text-align: center;
    transition: opacity 0.2s ease;
    opacity: 0.4;
  }

  .theme-text.active {
    opacity: 1;
  }

  .switch-track {
    position: relative;
    width: 32px;
    height: 18px;
    background: #cbd5e1;
    border-radius: 9px;
    transition: background 0.2s ease;
  }

  .switch-track.active {
    background: var(--cobalt);
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: left 0.2s ease;
  }

  .switch-track.active .switch-thumb {
    left: calc(100% - 16px);
  }
</style>
