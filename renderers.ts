import { data, ui, usersList, currentUser, viewedUser, isLeader, viewingAll, userById, carteirasOf, tasksOfDate, canEditCurrentView, getAllCarteiras } from './state';
import { ALL_MEMBERS, HORA_OPERACIONAL_MIN, PRIO, holidayNameOf } from './constants';
import { $, esc, firstNameOf, fmtDateFull, fmtDateLong, fmtDuration, fmtDurationShort, catOf, taskStatus, avatarHTML, durationMin, isoOf, mondayOf } from './utils';
import { TaskItem, UserProfile } from './types';

export function calcHoraOp(ownerId: string, dateIso: string) {
  const owner = userById(ownerId);
  const carteiras = carteirasOf(owner);
  const dayTasks = (data.daily[dateIso] || []).filter(t =>
    t.ownerId === ownerId && (t.cat === 'hora-operacional' || t.cat === 'acompanhamento')
  );
  let hoMins = 0, acMins = 0;
  dayTasks.forEach(t => {
    const mins = durationMin(t);
    if (t.cat === 'hora-operacional') hoMins += mins;
    else if (t.cat === 'acompanhamento') acMins += mins;
  });
  const totalMins = hoMins + acMins;
  const targetMins = HORA_OPERACIONAL_MIN;
  return { owner, carteiras, totalMins, targetMins, allOk: totalMins >= targetMins, none: totalMins === 0, hoMins, acMins };
}

export function renderHoraOpBanner(owner?: UserProfile | null): string {
  if (!owner || owner.role === 'leader') return '';
  const info = calcHoraOp(owner.id, ui.date);
  const { totalMins, targetMins, allOk, none, hoMins, acMins } = info;
  const pct = Math.min(100, Math.round((totalMins / targetMins) * 100));

  let cls = 'warn', chipLabel = '';
  if (allOk) { cls = 'ok'; chipLabel = '✓ Meta atingida'; }
  else if (none) { cls = 'bad'; chipLabel = `Faltam ${fmtDurationShort(targetMins)}`; }
  else { const falta = Math.max(0, targetMins - totalMins); chipLabel = `Faltam ${fmtDurationShort(falta)}`; }

  const hoPct = Math.min(100, Math.round((hoMins / targetMins) * 100));
  const acPct = Math.min(100, Math.round((acMins / targetMins) * 100));
  const hoState = hoMins >= targetMins ? 'ok' : (hoMins > 0 ? 'warn' : 'bad');
  const acState = acMins > 0 ? 'warn' : 'bad';

  return `<div class="hora-op-banner ${cls}">
    <span class="ico">🕒</span>
    <span class="txt"><b>${esc(owner.name)}</b> — Hora Operacional hoje
      <span class="prog"><i style="width:${pct}%"></i></span>
      <span class="value">${fmtDurationShort(totalMins)}</span> / ${fmtDurationShort(targetMins)}
    </span>
    <span class="status-chip">${chipLabel}</span>
    <div class="carteiras-list">
      <span class="carteira-row ${hoState}"><span class="nm">🕒 Hora Operacional</span><span class="prog-mini"><i style="width:${hoPct}%"></i></span><span class="vl">${fmtDurationShort(hoMins)}</span></span>
      <span class="carteira-row ${acState}"><span class="nm">👥 Acompanhamento</span><span class="prog-mini"><i style="width:${acPct}%"></i></span><span class="vl">${fmtDurationShort(acMins)}</span></span>
    </div>
    <span class="legend-hint">💡 Mínimo de <b>2h por dia</b> somando Hora Operacional + Acompanhamento.</span>
  </div>`;
}

