// Dependency-free SVG charts.
import { h } from '../util/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const compact = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

function niceMax(max) {
  if (max <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Vertical column chart.
 * data: [{ label, value, tooltip, kind: 'past'|'current'|'future' }]
 */
export function columnChart({ data, ariaLabel, valuePrefix = '€' }) {
  const W = 640;
  const H = 260;
  const m = { top: 18, right: 8, bottom: 30, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = 4;
  const band = iw / data.length;
  const bw = Math.min(34, band * 0.62);

  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });

  for (let i = 0; i <= ticks; i += 1) {
    const v = (max / ticks) * i;
    const y = m.top + ih - (v / max) * ih;
    svg.append(
      s('line', { class: 'grid-line', x1: m.left, x2: W - m.right, y1: y, y2: y }),
      s('text', { x: m.left - 8, y: y + 4, 'text-anchor': 'end' }, `${valuePrefix}${compact(v)}`),
    );
  }

  data.forEach((d, i) => {
    const x = m.left + band * i + (band - bw) / 2;
    const bh = (d.value / max) * ih;
    const y = m.top + ih - bh;
    const g = s('g');
    g.append(s('title', {}, d.tooltip || `${d.label}: ${d.value}`));
    if (d.value > 0) {
      g.append(s('rect', { class: `bar ${d.kind || 'past'}`, x, y, width: bw, height: bh, rx: 4 }));
      if (bh > 16 || data.length <= 12) g.append(s('text', { class: 'value-label', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle' }, compact(d.value)));
    } else {
      g.append(s('rect', { x, y: m.top + ih - 2, width: bw, height: 2, rx: 1, fill: '#e2e8f0' }));
    }
    g.append(s('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', ...(d.kind === 'current' ? { style: 'font-weight:700;fill:#4338ca' } : {}) }, d.label));
    svg.append(g);
  });
  return svg;
}

/** Donut chart with a centre label. segments: [{ label, value, color }] */
export function donutChart({ segments, centerValue, centerLabel, ariaLabel }) {
  const size = 168;
  const r = 62;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((sum, x) => sum + x.value, 0);

  const svg = s('svg', { class: 'donut', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': ariaLabel });
  svg.append(s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: '#e2e8f0', 'stroke-width': stroke }));

  let offset = 0;
  for (const seg of segments) {
    if (!seg.value) continue;
    const len = (seg.value / total) * c;
    const gap = segments.filter((x) => x.value).length > 1 ? 2 : 0;
    const circle = s('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', stroke: seg.color, 'stroke-width': stroke,
      'stroke-dasharray': `${Math.max(len - gap, 0.5)} ${c - Math.max(len - gap, 0.5)}`,
      'stroke-dashoffset': -offset,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    });
    circle.append(s('title', {}, `${seg.label}: ${seg.value}`));
    svg.append(circle);
    offset += len;
  }
  svg.append(
    s('text', { x: size / 2, y: size / 2 + 4, 'text-anchor': 'middle', style: 'font-size:28px;font-weight:700;fill:#0f172a' }, centerValue),
    s('text', { x: size / 2, y: size / 2 + 22, 'text-anchor': 'middle', style: 'font-size:11px;fill:#64748b' }, centerLabel),
  );
  return svg;
}

/** Horizontal bars rendered as an accessible list. items: [{ label, value }] */
export function hbarList(items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return h(
    'ul',
    { class: 'hbar-list' },
    items.map((item) => {
      const fill = h('span', { class: 'hbar-fill' });
      fill.style.width = `${Math.max((item.value / max) * 100, 2)}%`;
      return h('li', { class: 'hbar' }, h('span', null, item.label), h('span', { class: 'hbar-track', 'aria-hidden': 'true' }, fill), h('span', { class: 'hbar-value' }, String(item.value)));
    }),
  );
}
