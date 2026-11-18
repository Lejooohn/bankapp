<script lang="ts">
  interface Props {
    tx: any;
    checked: any;
    onToggle: any;
    conflict?: boolean;
    children?: import('svelte').Snippet;
  }

  let {
    tx,
    checked,
    onToggle,
    conflict = false,
    children
  }: Props = $props();
</script>

<div class="tx-row" class:conflict-row={conflict}>
  <input
    type="checkbox"
    {checked}
    onchange={(e) => onToggle(e.currentTarget.checked)}
    class="tx-checkbox"
    aria-label={tx.tiers}
  />
  <div class="tx-info">
    <div class="tx-date">{tx.date}</div>
    <div class="tx-tiers">{tx.tiers}</div>
    {#if tx.details}
      <div class="tx-details">{tx.details}</div>
    {/if}
  </div>
  {@render children?.()}
</div>

<style>
  .tx-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
    gap: 10px;
  }
  .tx-row:last-child { border-bottom: none; }
  .tx-row:hover { background: var(--card-hover); }

  .conflict-row {
    border-bottom: 1px solid #fed7aa;
  }
  .conflict-row:last-child { border-bottom: none; }
  .conflict-row:hover { background: rgba(217, 119, 6, 0.05); }

  .tx-checkbox {
    flex-shrink: 0;
    cursor: pointer;
    accent-color: var(--accent);
  }

  .tx-info {
    flex: 1;
    min-width: 0;
  }

  .tx-date {
    font-size: 11px;
    color: var(--text-3);
    font-weight: 500;
  }

  .tx-tiers {
    color: var(--text-1);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-details {
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
