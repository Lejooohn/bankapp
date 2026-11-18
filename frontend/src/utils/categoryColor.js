const cache = new Map();
const COLOR_ASSIGNMENTS = new Map(); // Track assigned colors

// Distinctive palette: 20 colors with high visual separation.
// Unlike an evenly-spaced hue wheel (where neighboring hues like orange/gold
// or sky-blue/royal-blue become hard to tell apart), each entry varies hue,
// saturation AND lightness together so consecutive assignments stay visually
// distinct even for colorblind-adjacent hue pairs.
const COLOR_PALETTE = [
  { hue: 355, sat: 82, light: 52 },   // Red
  { hue: 210, sat: 75, light: 42 },   // Denim blue
  { hue: 35,  sat: 90, light: 55 },   // Orange
  { hue: 265, sat: 55, light: 62 },   // Lavender
  { hue: 145, sat: 55, light: 35 },   // Forest green
  { hue: 330, sat: 80, light: 62 },   // Pink
  { hue: 190, sat: 80, light: 42 },   // Teal
  { hue: 48,  sat: 85, light: 45 },   // Mustard
  { hue: 280, sat: 65, light: 48 },   // Purple
  { hue: 100, sat: 50, light: 45 },   // Olive green
  { hue: 5,   sat: 60, light: 32 },   // Maroon
  { hue: 200, sat: 90, light: 65 },   // Sky blue
  { hue: 20,  sat: 55, light: 35 },   // Brown
  { hue: 165, sat: 70, light: 48 },   // Jade
  { hue: 315, sat: 45, light: 40 },   // Plum
  { hue: 60,  sat: 60, light: 55 },   // Yellow-green
  { hue: 245, sat: 60, light: 55 },   // Indigo blue
  { hue: 12,  sat: 90, light: 68 },   // Coral
  { hue: 175, sat: 40, light: 30 },   // Deep teal-gray
  { hue: 300, sat: 70, light: 45 },   // Magenta
];

// Load assignments from localStorage
function loadAssignments() {
  if (typeof localStorage === 'undefined') return;
  try {
    const stored = localStorage.getItem('categoryColorAssignments');
    if (stored) {
      const assignments = JSON.parse(stored);
      Object.entries(assignments).forEach(([cat, value]) => {
        // Migrate old hue-based system (hues were 0-360) to new index-based system
        const colorIndex = typeof value === 'number' && value < 360 ? -1 : value;
        if (colorIndex >= 0 && colorIndex < COLOR_PALETTE.length) {
          COLOR_ASSIGNMENTS.set(cat, colorIndex);
        }
        // Skip invalid or old values; they'll be reassigned
      });
    }
  } catch (e) {
    console.error('Failed to load color assignments:', e);
  }
}

// Save assignments to localStorage
function saveAssignments() {
  if (typeof localStorage === 'undefined') return;
  try {
    const obj = {};
    COLOR_ASSIGNMENTS.forEach((colorIndex, cat) => {
      obj[cat] = colorIndex;
    });
    localStorage.setItem('categoryColorAssignments', JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save color assignments:', e);
  }
}

// Find the next available color index
function findBestColorIndex() {
  const usedIndices = new Set(COLOR_ASSIGNMENTS.values());

  // Find first unused color
  for (let i = 0; i < COLOR_PALETTE.length; i++) {
    if (!usedIndices.has(i)) {
      return i;
    }
  }

  // If all colors used, cycle back to start
  if (usedIndices.size > 0) {
    return COLOR_ASSIGNMENTS.size % COLOR_PALETTE.length;
  }

  return 0;
}

export function categoryColor(name) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);

  // Load assignments from localStorage if not already loaded
  if (COLOR_ASSIGNMENTS.size === 0) {
    loadAssignments();
  }

  // Get or assign color index
  let colorIndex;
  if (COLOR_ASSIGNMENTS.has(name)) {
    colorIndex = COLOR_ASSIGNMENTS.get(name);
  } else {
    colorIndex = findBestColorIndex();
    COLOR_ASSIGNMENTS.set(name, colorIndex);
    saveAssignments();
  }

  const color = COLOR_PALETTE[colorIndex];
  const result = {
    bg: `hsl(${color.hue}, ${color.sat - 10}%, 92%)`,    // Lighter bg for readability
    border: `hsl(${color.hue}, ${color.sat - 5}%, ${color.light - 10}%)`,
    text: `hsl(${color.hue}, ${color.sat}%, 28%)`,         // Dark text for contrast
    solid: `hsl(${color.hue}, ${color.sat}%, ${color.light}%)`,
  };

  cache.set(name, result);
  return result;
}

export function catStyle(name) {
  const c = categoryColor(name);
  if (!c) return '';
  return `background: ${c.bg}; border: 1px solid ${c.border}; color: ${c.text};`;
}