export function horaOpCardHTML(userId: string): string {
  const info = calcHoraOp(userId, ui.date);
  const { totalMins, targetMins, allOk, none } = info;
  const pct = Math.min(100, Math.round((totalMins / targetMins) * 100));

  let cls = 'warn', chipLabel = '', tooltip = '';
  if (allOk) { cls = 'ok'; chipLabel = '✓ Completo'; tooltip = `Meta de 2h atingida (${fmtDurationShort(totalMins)})`; }
  else if (none) { cls = 'bad'; chipLabel = 'Faltam 2h'; tooltip = 'Sem HO/Acompanhamento hoje'; }
  else { const falta = targetMins - totalMins; chipLabel = `Faltam ${fmtDurationShort(falta)}`; tooltip = `${fmtDurationShort(totalMins)} de 2h`; }

  return `<div class="member-hora-op ${cls}" title="${esc(tooltip)}">
    <span class="ico">🕒</span><span class="lbl">HO hoje</span>
    <span class="prog"><i style="width:${pct}%"></i></span>
    <span class="vl">${fmtDurationShort(totalMins)}/2h</span>
    <span class="chip">${chipLabel}</span>
  </div>`;
}

function sortByTime(arr: TaskItem[]): TaskItem[] {
  return arr.slice().sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
}

