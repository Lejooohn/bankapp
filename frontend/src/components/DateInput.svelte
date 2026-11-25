<script lang="ts">
  import { t } from '../lib/i18n.ts';
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  
  // Segmented date input (JJ / MM / AAAA), replacing the native <input type="date">.
  // Each part is its own field so editing one (typing over a selection, backspacing,
  // etc.) never touches the others, and each part has a hard maxlength — the year
  
  interface Props {
    // can never grow past 4 digits.
    value?: string; // ISO yyyy-mm-dd, bindable
    id?: any;
    class?: string;
    [key: string]: any
  }

  let { value = $bindable(''), id = undefined, class: klass = '', ...rest }: Props = $props();
  

  let day = $state(''), month = $state(''), year = $state('');
  let dayEl: HTMLInputElement | undefined = $state();
  let monthEl: HTMLInputElement | undefined = $state();
  let yearEl: HTMLInputElement | undefined = $state();
  let nativeInput: HTMLInputElement | undefined = $state();
  let skipNextSync = $state(false);

  function partsFromISO(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? { year: m[1], month: m[2], day: m[3] } : { year: '', month: '', day: '' };
  }

  function sync(iso) {
    const p = partsFromISO(iso);
    day = p.day; month = p.month; year = p.year;
  }

  $effect.pre(() => {
    value;
    untrack(() => {
      if (skipNextSync) { skipNextSync = false; } else { sync(value); }
    });
  });

  function daysInMonth(y, mo) {
    return new Date(y, mo, 0).getDate();
  }

  function tryEmit() {
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      const dN = parseInt(day, 10), mN = parseInt(month, 10), yN = parseInt(year, 10);
      if (mN >= 1 && mN <= 12 && yN >= 1000 && dN >= 1 && dN <= daysInMonth(yN, mN)) {
        skipNextSync = true;
        value = `${year}-${month}-${day}`;
      }
    }
  }

  function handlePartInput(e, part) {
    const el = e.currentTarget;
    const max = part === 'year' ? 4 : 2;
    const digits = el.value.replace(/\D/g, '').slice(0, max);
    if (part === 'day') day = digits;
    else if (part === 'month') month = digits;
    else year = digits;
    el.value = digits;
    if (digits.length === max) {
      if (part === 'day') monthEl.focus();
      else if (part === 'month') yearEl.focus();
    }
    tryEmit();
  }

  function handleKeydown(e, part) {
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      if (part === 'month') { dayEl.focus(); dayEl.setSelectionRange(2, 2); }
      else if (part === 'year') { monthEl.focus(); monthEl.setSelectionRange(2, 2); }
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      if (part === 'month') dayEl.focus();
      else if (part === 'year') monthEl.focus();
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      if (part === 'day') monthEl.focus();
      else if (part === 'month') yearEl.focus();
    } else if (e.key === '/') {
      e.preventDefault();
      if (part === 'day') monthEl.focus();
      else if (part === 'month') yearEl.focus();
    }
  }

  function handlePartFocus(e) {
    e.currentTarget.select();
  }

  function handleGroupBlur() {
    setTimeout(() => {
      if (![dayEl, monthEl, yearEl].includes(document.activeElement as HTMLInputElement)) {
        // Focus left the whole date field: discard any incomplete/invalid edit.
        sync(value);
      }
    }, 0);
  }

  function handleNativeDateChange(e) {
    const iso = e.currentTarget.value;
    if (iso) {
      const p = partsFromISO(iso);
      day = p.day;
      month = p.month;
      year = p.year;
      skipNextSync = true;
      value = iso;
    }
  }

  function openCalendar() {
    if (nativeInput) {
      if (nativeInput.showPicker) {
        nativeInput.showPicker();
      } else {
        nativeInput.click();
      }
    }
  }
</script>

<div class="dateinput {klass}" {id} role="presentation" onclick={() => dayEl.focus()} {...rest}>
  <input
    bind:this={dayEl}
    class="part"
    inputmode="numeric"
    autocomplete="off"
    placeholder="jj"
    maxlength="2"
    value={day}
    oninput={(e) => handlePartInput(e, 'day')}
    onkeydown={(e) => handleKeydown(e, 'day')}
    onfocus={handlePartFocus}
    onblur={handleGroupBlur}
  />
  <span class="sep">/</span>
  <input
    bind:this={monthEl}
    class="part"
    inputmode="numeric"
    autocomplete="off"
    placeholder="mm"
    maxlength="2"
    value={month}
    oninput={(e) => handlePartInput(e, 'month')}
    onkeydown={(e) => handleKeydown(e, 'month')}
    onfocus={handlePartFocus}
    onblur={handleGroupBlur}
  />
  <span class="sep">/</span>
  <input
    bind:this={yearEl}
    class="part year"
    inputmode="numeric"
    autocomplete="off"
    placeholder="aaaa"
    maxlength="4"
    value={year}
    oninput={(e) => handlePartInput(e, 'year')}
    onkeydown={(e) => handleKeydown(e, 'year')}
    onfocus={handlePartFocus}
    onblur={handleGroupBlur}
  />
  <button type="button" class="calendar-btn" onclick={openCalendar} title={$t('Ouvrir le calendrier')}>
    <Icon name="calendar" />
  </button>
  <input
    bind:this={nativeInput}
    type="date"
    class="native-input"
    value={value}
    oninput={handleNativeDateChange}
  />
</div>

<style>
  .dateinput {
    display: inline-flex; align-items: center; gap: 2px;
    width: 100%; padding: 8px 11px;
    border: 1px solid var(--border); border-radius: 7px;
    background: var(--input-bg);
    font-family: inherit;
    box-sizing: border-box;
    position: relative;
  }
  .dateinput:focus-within {
    border-color: var(--cobalt);
    box-shadow: 0 0 0 3px var(--cobalt-dim);
  }
  .dateinput.invalid {
    border-color: rgba(220,38,38,0.4);
    background-color: rgba(220,38,38,0.05);
  }
  .dateinput.invalid:focus-within {
    border-color: rgba(220,38,38,0.55);
    box-shadow: 0 0 0 3px rgba(220,38,38,0.08);
  }
  .part {
    border: none; outline: none; background: transparent;
    color: var(--text-1); font-size: 13.5px; font-family: inherit;
    padding: 0; text-align: center;
    width: 1.6em;
  }
  .part.year { width: 3em; }
  .sep { color: var(--text-3); }
  .native-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .calendar-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0 4px;
    color: var(--text-3);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms var(--ease);
  }
  .calendar-btn:hover {
    color: var(--text-1);
  }
</style>
