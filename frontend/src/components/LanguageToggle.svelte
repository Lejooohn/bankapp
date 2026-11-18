<script>
  import { lang, t } from '../lib/i18n.ts';

  function toggle() {
    lang.set($lang === 'fr' ? 'en' : 'fr');
  }
</script>

<button class="lang-switch" onclick={toggle} title={$lang === 'fr' ? 'Switch to English' : $t('Passer au Français')}>
  <span class="lang-text" class:active={$lang === 'fr'}>FR</span>
  <div class="switch-track" class:active={$lang === 'en'}>
    <div class="switch-thumb"></div>
  </div>
  <span class="lang-text" class:active={$lang === 'en'}>EN</span>
</button>

<style>
  .lang-switch {
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

  .lang-switch:hover {
    background: var(--card-hover);
  }

  .lang-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    min-width: 18px;
    text-align: center;
    transition: color 0.2s ease;
  }

  .lang-text.active {
    color: var(--cobalt);
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
