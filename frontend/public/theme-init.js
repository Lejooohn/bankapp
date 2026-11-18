// Applies the saved theme before first paint. Lives in its own file (not inline in
// index.html) so the production Content-Security-Policy can forbid inline scripts.
(function () {
  var s = localStorage.getItem('theme');
  var dark = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