export function renderDaily() {
  const date = ui.date;
  const viewId = ui.viewUserId;
  const tasks = sortByTime(tasksOfDate(date, viewId));
  const canEdit = canEditCurrentView();
  const other = !!viewedUser() && viewedUser()?.id !== ui.currentUserId;
  const allView = viewingAll();
  const viewed = viewedUser();

  const dailyDateEl = $('#dailyDate') as HTMLInputElement;
  if (dailyDateEl) dailyDateEl.value = date;
  const dailyDateLabel = $('#dailyDateLabel');
  if (dailyDateLabel) dailyDateLabel.textContent = fmtDateLong(date);

  const dailyTitle = $('#dailyTitle');
  const dailySubtitle = $('#dailySubtitle');
  if (allView) {
    if (dailyTitle) dailyTitle.textContent = 'Cronograma da Equipe';
    if (dailySubtitle) dailySubtitle.textContent = 'Todas as atividades de todos os membros.';
  } else if (other && viewed) {
    if (dailyTitle) dailyTitle.textContent = `Agenda de ${viewed.name}`;
    if (dailySubtitle) dailySubtitle.textContent = 'Visualização do cronograma do colaborador.';
  } else {
    if (dailyTitle) dailyTitle.textContent = 'Rotina Diária';
    if (dailySubtitle) dailySubtitle.textContent = 'Suas atividades do dia.';
  }

  const banner = $('#dailyReadonly');
  const bannerText = $('#dailyReadonlyText');
  const bannerHint = $('#dailyReadonlyHint');
  if (banner) {
    if (allView) {
      banner.hidden = false;
      banner.classList.add('all-banner');
      if (bannerText) bannerText.innerHTML = '👥 Você está visualizando o cronograma de <b>todos os membros</b>.';
      if (bannerHint) bannerHint.textContent = 'Use o seletor para filtrar';
    } else if (other && !canEdit && viewed) {
      banner.hidden = false;
      banner.classList.remove('all-banner');
      if (bannerText) bannerText.innerHTML = `Você está visualizando a agenda de <b>${esc(viewed.name)}</b> em modo somente leitura.`;
      if (bannerHint) bannerHint.textContent = 'Sem edição';
    } else {
      banner.hidden = true;
      banner.classList.remove('all-banner');
    }
  }

  const dailyForm = $('#dailyForm');
  if (dailyForm) dailyForm.hidden = !canEdit || allView;

  const carteiras = getAllCarteiras();
  const qCar = $('#qCarteira') as HTMLSelectElement;
  if (qCar) {
    const curVal = qCar.value;
    qCar.innerHTML = carteiras.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (carteiras.includes(curVal)) qCar.value = curVal;
    else if (carteiras.length) qCar.value = carteiras[0];
  }

  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const mins = tasks.reduce((a, t) => a + durationMin(t), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const holidayName = holidayNameOf(date);
  const holidayBanner = holidayName ? `<div class="holiday-tag" style="margin-bottom:12px;">🎉 Feriado: ${esc(holidayName)}</div>` : '';
  const bannerOwner = allView ? null : (viewed || currentUser());
  const horaOpBanner = renderHoraOpBanner(bannerOwner);

  const dailyProgress = $('#dailyProgress');
  if (dailyProgress) {
    dailyProgress.innerHTML = holidayBanner + horaOpBanner + (total ? `
      <div class="progress-top"><strong>${done} de ${total} concluída${total > 1 ? 's' : ''}</strong>
      <span>${pct}% · ${fmtDuration(mins)} planejadas</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    ` : '');
  }

  const list = $('#dailyList');
  if (!list) return;

  if (!total) {
    let msg = 'Nenhuma atividade para este dia.<br><span>Use o campo acima para adicionar sua primeira tarefa.</span>';
    if (allView) msg = 'Nenhuma atividade registrada pela equipe neste dia.';
    else if (other && viewed) msg = `Nenhuma atividade de <b>${esc(viewed.name)}</b> neste dia.`;
    list.innerHTML = `<div class="empty"><span class="big">☀️</span>${msg}</div>`;
  } else {
    list.innerHTML = tasks.map(t => {
      const cat = catOf(t.cat);
      const prio = PRIO[t.prio] || PRIO.media;
      const status = taskStatus(t, date);
      const lateCls = status === 'late' ? 'late' : '';
      const roCls = canEdit ? '' : 'readonly';
      const timeRange = t.end ? `${esc(t.start || '--:--')} – ${esc(t.end)}` : (t.start ? esc(t.start) : '--:--');
      const owner = userById(t.ownerId);

      return `<li class="task ${t.done ? 'done' : ''} ${lateCls} ${roCls}" data-id="${t.id}" data-date="${date}" style="--c:${cat.color}">
        <button class="check" data-act="toggle">${t.done ? '✓' : ''}</button>
        <div class="t-time"><strong>${timeRange}</strong></div>
        <div class="t-main">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-meta">
            ${allView ? `<span class="pill owner-pill" style="--c:${owner.color}">${avatarHTML(owner)}${esc(owner.name)}</span>` : ''}
            <span class="pill" style="--c:${cat.color}">${cat.label}</span>
            ${t.carteira ? `<span class="pill carteira">🏷️ ${esc(t.carteira)}</span>` : ''}
            ${t.prio && t.prio !== 'media' ? `<span class="pill prio-${t.prio}">${prio.label}</span>` : ''}
            ${status === 'late' ? `<span class="pill" style="--c:#ef4444">Atrasada</span>` : ''}
            ${t.notes ? `<span class="note">${esc(t.notes)}</span>` : ''}
          </div>
        </div>
        ${canEdit ? `<div class="t-actions">
          <button data-act="edit" title="Editar">✎</button>
          <button data-act="del" title="Excluir">🗑</button>
        </div>` : `<div></div>`}
      </li>`;
    }).join('');
  }

  renderCalendar();
}

export function renderCalendar() {
  const { year, month } = ui.calMonth;
  const first = new Date(year, month, 1);
  const dow1 = first.getDay();
  let startDate = new Date(year, month, dow1 === 0 ? 2 : (dow1 === 1 ? 1 : 1 - (dow1 - 1)));
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const cells: { date: Date; other: boolean }[] = [];
  const cur = new Date(startDate);
  let safety = 0;
  while (safety++ < 100) {
    if (cur.getDay() !== 0) cells.push({ date: new Date(cur), other: cur.getMonth() !== month });
    if (cur >= lastDayOfMonth && cur.getDay() === 6) break;
    cur.setDate(cur.getDate() + 1);
  }
  while (cells.length % 6 !== 0) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) cells.push({ date: new Date(cur), other: true });
  }

  const todayIso = new Date().toLocaleDateString('sv-SE');
  const viewId = ui.viewUserId;
  let monthTotal = 0;

  const calTitle = $('#calTitle');
  if (calTitle) calTitle.textContent = first.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

  const calGrid = $('#calGrid');
  if (calGrid) {
    calGrid.innerHTML = cells.map(c => {
      const iso = isoOf(c.date);
      const tasks = tasksOfDate(iso, viewId);
      const count = tasks.length;
      const doneCount = tasks.filter(t => t.done).length;
      const allDone = count > 0 && doneCount === count;
      const hasLate = tasks.some(t => taskStatus(t, iso) === 'late');
      const isToday = iso === todayIso;
      const isSelected = iso === ui.date;
      const holidayName = holidayNameOf(iso);

      if (!c.other) monthTotal += count;
      const dotColors: string[] = [];
      const seen = new Set<string>();
      for (const t of tasks) {
        const cor = catOf(t.cat).color;
        if (!seen.has(cor)) { seen.add(cor); dotColors.push(cor); }
        if (dotColors.length >= 4) break;
      }

      const title = holidayName ? `🎉 ${holidayName}` : `${count} atividade(s)`;
      return `<button class="cal-cell ${c.other ? 'other' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${count ? 'has-tasks' : ''} ${allDone ? 'all-done' : ''} ${hasLate ? 'has-late' : ''} ${holidayName ? 'holiday' : ''}" data-date="${iso}" title="${esc(title)}">
        <span class="cal-num">${c.date.getDate()}</span>
        ${count ? `<span class="cal-badge">${count}</span>` : ''}
        ${dotColors.length ? `<span class="cal-dots">${dotColors.map(cor => `<i style="background:${cor}"></i>`).join('')}</span>` : ''}
      </button>`;
    }).join('');
  }

  const calMonthTotal = $('#calMonthTotal');
  if (calMonthTotal) calMonthTotal.textContent = `${monthTotal} no mês`;
}

