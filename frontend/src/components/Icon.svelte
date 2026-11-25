<script lang="ts">
  import { ICONS } from '../lib/icons.ts';

  // One size and one stroke everywhere; the color comes from the text role of the parent.
  let { name, size = 16, filled = false }: { name: string; size?: number; filled?: boolean } = $props();
</script>

<svg
  width={size} height={size} viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" style="flex-shrink:0;"
>
  {@html ICONS[name] ?? ''}
</svg>
<style>
  /* Keep the stroke at 1.5px whatever the rendered size */
  svg :global(*) { vector-effect: non-scaling-stroke; }
</style>
