// Shared payment-mode icon/color mapping — single source of truth so the
// transaction list, edit modal and new-transaction modal stay visually consistent.

const ICONS = {
  'Retrait DAB': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2.5" width="16" height="19" rx="2" stroke="#EC4899" stroke-width="1.8"/><rect x="7" y="5.5" width="10" height="6" rx="1" stroke="#EC4899" stroke-width="1.8"/><path d="M7 15h4M7 18h2.5" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 14.5v5M13.5 17.5l2 2 2-2" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Prélèvement': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 3.5v4h-4M5.5 20.5v-4h4" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Virement reçu': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#00D084" stroke-width="1.8"/><path d="M17 7L7 17M7 11v6h6" stroke="#00D084" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Virement émis': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#EF4444" stroke-width="1.8"/><path d="M7 17L17 7M11 7h6v6" stroke="#EF4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Versement': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="9" width="18" height="10" rx="2" stroke="#00D084" stroke-width="1.8"/><circle cx="12" cy="14" r="2.2" stroke="#00D084" stroke-width="1.8"/><path d="M12 2v5M9 4.5 12 7l3-2.5" stroke="#00D084" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Carte': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="#8B5CF6" stroke-width="1.8"/><path d="M2.5 9.5h19" stroke="#8B5CF6" stroke-width="1.8"/><rect x="5.5" y="13" width="4" height="2.6" rx="0.6" fill="#8B5CF6"/></svg>',
  'Chèque émis': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="13" rx="2" stroke="#06B6D4" stroke-width="1.8"/><path d="M6 9.5h8M6 13h5" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round"/><path d="M15 15.5l4.5-4.5M19.5 11v3.5h-3.5" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Dépôt de chèque': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="18" height="12" rx="2" stroke="#06B6D4" stroke-width="1.8"/><path d="M6 12.5h6M6 16h4" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round"/><path d="M17 2v6M14.5 5.5 17 8l2.5-2.5" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const COLORS = {
  'Prélèvement':     '#F59E0B',
  'Versement':       '#00D084',
  'Virement reçu':   '#00D084',
  'Virement émis':   '#EF4444',
  'Carte':           '#8B5CF6',
  'Chèque émis':     '#06B6D4',
  'Dépôt de chèque': '#06B6D4',
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
  if (t.includes('prél') || t.includes('prelevement'))  return '#F59E0B';
  if (t.includes('versement'))                          return '#00D084';
  if (t.includes('carte') || t.includes(' cb'))         return '#8B5CF6';
  if (t.includes('chèque') || t.includes('cheque'))     return '#06B6D4';
  if (t.includes('retrait') || t.includes('dab') || t.includes('espèce')) return '#EC4899';
  if (t.includes('dépôt') || t.includes('depot'))       return '#00D084';
  return '#94A3B8';
}

export function modeBadgeStyle(type) {
  const c = modeColor(type);
  return `background:${c}1F; border:1px solid ${c}55; color:${c};`;
}