export function renderWeekly() {
  const monday = mondayOf(ui.date);
  const todayIso = new Date().toLocaleDateString('sv-SE');
  const viewId = ui.viewUserId;
  const canEdit = canEditCurrentView();
  const allView = viewingAll();
  const viewed = viewedUser();
  const compactMode = !allView;

  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    weekDates.push(dt);
  }
  const sun = weekDates[6];
  const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;

  const wkLabel = $('#wkLabel');
  if (wkLabel) wkLabel.textContent = `${fmt(monday)} – ${fmt(sun)}`;

  const weeklyTitle = $('#weeklyTitle');
  const weeklySubtitle = $('#weeklySubtitle');
  if (allView) {
    if (weeklyTitle) weeklyTitle.textContent = 'Semana da Equipe';
    if (weeklySubtitle) weeklySubtitle.textContent = 'Clique no bloco do membro para abrir no Diário.';
  } else if (compactMode && viewed) {
    if (weeklyTitle) weeklyTitle.textContent = `Semana de ${viewed.name}`;
    if (weeklySubtitle) weeklySubtitle.textContent = 'Visualização compacta.';
  } else {
    if (weeklyTitle) weeklyTitle.textContent = 'Visão Semanal';
    if (weeklySubtitle) weeklySubtitle.textContent = 'Carteiras e categorias por dia.';
  }

  const banner = $('#weeklyReadonly');
  const bannerText = $('#weeklyReadonlyText');
  if (banner) {
    banner.classList.remove('all-banner', 'compact-banner');
    if (allView) {
      banner.hidden = false;
      banner.classList.add('all-banner');
      if (bannerText) bannerText.innerHTML = '👥 Você está visualizando a semana de <b>todos os membros</b>.';
    } else if (compactMode) {
      banner.hidden = false;
      banner.classList.add('compact-banner');
      if (bannerText) bannerText.innerHTML = `🎨 Visualização compacta — <b>carteira e categoria</b> de cada tarefa.`;
    } else {
      banner.hidden = true;
    }
  }

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const grid = $('#weekGrid');
  if (!grid) return;

  grid.innerHTML = weekDates.map(dt => {
    const iso = isoOf(dt);
    const tasks = sortByTime(tasksOfDate(iso, viewId));
    const isToday = iso === todayIso;
    const isSelected = iso === ui.date;
    const label = dayNames[dt.getDay()];
    const holidayName = holidayNameOf(iso);

    let bodyHTML = '';
    if (!tasks.length) {
      bodyHTML = `<div class="wk-empty">livre</div>`;
    } else if (allView) {
      const byOwner: Record<string, TaskItem[]> = {};
      tasks.forEach(t => {
        if (!byOwner[t.ownerId]) byOwner[t.ownerId] = [];
        byOwner[t.ownerId].push(t);
      });
      const ownerIds = Object.keys(byOwner).sort((a, b) => byOwner[b].length - byOwner[a].length);
      bodyHTML = ownerIds.map(oid => {
        const owner = userById(oid);
        const cnt = byOwner[oid].length;
        return `<button type="button" class="wk-member-block" data-mo-member="${oid}" data-mo-member-date="${iso}" style="--mc:${owner.color}">
          ${avatarHTML(owner)}
          <span class="mb-name">${esc(firstNameOf(owner.name))}</span>
          <span class="mb-count">${cnt}</span>
        </button>`;
      }).join('');
    } else {
      bodyHTML = tasks.map(t => {
        const cat = catOf(t.cat);
        const lateCls = taskStatus(t, iso) === 'late' ? 'late' : '';
        const doneCls = t.done ? 'done' : '';
        return `<div class="wk-item-compact ${doneCls} ${lateCls}" data-goto-daily="${iso}" style="--c:${cat.color}">
          <span class="wk-cat">${esc(cat.label)}</span>
          ${t.carteira ? `<span class="wk-car">🏷️ ${esc(t.carteira)}</span>` : `<span class="wk-nodata">sem carteira</span>`}
        </div>`;
      }).join('');
    }

    return `<div class="day-col ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${holidayName ? 'is-holiday' : ''}">
      <div class="day-head">
        <div>
          <div class="name" data-goto="${iso}">${label} · ${String(dt.getDate()).padStart(2, '0')}</div>
          <div class="day-count">${tasks.length} ${tasks.length === 1 ? 'item' : 'itens'}</div>
          ${holidayName ? `<div class="holiday-tag">🎉 ${esc(holidayName)}</div>` : ''}
        </div>
        ${canEdit && !allView && !compactMode ? `<button class="add" data-add-date="${iso}">+</button>` : ''}
      </div>
      ${bodyHTML}
    </div>`;
  }).join('');
}

