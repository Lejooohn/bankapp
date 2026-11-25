<script>
  import { lang, t } from '../lib/i18n.ts';
  import Icon from './Icon.svelte';

  function toggle() {
    lang.set($lang === 'fr' ? 'en' : 'fr');
  }
</script>

<button class="side-row" onclick={toggle} title={$lang === 'fr' ? 'Switch to English' : $t('Passer au Français')}>
  <span class="side-row-icon"><Icon name="globe" /></span>
  <span class="side-row-label">{$t('Langue')}</span>
  <span class="lang-text" class:active={$lang === 'fr'}>FR</span>
  <span class="lang-text" class:active={$lang === 'en'}>EN</span>
</button>

<style>
  .lang-text {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-3);
  }
  .lang-text.active {
    color: var(--text-1);
    font-weight: 500;
  }
</style>
