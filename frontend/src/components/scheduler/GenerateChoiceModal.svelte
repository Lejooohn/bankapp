<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import ScheduleModal from './ScheduleModal.svelte';

  // Lets the user choose between a dry-run simulation and the real insertion.
  let { title, onsimulate, onreal, onclose }: {
    title: string;
    onsimulate: () => void;
    onreal: () => void;
    onclose: () => void;
  } = $props();
</script>

<ScheduleModal {title} {onclose} boxClass="choice-modal-box" bodyClass="choice-modal-body">
  <p class="choice-intro">{$t('Choisissez comment générer ces opérations.')}</p>

  <div class="choice-grid">
    <!-- Simulation option -->
    <button type="button" class="choice-card" onclick={onsimulate}>
      <span class="choice-icon">📋</span>
      <h3 class="choice-title">{$t('Simulation')}</h3>
      <p class="choice-desc">{$t('Aperçu des opérations sans les enregistrer.')}</p>
      <span class="choice-tag choice-tag-warn">
        <span class="choice-tag-dot"></span>
        {$t('Ne met pas à jour les dates d\'exécution')}
      </span>
    </button>

    <!-- Real insertion option -->
    <button type="button" class="choice-card choice-card-active" onclick={onreal}>
      <span class="choice-badge">{$t('Recommandé')}</span>
      <span class="choice-icon">✅</span>
      <h3 class="choice-title">{$t('Insertion réelle')}</h3>
      <p class="choice-desc">{$t('Crée les opérations et avance les échéances.')}</p>
      <span class="choice-tag choice-tag-ok">
        <span class="choice-tag-dot"></span>
        {$t('Met à jour les prochaines exécutions')}
      </span>
    </button>
  </div>

  <div class="choice-footer">
    <button class="btn btn-ghost" onclick={onclose}>
      {$t('Annuler')}
    </button>
  </div>
</ScheduleModal>

<style>
  .choice-intro {
    margin: 0 0 28px;
    font-size: 13px;
    color: var(--text-2);
    text-align: center;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .choice-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    border: 1.5px solid var(--border);
    background: var(--bg-1);
    border-radius: 14px;
    padding: 24px 20px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    text-align: left;
    font-family: inherit;
    color: inherit;
  }

  .choice-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
    border-color: #94A3B8;
  }

  .choice-card:focus-visible {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
  }

  .choice-icon {
    font-size: 26px;
    line-height: 1;
    margin-bottom: 4px;
  }

  .choice-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-1);
    margin: 0;
  }

  .choice-desc {
    font-size: 12.5px;
    color: var(--text-2);
    margin: 0 0 10px;
    line-height: 1.5;
  }

  .choice-tag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 999px;
    line-height: 1.4;
  }

  .choice-tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .choice-tag-warn {
    color: #B45309;
    background: rgba(245, 158, 11, 0.14);
  }

  .choice-tag-warn .choice-tag-dot {
    background: #F59E0B;
  }

  .choice-tag-ok {
    color: #15803D;
    background: rgba(16, 185, 129, 0.16);
  }

  .choice-tag-ok .choice-tag-dot {
    background: #10B981;
  }

  .choice-card-active {
    border-color: #10B981;
    background: rgba(16, 185, 129, 0.06);
  }

  .choice-card-active:hover {
    border-color: #16A34A;
    box-shadow: 0 6px 18px rgba(16, 185, 129, 0.2);
  }

  .choice-badge {
    position: absolute;
    top: -11px;
    right: 16px;
    background: #10B981;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 11px;
    border-radius: 999px;
    letter-spacing: 0.02em;
  }

  .choice-footer {
    display: flex;
    justify-content: center;
    margin-top: 28px;
  }

  .choice-footer .btn {
    min-width: 140px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
</style>
