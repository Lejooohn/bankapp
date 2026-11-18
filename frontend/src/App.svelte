<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Login from './components/Login.svelte';
  import LockScreen from './components/LockScreen.svelte';
  import { getToken, clearToken } from './lib/api.js';
  import { loadThemePreferences } from './lib/theme.ts';
  import './lib/theme.ts';

  const LOCK_DELAY = 15 * 60 * 1000; // 15 minutes
  const HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds

  let authenticated = $state(!!getToken());
  let locked = $state(false);
  let lockTimer;
  let healthCheckTimer;
  let apiHealthy = $state(true);
  let healthCheckError = $state('');

  function updateLastActivityTime() {
    localStorage.setItem('bankapp_last_activity', Date.now().toString());
  }

  function checkIfShouldBeLocked() {
    if (!authenticated) return false;
    const lastActivity = localStorage.getItem('bankapp_last_activity');
    if (!lastActivity) return false;
    const elapsed = Date.now() - parseInt(lastActivity);
    return elapsed > LOCK_DELAY;
  }

  function resetTimer() {
    clearTimeout(lockTimer);
    if (authenticated && !locked) {
      updateLastActivityTime();
      lockTimer = setTimeout(() => { locked = true; }, LOCK_DELAY);
    }
  }

  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

  async function checkHealth() {
    try {
      // Health check doesn't require auth - use raw fetch
      const res = await fetch('/api/health');
      if (res.ok) {
        apiHealthy = true;
        healthCheckError = '';
      } else {
        apiHealthy = false;
        healthCheckError = `Health check failed: ${res.status}`;
      }
    } catch (err: any) {
      apiHealthy = false;
      healthCheckError = `API unreachable: ${err.message}`;
    }
  }

  function startHealthCheck() {
    checkHealth();
    healthCheckTimer = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
  }

  function stopHealthCheck() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
  }

  onMount(() => {
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Check if session should be locked after page refresh
    if (authenticated && checkIfShouldBeLocked()) {
      locked = true;
    } else {
      resetTimer();
    }

    startHealthCheck();

    // Load theme preferences on startup if authenticated
    if (authenticated) {
      loadThemePreferences();
    }

    window.addEventListener('bankapp:unauthorized', () => {
      authenticated = false;
      locked = false;
      clearTimeout(lockTimer);
      localStorage.removeItem('bankapp_last_activity');
    });
  });

  onDestroy(() => {
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
    clearTimeout(lockTimer);
    stopHealthCheck();
  });

  function onLogin() {
    authenticated = true;
    locked = false;
    resetTimer();
    loadThemePreferences();
  }

  function onUnlock() {
    updateLastActivityTime();
    locked = false;
    resetTimer();
  }

  function onLock() {
    locked = true;
  }

  function onLogout() {
    clearToken();
    authenticated = false;
    locked = false;
    clearTimeout(lockTimer);
    localStorage.removeItem('bankapp_last_activity');
  }
</script>

<main class="min-h-screen app-main">
  {#if !apiHealthy}
    <div class="health-alert">
      <span style="font-weight:600;">⚠ API Error</span>
      <span>{healthCheckError}</span>
    </div>
  {/if}

  {#if !authenticated}
    <Login {onLogin} />
  {:else if locked}
    <LockScreen {onUnlock} {onLogout} />
  {:else}
    <Dashboard {onLock} />
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--surface);
  }

  :global(.app-main) {
    background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #cffafe 100%);
  }

  :global([data-theme="dark"] .app-main) {
    background: linear-gradient(135deg, #0D1117 0%, #111827 50%, #0B2437 100%);
  }
  :global(*) {
    box-sizing: border-box;
  }

  .health-alert {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #FEE2E2;
    border-bottom: 2px solid #DC2626;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #7F1D1D;
    z-index: 1000;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
