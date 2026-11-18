<script lang="ts">
  import { t } from '../lib/i18n.ts';
  import { stopPropagation } from '../lib/events';
  import { catStyle } from '../utils/categoryColor.js';
  import { onMount, tick } from 'svelte';

  interface Props {
    value?: string;
    categories?: any;
    label?: string;
    id?: any;
    className?: string;
  }

  let {
    value = $bindable(''),
    categories = [],
    label = '',
    id = undefined,
    className = ''
  }: Props = $props();

  let isOpen = $state(false);
  let dropdownAbove = $state(false);
  let dropdownStyle = $state('');
  let buttonRef: HTMLElement | undefined = $state();
  let dropdownRef: HTMLElement | undefined = $state();
  let searchQuery = $state('');
  let searchInputRef: HTMLInputElement | undefined = $state();
  let filteredCategories = $derived.by(() => {
    if (!searchQuery.trim()) return categories;
    const normalized = normalizeString(searchQuery);
    return categories.filter(cat => normalizeString(cat).includes(normalized));
  });

  function normalizeString(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }


  function select(cat) {
    value = cat;
    isOpen = false;
    searchQuery = '';
  }

  async function toggleOpen() {
    isOpen = !isOpen;
    searchQuery = '';
    if (isOpen) {
      await tick();
      checkDropdownPosition();
      searchInputRef?.focus();
    }
  }

  function checkDropdownPosition() {
    if (!buttonRef || !dropdownRef) return;
    const buttonRect = buttonRef.getBoundingClientRect();
    const dropdownHeight = dropdownRef?.offsetHeight || 250;
    const spaceBelow = window.innerHeight - buttonRect.bottom;

    dropdownAbove = spaceBelow < dropdownHeight + 10;

    const left = buttonRect.left;
    const top = dropdownAbove ? buttonRect.top - dropdownHeight - 6 : buttonRect.bottom + 6;
    const width = buttonRect.width;

    dropdownStyle = `position: fixed; left: ${left}px; top: ${top}px; width: ${width}px;`;
  }

  onMount(() => {
    document.addEventListener('click', handleOutsideClick, true);
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      document.removeEventListener('click', handleOutsideClick, true);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  });

  function handleOutsideClick(e) {
    if (buttonRef && !buttonRef.contains(e.target) && dropdownRef && !dropdownRef.contains(e.target) && e.target !== searchInputRef) {
      isOpen = false;
    }
  }

  function updateDropdownPosition() {
    if (isOpen) {
      checkDropdownPosition();
    }
  }
</script>

<div class="category-select-wrapper">
  <button
    {id}
    bind:this={buttonRef}
    class="category-select-button {className}"
    onclick={toggleOpen}
    type="button"
  >
    <span class="category-select-label">
      {#if value}
        <span class="cat-badge" style={catStyle(value)}>
          {value}
        </span>
      {:else}
        <span class="category-select-placeholder">{label}</span>
      {/if}
    </span>
    <span class="category-select-icon" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div
      bind:this={dropdownRef}
      class="category-select-dropdown"
      class:above={dropdownAbove}
      style={dropdownStyle}
    >
      <input
        bind:this={searchInputRef}
        bind:value={searchQuery}
        type="text"
        placeholder={$t('Filtrer...')}
        class="category-search-input"
        onmousedown={stopPropagation()}
        onclick={stopPropagation()}
      />
      <div
        class="category-select-option"
        class:selected={!value}
        onclick={() => select('')}
        onkeydown={() => {}}
        role="option"
        aria-selected={!value}
        tabindex="0"
      >
        <span class="category-select-label-option">{label}</span>
        {#if !value}
          <span class="category-select-checkmark">✓</span>
        {/if}
      </div>
      {#each filteredCategories as cat (cat)}
        <div
          class="category-select-option category-option-badge"
          class:selected={value === cat}
          onclick={() => select(cat)}
          onkeydown={() => {}}
          role="option"
          aria-selected={value === cat}
          tabindex="0"
        >
          <span class="cat-badge" style={catStyle(cat)}>
            {cat}
          </span>
          {#if value === cat}
            <span class="category-select-checkmark">✓</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .category-select-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  .category-select-button {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-1);
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: all 0.2s;
  }

  .category-select-button:hover {
    border-color: #3B82F6;
    background: var(--card);
  }

  .category-select-button:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .category-select-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    text-align: left;
    min-width: 0;
  }

  .category-select-placeholder {
    opacity: 0.6;
  }

  .category-select-icon {
    font-size: 12px;
    opacity: 0.5;
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .category-select-icon.open {
    transform: rotate(180deg);
  }

  .category-select-dropdown {
    position: fixed;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    max-height: 350px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .category-select-option {
    padding: 8px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  .category-select-option:hover {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .category-select-option.selected {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .category-option-badge {
    justify-content: space-between;
  }

  .category-option-badge .cat-badge {
    flex: 0 0 auto;
  }

  .category-select-label-option {
    flex: 1;
    font-size: 13px;
    color: var(--text-1);
  }

  .category-select-checkmark {
    font-size: 12px;
    font-weight: 700;
    color: #16A34A;
    flex-shrink: 0;
  }

  .category-search-input {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    margin-bottom: 4px;
    width: 100%;
    box-sizing: border-box;
  }

  .category-search-input::placeholder {
    color: var(--text-2);
    opacity: 0.6;
  }

  .category-search-input:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
</style>
