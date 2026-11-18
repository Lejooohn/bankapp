import { mount } from 'svelte';
import App from './App.svelte';
import './styles/global.css';

// Intercept all fetch calls to inject Bearer token and handle 401 globally
const _fetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = localStorage.getItem('bankapp_token');
  if (token) {
    init.headers = { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) };
  }
  return _fetch(input, init).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem('bankapp_token');
      window.dispatchEvent(new CustomEvent('bankapp:unauthorized'));
    }
    return res;
  });
};

const app = mount(App, {
  target: document.getElementById('app')!
});
