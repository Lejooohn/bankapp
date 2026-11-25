// Shared payment-mode icon/color mapping — single source of truth so the
// transaction list, edit modal and new-transaction modal stay visually consistent.

// Line icons (lucide) in the current text color; callers that want a tint set it with modeBadgeStyle().
const ICONS = {
  'Retrait DAB': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  'Prélèvement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  'Virement reçu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M17 7 7 17"/><path d="M17 17H7V7"/></svg>',
  'Virement émis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>',
  'Versement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></svg>',
  'Carte': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>',
  'Chèque émis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
  'Dépôt de chèque': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>',
};

const COLORS = {
  'Prélèvement':     '#0EA5E9',
  'Versement':       '#00D084',
  'Virement reçu':   '#00D084',
  'Virement émis':   '#EF4444',
  'Carte':           '#8B5CF6',
  'Chèque émis':     '#14B8A6',
  'Dépôt de chèque': '#14B8A6',
  'Retrait DAB':     '#EC4899',
};

export function modeIcon(type) {
  if (!type) return '—';
  if (ICONS[type]) return ICONS[type];
  const t = type.toLowerCase();
  if (t.includes('virement')) return ICONS['Virement reçu'];
  if (t.includes('prél') || t.includes('prelevement')) return ICONS['Prélèvement'];
  if (t.includes('versement')) return ICONS['Versement'];
  if (t.includes('carte') || t.includes(' cb')) return ICONS['Carte'];
  if (t.includes('chèque') || t.includes('cheque')) return ICONS['Chèque émis'];
  if (t.includes('retrait') || t.includes('dab') || t.includes('espèce')) return ICONS['Retrait DAB'];
  if (t.includes('dépôt') || t.includes('depot')) return ICONS['Versement'];
  return '—';
}

export function modeColor(type) {
  if (!type) return '#94A3B8';
  if (COLORS[type]) return COLORS[type];
  const t = type.toLowerCase();
  if (t.includes('virement'))                           return '#3B82F6';
  if (t.includes('prél') || t.includes('prelevement'))  return '#0EA5E9';
  if (t.includes('versement'))                          return '#00D084';
  if (t.includes('carte') || t.includes(' cb'))         return '#8B5CF6';
  if (t.includes('chèque') || t.includes('cheque'))     return '#14B8A6';
  if (t.includes('retrait') || t.includes('dab') || t.includes('espèce')) return '#EC4899';
  if (t.includes('dépôt') || t.includes('depot'))       return '#00D084';
  return '#94A3B8';
}

export function modeBadgeStyle(type) {
  const c = modeColor(type);
  return `background:${c}1F; border:1px solid ${c}55; color:${c};`;
}
