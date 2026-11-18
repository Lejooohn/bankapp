<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { modeIcon, modeBadgeStyle } from '../utils/modeIcon.js';

  interface Props {
    value?: string;
    options?: any; // [{ value, label }]
    placeholder?: string;
    id?: any;
    className?: string;
  }

  let {
    value = $bindable(''),
    options = [],
    placeholder = '',
    id = undefined,
    className = ''
  }: Props = $props();

  let isOpen = $state(false);
  let dropdownAbove = $state(false);
  let dropdownStyle = $state('');
  let buttonRef: HTMLElement | undefined = $state();
  let dropdownRef: HTMLElement | undefined = $state();

  let selected = $derived(options.find((o) => o.value === value));

  function select(opt) {
    value = opt.value;
    isOpen = false;
  }

  async function toggleOpen() {
    isOpen = !isOpen;
    if (isOpen) {
      await tick();
      checkDropdownPosition();
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
    document.addEventListener('click', handleOutsideClick);
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  });

  function handleOutsideClick(e) {
    if (buttonRef && !buttonRef.contains(e.target) && dropdownRef && !dropdownRef.contains(e.target)) {
      isOpen = false;
    }
  }

  function updateDropdownPosition() {
    if (isOpen) {
      checkDropdownPosition();
    }
  }
</script>

<div class="mode-select-wrapper">
  <button
    {id}
    bind:this={buttonRef}
    class="mode-select-button {className}"
    onclick={toggleOpen}
    type="button"
  >
    <span class="mode-select-label">
      {#if selected}
        <span>{selected.label}</span>
        <span class="mode-select-icon-badge" style={modeBadgeStyle(selected.value)}>{@html modeIcon(selected.value)}</span>
      {:else}
        <span class="mode-select-placeholder">{placeholder}</span>
      {/if}
    </span>
    <span class="mode-select-caret" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div
      bind:this={dropdownRef}
      class="mode-select-dropdown"
      class:above={dropdownAbove}
      style={dropdownStyle}
    >
      {#each options as opt (opt.value)}
        <div
          class="mode-select-option"
          class:selected={value === opt.value}
          onclick={() => select(opt)}
          onkeydown={() => {}}
          role="option"
          aria-selected={value === opt.value}
          tabindex="0"
        >
          <span class="mode-select-option-label">{opt.label}</span>
          <span class="mode-select-icon-badge" style={modeBadgeStyle(opt.value)}>{@html modeIcon(opt.value)}</span>
          {#if value === opt.value}
            <span class="mode-select-checkmark">✓</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mode-select-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  .mode-select-button {
    width: 100%;
    padding: 8px 12px;
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

  .mode-select-button:hover {
    border-color: #3B82F6;
    background: var(--card);
  }

  .mode-select-button:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .mode-select-button.invalid {
    border-color: rgba(220, 38, 38, 0.4);
    background: rgba(220, 38, 38, 0.05);
  }

  .mode-select-button.invalid:focus {
    border-color: rgba(220, 38, 38, 0.55);
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.08);
  }

  .mode-select-button.invalid .mode-select-placeholder {
    color: var(--danger-text);
    opacity: 0.65;
  }

  .mode-select-label {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    text-align: left;
    min-width: 0;
  }

  .mode-select-placeholder {
    opacity: 0.6;
  }

  .mode-select-caret {
    font-size: 12px;
    opacity: 0.5;
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .mode-select-caret.open {
    transform: rotate(180deg);
  }

  .mode-select-icon-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .mode-select-icon-badge :global(svg) {
    width: 16px;
    height: 16px;
  }

  .mode-select-dropdown {
    position: fixed;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    max-height: min(400px, calc(100vh - 24px));
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-select-option {
    padding: 5px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  .mode-select-option:hover {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .mode-select-option.selected {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .mode-select-option-label {
    flex: 1;
    font-size: 13px;
    color: var(--text-1);
  }

  .mode-select-checkmark {
    font-size: 12px;
    font-weight: 700;
    color: #16A34A;
    flex-shrink: 0;
  }
</style>