export function renderMonth() {
  const { year, month } = ui.calMonth;
  const first = new Date(year, month, 1);
  const dow1 = first.getDay();
  let startDate = new Date(year, month, dow1 === 0 ? -5 : (dow1 === 1 ? 1 : 1 - (dow1 - 1)));
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const cells: { date: Date; other: boolean }[] = [];
  const cur = new Date(startDate);
  let safety = 0;
  while (safety++ < 100) {
    cells.push({ date: new Date(cur), other: cur.getMonth() !== month });
    if (cur >= lastDayOfMonth && cur.getDay() === 0) break;
    cur.setDate(cur.getDate() + 1);
  }
  while (cells.length % 7 !== 0) {
    cur.setDate(cur.getDate() + 1);
    cells.push({ date: new Date(cur), other: true });
  }

  const todayIso = new Date().toLocaleDateString('sv-SE');
  const viewId = ui.viewUserId;
  const canEdit = canEditCurrentView();
  const allView = viewingAll();
  const viewed = viewedUser();
  const compactMode = !allView;

  const monthTitle = $('#monthTitle');
  const monthSubtitle = $('#monthSubtitle');
  if (allView) {
    if (monthTitle) monthTitle.textContent = 'Mês da Equipe';
    if (monthSubtitle) monthSubtitle.textContent = 'Todos os membros com tarefas no dia.';
  } else if (compactMode && viewed) {
    if (monthTitle) monthTitle.textContent = `Mês de ${viewed.name}`;
    if (monthSubtitle) monthSubtitle.textContent = 'Visualização compacta.';
  } else {
    if (monthTitle) monthTitle.textContent = 'Visão Mensal';
    if (monthSubtitle) monthSubtitle.textContent = 'Carteiras e categorias por dia.';
  }

  const moLabel = $('#moLabel');
  if (moLabel) moLabel.textContent = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const banner = $('#monthReadonly');
  const bannerText = $('#monthReadonlyText');
  if (banner) {
    banner.classList.remove('all-banner', 'compact-banner');
    if (allView) {
      banner.hidden = false;
      banner.classList.add('all-banner');
      if (bannerText) bannerText.innerHTML = '👥 Você está visualizando o mês de <b>todos os membros</b>.';
    } else if (compactMode) {
      banner.hidden = false;
      banner.classList.add('compact-banner');
      if (bannerText) bannerText.innerHTML = `🎨 Visualização compacta — <b>carteira e categoria</b> de cada tarefa.`;
    } else {
      banner.hidden = true;
    }
  }

  const MAX_TASKS_INDIVIDUAL = 5;
  const grid = $('#monthGrid');
  if (!grid) return;

  grid.innerHTML = cells.map(c => {
    const iso = isoOf(c.date);
    const tasks = sortByTime(tasksOfDate(iso, viewId));
    const isToday = iso === todayIso;
    const isSelected = iso === ui.date;
    const holidayName = holidayNameOf(iso);
    const isSunday = c.date.getDay() === 0;
    const showAdd = !holidayName && !c.other && canEdit && !allView && !compactMode;

    let tasksHTML = '';
    if (allView) {
      const byOwner: Record<string, TaskItem[]> = {};
      tasks.forEach(t => {
        if (!byOwner[t.ownerId]) byOwner[t.ownerId] = [];
        byOwner[t.ownerId].push(t);
      });
      const ownerIds = Object.keys(byOwner).sort((a, b) => byOwner[b].length - byOwner[a].length);
      tasksHTML = ownerIds.map(oid => {
        const owner = userById(oid);
        const cnt = byOwner[oid].length;
        return `<button type="button" class="month-member-block" data-mo-member="${oid}" data-mo-member-date="${iso}" style="--mc:${owner.color}">
          ${avatarHTML(owner)}
          <span class="mb-name">${esc(firstNameOf(owner.name))}</span>
          <span class="mb-count">${cnt}</span>
        </button>`;
      }).join('');
    } else {
      const visibleTasks = tasks.slice(0, MAX_TASKS_INDIVIDUAL);
      const extraCount = Math.max(0, tasks.length - MAX_TASKS_INDIVIDUAL);
      tasksHTML = visibleTasks.map(t => {
        const cat = catOf(t.cat);
        const status = taskStatus(t, iso);
        const doneCls = t.done ? 'done' : '';
        const lateCls = status === 'late' ? 'late' : '';
        return `<div class="month-task-compact ${doneCls} ${lateCls}" data-goto-daily="${iso}" style="--c:${cat.color}">
          <span class="mt-cat">${esc(cat.label)}</span>
          ${t.carteira ? `<span class="mt-car">🏷️ ${esc(t.carteira)}</span>` : `<span class="mt-nodata">sem carteira</span>`}
        </div>`;
      }).join('') + (extraCount ? `<div class="month-more">+${extraCount} mais</div>` : '');
    }

    return `<div class="month-day ${c.other ? 'other' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${holidayName ? 'holiday' : ''} ${isSunday ? 'sunday' : ''}" data-mo-day="${iso}">
      <div class="month-day-head">
        <span class="month-day-num">${c.date.getDate()}</span>
        ${tasks.length ? `<span class="month-day-count">${tasks.length}</span>` : ''}
        ${showAdd ? `<button class="month-day-add" data-mo-add="${iso}">+</button>` : ''}
      </div>
      ${holidayName ? `<div class="month-day-holiday">🎉 ${esc(holidayName)}</div>` : ''}
      ${tasksHTML ? `<div class="month-day-tasks">${tasksHTML}</div>` : ''}
      ${holidayName && !tasks.length ? `<div class="month-day-locked">🔒 Sem agendamento</div>` : ''}
    </div>`;
  }).join('');
}

