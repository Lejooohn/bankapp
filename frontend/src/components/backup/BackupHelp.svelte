<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import Icon from '../Icon.svelte';

  // Plain answers to the questions a restore raises. Administrators also manage the full dumps.
  let { isAdmin, kept }: { isAdmin: boolean; kept: number } = $props();

  let entries = $derived([
    ...(isAdmin ? [{
      q: $t('Que contient une sauvegarde ?'),
      a: $t('Toute la base : tous les comptes et tous les utilisateurs.'),
    }] : []),
    {
      q: $t('Que fait une restauration ?'),
      a: isAdmin
        ? $t('Elle remplace les données que vous choisissez, dans le compte sélectionné uniquement. Vous pouvez aussi restaurer dans un nouveau compte : rien n\'est alors remplacé.')
        : $t('Elle remplace les données du compte sélectionné par celles de la copie.'),
    },
    ...(isAdmin ? [{
      q: $t('Et si je me trompe de sauvegarde ?'),
      a: $t('Avant de remplacer des données, BankApp en garde une copie. Une ligne « Revenir avant une restauration » apparaît alors ici. Les {n} dernières copies de chaque compte sont gardées. Le retour en arrière est définitif.').replace('{n}', String(kept)),
    }, {
      q: $t('Quand une sauvegarde est-elle supprimée ?'),
      a: $t('Les automatiques, au premier passage après leur durée : il peut donc en rester une ou deux de plus. Les manuelles, quand un administrateur ouvre BankApp après leur date.'),
    }, {
      q: $t('Les fichiers sont-ils protégés ?'),
      a: $t('Ils sont chiffrés (AES-256-GCM) : les manuelles dès leur création, les automatiques dans les 15 minutes, pendant lesquelles elles ne peuvent pas être utilisées. Un fichier téléchargé n\'est plus chiffré.'),
    }, {
      q: $t('Où sont-elles ?'),
      a: $t('Sur le serveur de BankApp uniquement. Si le serveur tombe en panne, elles sont perdues avec lui : téléchargez-en une de temps en temps pour la garder ailleurs.'),
    }] : []),
  ]);
</script>

<details>
  <summary><Icon name="chevron-down" />{$t('Comment ça marche ?')}</summary>
  <dl>
    {#each entries as entry (entry.q)}
      <dt>{entry.q}</dt>
      <dd>{entry.a}</dd>
    {/each}
  </dl>
</details>

<style>
  details { margin-top: 12px; font-size: 13px; }
  summary { display: flex; align-items: center; gap: 4px; width: fit-content; cursor: pointer; color: var(--text-2); list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary:hover { color: var(--text-1); }
  summary :global(svg) { width: 16px; height: 16px; transform: rotate(-90deg); transition: transform 150ms var(--ease); }
  details[open] summary :global(svg) { transform: none; }
  @media (prefers-reduced-motion: reduce) { summary :global(svg) { transition: none; } }
  dl { margin: 12px 0 0; line-height: 1.5; }
  dt { color: var(--text-1); font-weight: 500; }
  dd { max-width: 68ch; margin: 0 0 12px; color: var(--text-2); }
</style>
