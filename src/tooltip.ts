import { data, userById } from './state';
import { $, esc, fmtDateLong, fmtDuration, catOf, avatarHTML, durationMin } from './utils';
import { holidayNameOf } from './constants';

let currentTipBlock: HTMLElement | null = null;
const getTooltipEl = () => $('#memberTooltip');

export function buildMemberTooltipHTML(ownerId: string, dateIso: string): string {
  const owner = userById(ownerId);
  const tasks = (data.daily[dateIso] || [])
    .filter(t => t.ownerId === ownerId)
    .slice()
    .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  const holidayName = holidayNameOf(dateIso);

  let html = `<div class="mt-head">
    ${avatarHTML(owner)}
    <div>
      <div class="mt-name">${esc(owner.name)}</div>
      <div class="mt-date">${esc(fmtDateLong(dateIso))}${holidayName ? ` · 🎉 ${esc(holidayName)}` : ''}</div>
    </div>
  </div>`;

  if (!tasks.length) {
    html += `<div class="mt-empty">Nenhuma atividade neste dia.</div>`;
  } else {
    const done = tasks.filter(t => t.done).length;
    const mins = tasks.reduce((a, t) => a + durationMin(t), 0);
    html += `<div class="mt-summary">${tasks.length} atividade${tasks.length > 1 ? 's' : ''} · ${done} concluída${done === 1 ? '' : 's'} · ${fmtDuration(mins)}</div>`;
    html += `<ul class="mt-list">` + tasks.slice(0, 10).map(t => {
      const cat = catOf(t.cat);
      const timeStr = t.end ? `${t.start || '--:--'}–${t.end}` : (t.start || '--:--');
      return `<li class="${t.done ? 'done' : ''}" style="--c:${cat.color}">
        <span class="mt-time">${esc(timeStr)} · ${esc(cat.label)}</span>
        <span class="mt-title">${esc(t.title)}</span>
        ${t.carteira ? `<span class="mt-car">🏷️ ${esc(t.carteira)}</span>` : ''}
      </li>`;
    }).join('') + (tasks.length > 10 ? `<li class="mt-more">+${tasks.length - 10} mais</li>` : '') + `</ul>`;
  }
  return html;
}

export function showMemberTooltip(block: HTMLElement) {
  const tooltipEl = getTooltipEl();
  if (!tooltipEl) return;
  const oid = block.dataset.moMember;
  const iso = block.dataset.moMemberDate;
  if (!oid || !iso) return;

  tooltipEl.innerHTML = buildMemberTooltipHTML(oid, iso);
  tooltipEl.hidden = false;

  const r = block.getBoundingClientRect();
  const tr = tooltipEl.getBoundingClientRect();
  let left = r.right + 10;
  let top = r.top;

  if (left + tr.width > window.innerWidth - 8) {
    left = r.left - tr.width - 10;
  }
  if (left < 8) left = 8;

  if (top + tr.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - tr.height - 8);
  }
  if (top < 8) top = 8;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

export function hideMemberTooltip() {
  const tooltipEl = getTooltipEl();
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
  tooltipEl.innerHTML = '';
  currentTipBlock = null;
}

export function bindTooltipEvents() {
  const handleMouseOver = (e: MouseEvent) => {
    const block = (e.target as HTMLElement).closest('[data-mo-member]') as HTMLElement;
    if (!block || block === currentTipBlock) return;
    currentTipBlock = block;
    showMemberTooltip(block);
  };

  const handleMouseOut = (e: MouseEvent) => {
    const block = (e.target as HTMLElement).closest('[data-mo-member]') as HTMLElement;
    if (!block || block !== currentTipBlock) return;
    if (block.contains(e.relatedTarget as Node)) return;
    hideMemberTooltip();
  };

  // Week Grid
  const weekGrid = $('#weekGrid');
  if (weekGrid) {
    weekGrid.addEventListener('mouseover', handleMouseOver);
    weekGrid.addEventListener('mouseout', handleMouseOut);
  }

  // Month Grid
  const monthGrid = $('#monthGrid');
  if (monthGrid) {
    monthGrid.addEventListener('mouseover', handleMouseOver);
    monthGrid.addEventListener('mouseout', handleMouseOut);
  }

  window.addEventListener('scroll', hideMemberTooltip, true);
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-mo-member]')) {
      hideMemberTooltip();
    }
  });
}