export function renderDashboard() {
  const targetId = ui.viewUserId || ui.currentUserId;
  let total = 0, done = 0, mins = 0, late = 0;
  const catCount: Record<string, number> = {};
  const carteiraCount: Record<string, number> = {};
  const todayIso = new Date().toLocaleDateString('sv-SE');

  Object.entries(data.daily).forEach(([iso, arr]) => {
    arr.forEach(t => {
      if (targetId !== ALL_MEMBERS && t.ownerId !== targetId) return;
      if (ui.carteiraFilter && t.carteira !== ui.carteiraFilter) return;
      if (ui.categoriaFilter && t.cat !== ui.categoriaFilter) return;
      total++;
      if (t.done) done++;
      else if (iso < todayIso) late++;
      mins += durationMin(t);
      catCount[t.cat] = (catCount[t.cat] || 0) + 1;
      const k = t.carteira || '(sem carteira)';
      carteiraCount[k] = (carteiraCount[k] || 0) + 1;
    });
  });

  const pct = total ? Math.round((done / total) * 100) : 0;
  const allView = viewingAll();
  const viewed = viewedUser();
  const other = !!viewed && viewed.id !== ui.currentUserId;

  const dashTitle = $('#dashTitle');
  const dashSubtitle = $('#dashSubtitle');
  if (allView) {
    if (dashTitle) dashTitle.textContent = 'Painel da Equipe';
    if (dashSubtitle) dashSubtitle.textContent = 'Indicadores consolidados de todos os membros.';
  } else if (other && viewed) {
    if (dashTitle) dashTitle.textContent = `Painel de ${viewed.name}`;
    if (dashSubtitle) dashSubtitle.textContent = 'Visão de produtividade.';
  } else {
    if (dashTitle) dashTitle.textContent = 'Meu painel';
    if (dashSubtitle) dashSubtitle.textContent = 'Sua visão pessoal.';
  }

  const monday = mondayOf(todayIso);
  const weekDates: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    weekDates.push(dt);
  }
  const weekValues = weekDates.map(dt => tasksOfDate(isoOf(dt), targetId).length);
  const weekLabels = weekDates.map(dt => dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
  const todayIdx = weekDates.findIndex(dt => isoOf(dt) === todayIso);
  const weekTotal = weekValues.reduce((a, b) => a + b, 0);

  const dashContent = $('#dashContent');
  if (!dashContent) return;

  const maxVal = Math.max(1, ...weekValues);
  const barsHTML = `<div class="bars">${weekValues.map((v, i) => `<div class="bar-col ${i === todayIdx ? 'today' : ''}">
    <div class="bar-val">${v || ''}</div>
    <div class="bar-wrap"><div class="bar-fill ${v ? '' : 'zero'}" style="height:${v ? Math.max(6, (v / maxVal) * 100) : 0}%"></div></div>
    <div class="bar-label">${weekLabels[i]}</div>
  </div>`).join('')}</div>`;

  dashContent.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card blue"><div class="k">Total de tarefas</div><div class="v">${total}</div><div class="s">${done} concluídas · ${total - done} pendentes</div></div>
      <div class="stat-card green"><div class="k">Conclusão</div><div class="v">${pct}%</div><div class="s">${fmtDuration(mins)} planejadas</div></div>
      <div class="stat-card danger"><div class="k">Atrasadas</div><div class="v">${late}</div><div class="s">não concluídas de dias passados</div></div>
      <div class="stat-card purple"><div class="k">Esta semana</div><div class="v">${weekTotal}</div><div class="s">tarefas na semana atual</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>🗓️ Semana atual</h3><span class="chip">Seg a Sáb</span></div>
      ${barsHTML}
    </div>
  `;
}

export function renderTeam() {
  const byUser: Record<string, { total: number; done: number; pending: number; late: number; user: UserProfile }> = {};
  usersList().forEach(u => { byUser[u.id] = { total: 0, done: 0, pending: 0, late: 0, user: u }; });
  let total = 0, done = 0, pending = 0, late = 0;
  const todayIso = new Date().toLocaleDateString('sv-SE');

  Object.entries(data.daily).forEach(([iso, arr]) => {
    arr.forEach(t => {
      const bucket = byUser[t.ownerId];
      const st = taskStatus(t, iso);
      total++;
      if (st === 'done') done++;
      else if (st === 'late') late++;
      else pending++;
      if (bucket) {
        bucket.total++;
        if (st === 'done') bucket.done++;
        else if (st === 'late') bucket.late++;
        else bucket.pending++;
      }
    });
  });

  const wrap = $('#teamOverviewWrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card blue"><div class="k">Total de ações</div><div class="v">${total}</div><div class="s">${usersList().length} membro(s)</div></div>
      <div class="stat-card green"><div class="k">Concluídas</div><div class="v">${done}</div><div class="s">${total ? Math.round((done / total) * 100) : 0}% do total</div></div>
      <div class="stat-card warn"><div class="k">Pendentes</div><div class="v">${pending}</div><div class="s">dentro do prazo</div></div>
      <div class="stat-card danger"><div class="k">Atrasadas</div><div class="v">${late}</div><div class="s">não concluídas</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>👤 Resumo por membro</h3>
        <span class="chip">clique para filtrar · ✎ editar · ✕ excluir</span>
      </div>
      <div class="members-grid">
        ${usersList().map(u => {
          const b = byUser[u.id] || { total: 0, done: 0, pending: 0, late: 0 };
          const isActive = ui.teamUserFilter === u.id;
          const isMe = u.id === ui.currentUserId;
          const carteiras = carteirasOf(u);

          return `<div class="member-card ${isActive ? 'active' : ''} ${isMe ? 'is-me' : ''}" data-user-filter="${u.id}" style="--c:${u.color}">
            ${!isMe ? `
              <button class="member-edit" data-act="edit-member" data-user-id="${u.id}" title="Editar">✎</button>
              <button class="member-delete" data-act="delete-member" data-user-id="${u.id}" title="Remover">✕</button>
            ` : ''}
            <div class="member-top">
              ${avatarHTML(u)}
              <div class="info">
                <div class="nm">${esc(u.name)}</div>
                ${u.cargo ? `<div class="cargo">${esc(u.cargo)}</div>` : ''}
                ${u.email ? `<div class="email">✉ ${esc(u.email)}</div>` : ''}
              </div>
              <span class="role-icon" title="${u.role === 'leader' ? 'Líder' : 'Membro'}">${u.role === 'leader' ? '⭐' : '👤'}</span>
            </div>
            ${carteiras.length ? `<div class="member-carteiras">${carteiras.map(c => `<span class="carteira-chip">${esc(c)}</span>`).join('')}</div>` : ''}
            ${u.role === 'leader' ? '' : horaOpCardHTML(u.id)}
            <div class="member-stats">
              <div class="col g"><div class="v">${b.done}</div><div class="k">Feitas</div></div>
              <div class="col y"><div class="v">${b.pending}</div><div class="k">Pend.</div></div>
              <div class="col r"><div class="v">${b.late}</div><div class="k">Atras.</div></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

export function refreshTopbarCarteiras() {
  const el = $('#topbarCarteiras');
  if (!el) return;
  if (viewingAll()) {
    el.innerHTML = `<span class="carteira-chip all-members">👥 Todos os membros</span>`;
    return;
  }
  const viewed = viewedUser() || currentUser();
  if (!viewed) { el.innerHTML = ''; return; }
  const me = currentUser();
  if (viewed.id !== me?.id) {
    el.innerHTML = `<span class="carteira-chip none" style="text-transform:none;letter-spacing:0;">👁 ${esc(viewed.name)}</span>`;
    return;
  }
  const carteiras = carteirasOf(viewed);
  if (!carteiras.length) { el.innerHTML = ''; return; }
  el.innerHTML = carteiras.map(c => `<span class="carteira-chip">${esc(c)}</span>`).join('');
}
