<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import { catDotStyle } from '../../utils/categoryColor.js';

  // Expense categories, largest first. The bar length is the amount, the dot is the category:
  // one neutral bar color, so a long list stays readable.
  interface Item { name: string; value: number; avgPerMonth?: number }
  let { items, format }: { items: Item[]; format: (value: number) => string } = $props();

  let sorted = $derived([...items].sort((a, b) => b.value - a.value));
  let max = $derived(sorted[0]?.value || 1);
  let total = $derived(sorted.reduce((sum, item) => sum + item.value, 0) || 1);

  // A small share is not "0%"
  function share(value: number): string {
    const percent = new Intl.NumberFormat($lang === 'fr' ? 'fr-FR' : 'en-US', { style: 'percent' });
    const ratio = value / total;
    return ratio > 0 && ratio < 0.01 ? `< ${percent.format(0.01)}` : percent.format(ratio);
  }
</script>

<ol class="ranking">
  {#each sorted as item (item.name)}
    <li>
      <span class="name" style={catDotStyle(item.name)} title={item.name}><span class="name-text">{item.name}</span></span>
      <span class="amount">{format(item.value)}</span>
      <span class="track" aria-hidden="true"><span class="bar" style="width:{(item.value / max) * 100}%"></span></span>
      <span class="meta">
        {#if item.avgPerMonth !== undefined}{$t('Moy.')} {format(item.avgPerMonth)}{$t('/mois')}{' · '}{/if}{share(item.value)}
      </span>
    </li>
  {/each}
</ol>

<style>
  /* Shared columns (subgrid): every bar starts and ends on the same lines, whatever the amounts. */
  .ranking {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 16px;
    margin: 0 -8px;
    padding: 0;
    list-style: none;
  }

  /* Name and amount on one line, bar and detail under them, so long names keep their width. */
  li {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    row-gap: 4px;
    align-items: center;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background-color 150ms var(--ease);
  }
  li:hover { background: var(--card-hover); }

  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--text-1);
  }
  .name::before {
    content: '';
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
  }
  :global([data-theme="dark"]) .name::before { background: color-mix(in oklab, var(--dot), white 25%); }
  .name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .amount {
    font-family: var(--font-mono);
    font-size: 14px;
    text-align: right;
    color: var(--text-1);
    white-space: nowrap;
  }

  .track {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text-1) 6%, transparent);
  }
  .bar {
    display: block;
    height: 100%;
    min-width: 2px;
    border-radius: 0 2px 2px 0;
    background: var(--chart-neutral);
  }

  .meta {
    font-size: 12px;
    line-height: 16px;
    text-align: right;
    color: var(--text-3);
    white-space: nowrap;
  }
</style>
