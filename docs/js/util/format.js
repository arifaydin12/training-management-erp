const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const moneyFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const moneyFmtExact = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

/** 'YYYY-MM-DD' -> '05 Mar 2026' */
const fix = (s) => s.replace('Sept', 'Sep'); // en-GB abbreviates September as "Sept"
export const formatDate = (iso) => (iso ? fix(dateFmt.format(new Date(`${iso}T00:00:00Z`))) : '-');
export const formatShortDate = (iso) => (iso ? fix(shortFmt.format(new Date(`${iso}T00:00:00Z`))) : '-');
export const formatDateTime = (iso) => (iso ? fix(dateTimeFmt.format(new Date(iso))) : '-');
export const formatMoney = (n) => moneyFmt.format(Number(n) || 0);
export const formatMoneyExact = (n) => moneyFmtExact.format(Number(n) || 0);
export const monthLabel = (ym) => fix(monthFmt.format(new Date(`${ym}-01T00:00:00Z`)));

export function dateRange(start, end) {
  if (!start) return '-';
  return start === end ? formatDate(start) : `${formatShortDate(start)} - ${formatDate(end)}`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#4f46e5', '#0d9488', '#b45309', '#be185d', '#1d4ed8', '#7c3aed', '#047857', '#c2410c'];
export function avatarColor(name = '') {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  enrolled: 'Enrolled',
  attended: 'Attended',
  absent: 'Absent',
  active: 'Active',
  inactive: 'Inactive',
  admin: 'Administrator',
  hr_manager: 'HR manager',
  viewer: 'Viewer',
};

export const label = (key) => LABELS[key] || key;

export function today() {
  return new Date().toISOString().slice(0, 10);
}
