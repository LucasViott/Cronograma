import { PlannedTask, TaskItem } from './types';
import { data, ui, saveState, currentUser, usersList, userById, isLeader, getAllCarteiras } from './state';
import { $, $$, esc, uid, todayISO, showConfirm, catOf } from './utils';
import './plannedTasks.css';

let activeFilter: 'all' | 'pending' | 'alerts' | 'done' = 'all';
let searchQuery = '';
let isPanelOpen = false;
let editingTaskId: string | null = null;

/**
 * Calculates calendar day difference between endDate and today.
 * 0 = ends today
 * 1 = ends tomorrow (1 day left)
 * 2 = 2 days left
 * < 0 = overdue
 * > 2 = more than 2 days left
 */
export function getDaysDiff(endDateStr: string): number {
  if (!endDateStr) return 999;
  const parts = String(endDateStr).trim().split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  target.setHours(0, 0, 0, 0);
  if (isNaN(target.getTime())) return 999;
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats YYYY-MM-DD into DD/MM/YYYY
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const parts = String(dateStr).trim().split('-');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Calculates progress percent (0 - 100) between start and end date relative to today
 */
export function calculateTimelineProgress(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const sParts = String(startDateStr).trim().split('-').map(Number);
  const eParts = String(endDateStr).trim().split('-').map(Number);
  if (sParts.length < 3 || eParts.length < 3 || isNaN(sParts[0]) || isNaN(sParts[1]) || isNaN(sParts[2]) || isNaN(eParts[0]) || isNaN(eParts[1]) || isNaN(eParts[2])) {
    return 0;
  }
  const today = new Date().setHours(0, 0, 0, 0);
  const start = new Date(sParts[0], sParts[1] - 1, sParts[2]).setHours(0, 0, 0, 0);
  const end = new Date(eParts[0], eParts[1] - 1, eParts[2]).setHours(0, 0, 0, 0);

  if (end <= start) return today >= end ? 100 : 0;
  if (today <= start) return 0;
  if (today >= end) return 100;
  const total = end - start;
  const elapsed = today - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Returns planned tasks that need pop-up alerts:
 * Active (not done) and diff is 0, 1, or 2 days, or overdue (< 0)
 */
export function getAlertTasks(): PlannedTask[] {
  const tasks = data.plannedTasks || [];
  return tasks.filter(t => {
    if (t.done) return false;
    const diff = getDaysDiff(t.endDate);
    return diff <= 2;
  }).sort((a, b) => getDaysDiff(a.endDate) - getDaysDiff(b.endDate));
}

/**
 * Returns routine/daily tasks from the cronograma that are late/overdue:
 * dateIso < todayISO() and !t.done
 */
export function getLateCronogramaTasks(): { task: TaskItem; date: string }[] {
  const result: { task: TaskItem; date: string }[] = [];
  const curId = ui.currentUserId;
  const isLead = isLeader();
  const today = todayISO();

  for (const [dateIso, taskList] of Object.entries(data.daily || {})) {
    if (dateIso >= today) continue;
    for (const t of taskList) {
      if (!t.done) {
        if (isLead || t.ownerId === curId) {
          result.push({ task: t, date: dateIso });
        }
      }
    }
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Synchronizes the --topbar-height CSS variable with the exact DOM height of #appTopbar
 */
export function syncTopbarHeight() {
  const topbar = $('#appTopbar');
  if (topbar && !topbar.hidden) {
    const h = topbar.offsetHeight;
    if (h > 0) {
      document.documentElement.style.setProperty('--topbar-height', `${h}px`);
    }
  }
}

/**
 * Toggle open / close planned tasks side panel
 */
export function togglePlannedTasksPanel(open?: boolean) {
  const panel = $('#plannedTasksPanel');
  const backdrop = $('#plannedTasksBackdrop');
  const tab = $('#plannedTasksTab');
  if (!panel || !tab) return;

  syncTopbarHeight();
  isPanelOpen = typeof open === 'boolean' ? open : !isPanelOpen;

  if (isPanelOpen) {
    if (backdrop) {
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          backdrop.classList.add('open');
        });
      });
    }
    panel.classList.add('open');
    tab.classList.add('active');
    populateCarteiraOptions();
    renderPlannedTasksList();
  } else {
    panel.classList.remove('open');
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => {
        if (!isPanelOpen) backdrop.hidden = true;
      }, 350);
    }
    tab.classList.remove('active');
  }
}

/**
 * Populates carteira select in the modal form
 */
export function populateCarteiraOptions() {
  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  if (carteiraSel) {
    const curVal = carteiraSel.value;
    const allCarteiras = getAllCarteiras();
    carteiraSel.innerHTML = `<option value="">(Sem carteira específica)</option>` +
      allCarteiras.map(c => `<option value="${c}" ${curVal === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
}

export const populateFormOptions = populateCarteiraOptions;

/**
 * Opens the pop-up modal to add a new planned task or edit an existing one
 */
export function openPlannedTaskModal(taskId?: string) {
  const modal = $('#plannedTaskModal');
  const form = $('#plannedTaskModalForm') as HTMLFormElement;
  if (!modal || !form) return;

  populateCarteiraOptions();
  editingTaskId = taskId || null;

  const modalTitle = $('#plannedModalTitle');
  const editIdInput = $('#plannedEditId') as HTMLInputElement;
  const titleInput = $('#plannedTitle') as HTMLInputElement;
  const startInput = $('#plannedStartDate') as HTMLInputElement;
  const endInput = $('#plannedEndDate') as HTMLInputElement;
  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  const prioSel = $('#plannedPriority') as HTMLSelectElement;
  const notesInput = $('#plannedNotes') as HTMLTextAreaElement;
  const submitBtn = $('#plannedModalSubmit');

  if (taskId) {
    const task = (data.plannedTasks || []).find(t => t.id === taskId);
    if (!task) return;

    if (modalTitle) modalTitle.textContent = '✏️ Editar Tarefa Planejada';
    if (submitBtn) submitBtn.textContent = 'Salvar Alterações';
    if (editIdInput) editIdInput.value = task.id;
    if (titleInput) titleInput.value = task.title;
    if (startInput) startInput.value = task.startDate || todayISO();
    if (endInput) endInput.value = task.endDate || todayISO();
    if (carteiraSel) carteiraSel.value = task.carteira || '';
    if (prioSel) prioSel.value = task.prio || 'media';
    if (notesInput) notesInput.value = task.notes || '';
  } else {
    form.reset();
    if (modalTitle) modalTitle.textContent = '＋ Nova Tarefa Planejada';
    if (submitBtn) submitBtn.textContent = 'Adicionar Tarefa';
    if (editIdInput) editIdInput.value = '';

    const today = todayISO();
    if (startInput) startInput.value = today;
    if (endInput) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      endInput.value = d.toLocaleDateString('sv-SE');
    }
  }

  modal.hidden = false;
  setTimeout(() => titleInput?.focus(), 60);
}

/**
 * Closes the planned task creation/edit modal
 */
export function closePlannedTaskModal() {
  const modal = $('#plannedTaskModal');
  if (modal) modal.hidden = true;
  editingTaskId = null;
}

/**
 * Handles submission of the planned task modal form
 */
function handleModalFormSubmit(e: SubmitEvent) {
  e.preventDefault();

  const titleInput = $('#plannedTitle') as HTMLInputElement;
  const startInput = $('#plannedStartDate') as HTMLInputElement;
  const endInput = $('#plannedEndDate') as HTMLInputElement;
  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  const prioSel = $('#plannedPriority') as HTMLSelectElement;
  const notesInput = $('#plannedNotes') as HTMLTextAreaElement;

  const title = titleInput.value.trim();
  const startDate = startInput.value;
  const endDate = endInput.value;
  const ownerId = ui.currentUserId || currentUser()?.id || '';
  const carteira = carteiraSel?.value || '';
  const prio = (prioSel?.value as any) || 'media';
  const notes = notesInput?.value.trim() || '';

  if (!title || !startDate || !endDate) return;

  if (!data.plannedTasks) data.plannedTasks = [];

  const now = Date.now();

  if (editingTaskId) {
    const idx = data.plannedTasks.findIndex(t => t.id === editingTaskId);
    if (idx !== -1) {
      data.plannedTasks[idx] = {
        ...data.plannedTasks[idx],
        title,
        startDate,
        endDate,
        carteira,
        prio,
        notes,
        updatedAt: now
      };
    }
  } else {
    const newTask: PlannedTask = {
      id: uid(),
      title,
      startDate,
      endDate,
      ownerId,
      carteira,
      prio,
      notes,
      done: false,
      createdAt: now,
      updatedAt: now
    };
    data.plannedTasks.unshift(newTask);

    const diff = getDaysDiff(endDate);
    if (diff === 0 || diff === 1 || diff === 2) {
      setTimeout(() => {
        showPlannedTasksAlertModal(true);
      }, 350);
    }
  }

  saveState(true);
  closePlannedTaskModal();
  renderPlannedTasksList();
  updatePlannedTasksBadge();
}

/**
 * Toggle task done state
 */
export function toggleTaskDone(taskId: string) {
  if (!data.plannedTasks) return;
  const task = data.plannedTasks.find(t => t.id === taskId);
  if (!task) return;

  task.done = !task.done;
  task.updatedAt = Date.now();
  saveState(true);
  renderPlannedTasksList();
  updatePlannedTasksBadge();
}

/**
 * Delete a planned task with confirmation
 */
export async function deleteTask(taskId: string) {
  const task = (data.plannedTasks || []).find(t => t.id === taskId);
  if (!task) return;

  const confirmed = await showConfirm(
    `Tem certeza que deseja excluir a tarefa planejada <b>"${esc(task.title)}"</b>?`,
    'Excluir Tarefa Planejada',
    { danger: true, icon: '🗑️', confirmText: 'Excluir' }
  );

  if (!confirmed) return;

  if (!data.deletedTaskIds) data.deletedTaskIds = {};
  data.deletedTaskIds[taskId] = Date.now();

  data.plannedTasks = (data.plannedTasks || []).filter(t => t.id !== taskId);
  saveState(true);

  renderPlannedTasksList();
  updatePlannedTasksBadge();
}

/**
 * Updates badge counters on the tab, topbar alerts button, and side panel
 */
export function updatePlannedTasksBadge() {
  const tasks = data.plannedTasks || [];
  const alertTasks = getAlertTasks();
  const lateCronograma = getLateCronogramaTasks();
  const totalAlerts = alertTasks.length + lateCronograma.length;

  // Topbar alerts button badge
  const topbarBadge = $('#topbarAlertsBadge');
  const topbarBtn = $('#topbarAlertsBtn');
  if (topbarBadge) {
    if (totalAlerts > 0) {
      topbarBadge.textContent = String(totalAlerts);
      topbarBadge.hidden = false;
      if (topbarBtn) {
        topbarBtn.classList.add('has-alerts');
        topbarBtn.title = `${totalAlerts} alerta(s): ${alertTasks.length} tarefa(s) planejada(s), ${lateCronograma.length} ação(ões) atrasada(s)`;
      }
    } else {
      topbarBadge.hidden = true;
      if (topbarBtn) {
        topbarBtn.classList.remove('has-alerts');
        topbarBtn.title = 'Nenhum alerta pendente';
      }
    }
  }

  // Lateral tab badge
  const tabBadge = $('#plannedTasksTabBadge');
  if (tabBadge) {
    if (alertTasks.length > 0) {
      tabBadge.textContent = String(alertTasks.length);
      tabBadge.hidden = false;
      tabBadge.title = `${alertTasks.length} tarefa(s) planejada(s) com prazo em 2, 1 ou hoje!`;
    } else {
      tabBadge.hidden = true;
    }
  }

  // Side panel filter counts
  const countAll = $('#countAll');
  if (countAll) countAll.textContent = String(tasks.length);

  const countPending = $('#countPending');
  if (countPending) countPending.textContent = String(tasks.filter(t => !t.done).length);

  const countAlerts = $('#countAlerts');
  if (countAlerts) countAlerts.textContent = String(alertTasks.length);

  const countDone = $('#countDone');
  if (countDone) countDone.textContent = String(tasks.filter(t => t.done).length);
}

/**
 * Renders the list of planned tasks inside the side panel (Status view only)
 */
export function renderPlannedTasksList() {
  const listEl = $('#plannedTasksList');
  if (!listEl) return;

  updatePlannedTasksBadge();

  let tasks = (data.plannedTasks || []).slice();

  // Filter tab
  if (activeFilter === 'pending') {
    tasks = tasks.filter(t => !t.done);
  } else if (activeFilter === 'done') {
    tasks = tasks.filter(t => t.done);
  } else if (activeFilter === 'alerts') {
    tasks = tasks.filter(t => {
      if (t.done) return false;
      const diff = getDaysDiff(t.endDate);
      return diff <= 2;
    });
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    tasks = tasks.filter(t => {
      const owner = userById(t.ownerId);
      return t.title.toLowerCase().includes(q) ||
        (t.carteira || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        owner.name.toLowerCase().includes(q);
    });
  }

  // Sorting: Active first (by urgency diff), then completed
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const diffA = getDaysDiff(a.endDate);
    const diffB = getDaysDiff(b.endDate);
    return diffA - diffB;
  });

  if (tasks.length === 0) {
    listEl.innerHTML = `
      <div class="planned-empty">
        <div class="empty-ico">🎯</div>
        <h4>Nenhuma tarefa planejada encontrada</h4>
        <p>${activeFilter === 'alerts' ? 'Não há tarefas com prazo para hoje, amanhã ou em 2 dias.' : 'Clique no botão <b>＋ Nova Tarefa</b> acima para cadastrar um planejamento com prazo.'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = tasks.map(task => {
    const diff = getDaysDiff(task.endDate);
    const progress = calculateTimelineProgress(task.startDate, task.endDate);
    const owner = userById(task.ownerId);

    let statusChipClass = 'chip-future';
    let statusLabel = `Faltam ${diff} dias`;
    let isUrgent = false;

    if (task.done) {
      statusChipClass = 'chip-done';
      statusLabel = '✓ Concluída';
    } else if (diff === 0) {
      statusChipClass = 'chip-today';
      statusLabel = '🚨 Finaliza HOJE!';
      isUrgent = true;
    } else if (diff === 1) {
      statusChipClass = 'chip-tomorrow';
      statusLabel = '⏰ Falta 1 dia (Amanhã)';
      isUrgent = true;
    } else if (diff === 2) {
      statusChipClass = 'chip-two-days';
      statusLabel = '⚠️ Faltam 2 dias';
      isUrgent = true;
    } else if (diff < 0) {
      statusChipClass = 'chip-overdue';
      statusLabel = `⚠️ Atrasada (${Math.abs(diff)}d)`;
      isUrgent = true;
    }

    const prioBadge = task.prio === 'alta'
      ? `<span class="planned-prio high">Alta</span>`
      : task.prio === 'baixa'
        ? `<span class="planned-prio low">Baixa</span>`
        : `<span class="planned-prio med">Média</span>`;

    const carteiraBadge = task.carteira
      ? `<span class="planned-carteira-chip">🏷️ ${esc(task.carteira)}</span>`
      : '';

    return `
      <div class="planned-item-card ${task.done ? 'is-done' : ''} ${isUrgent ? 'is-urgent' : ''}" data-id="${task.id}">
        <div class="item-head">
          <label class="custom-check" title="${task.done ? 'Marcar como pendente' : 'Marcar como concluída'}">
            <input type="checkbox" class="task-done-toggle" data-id="${task.id}" ${task.done ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <div class="item-title-wrap">
            <div class="item-title ${task.done ? 'line-through' : ''}">${esc(task.title)}</div>
            <div class="item-meta-top">
              <span class="planned-status-chip ${statusChipClass}">${statusLabel}</span>
              ${prioBadge}
              ${carteiraBadge}
            </div>
          </div>
          <div class="item-actions">
            <button type="button" class="action-btn edit-task-btn" data-id="${task.id}" title="Editar tarefa">✏️</button>
            <button type="button" class="action-btn delete-task-btn" data-id="${task.id}" title="Excluir tarefa">🗑️</button>
          </div>
        </div>

        <div class="timeline-box">
          <div class="timeline-dates">
            <span><b>Início:</b> ${formatDateBR(task.startDate)}</span>
            <span><b>Fim:</b> ${formatDateBR(task.endDate)}</span>
          </div>
          <div class="timeline-bar">
            <div class="timeline-fill ${task.done ? 'done-fill' : isUrgent ? 'urgent-fill' : ''}" style="width: ${task.done ? 100 : progress}%;"></div>
          </div>
        </div>

        ${task.notes ? `<div class="item-notes">📝 ${esc(task.notes)}</div>` : ''}

        <div class="item-footer">
          <div class="item-owner">
            <span class="owner-avatar" style="background:${owner.color || '#3b82f6'}">${esc(owner.name.charAt(0).toUpperCase())}</span>
            <span class="owner-name">${esc(owner.name)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach event handlers
  listEl.querySelectorAll('.task-done-toggle').forEach(el => {
    el.addEventListener('change', (e) => {
      const id = (e.target as HTMLElement).dataset.id;
      if (id) toggleTaskDone(id);
    });
  });

  listEl.querySelectorAll('.edit-task-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) openPlannedTaskModal(id);
    });
  });

  listEl.querySelectorAll('.delete-task-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) deleteTask(id);
    });
  });
}

/**
 * Checks for tasks that require pop-up alert (deadline in 2, 1, or 0 days)
 * and displays the alert pop-up modal if not already dismissed for today.
 */
export function checkAndTriggerDeadlineAlerts(force = false) {
  const today = todayISO();
  const alertTasks = getAlertTasks();
  const lateCronograma = getLateCronogramaTasks();

  if (alertTasks.length === 0 && lateCronograma.length === 0) return;

  const storageKey = `cronoplano_planned_alerts_${today}_${ui.currentUserId || 'guest'}`;

  if (!force) {
    try {
      if (sessionStorage.getItem(storageKey) === 'dismissed') {
        return;
      }
    } catch (e) { }
  }

  showPlannedTasksAlertModal();
}

/**
 * Displays the Pop-up Modal for planned tasks and late cronograma tasks
 */
export function showPlannedTasksAlertModal(force = false) {
  const modal = $('#plannedTasksAlertModal');
  const content = $('#plannedAlertModalContent');
  if (!modal || !content) return;

  const alertTasks = getAlertTasks();
  const lateCronograma = getLateCronogramaTasks();

  if (alertTasks.length === 0 && lateCronograma.length === 0) {
    if (force) {
      content.innerHTML = `
        <div class="alert-empty-state">
          <div style="font-size:38px;margin-bottom:10px;">✨</div>
          <div style="font-weight:700;font-size:16px;">Tudo em dia!</div>
          <div style="color:var(--muted);font-size:13px;margin-top:6px;line-height:1.4;">
            Nenhuma tarefa planejada próxima da finalização (2, 1 ou hoje) e nenhuma atividade atrasada no cronograma.
          </div>
        </div>
      `;
      modal.hidden = false;
    }
    return;
  }

  let html = '';

  // 1. SEÇÃO: TAREFAS PLANEJADAS
  if (alertTasks.length > 0) {
    const todayTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 0);
    const tomorrowTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 1);
    const twoDaysTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 2);
    const overdueTasks = alertTasks.filter(t => getDaysDiff(t.endDate) < 0);

    const renderPlannedGroup = (title: string, icon: string, badgeClass: string, taskList: PlannedTask[], note: string) => {
      if (taskList.length === 0) return '';
      return `
        <div class="alert-group">
          <div class="alert-group-header ${badgeClass}">
            <span class="group-icon">${icon}</span>
            <span class="group-title">${title}</span>
            <span class="group-note">${note}</span>
            <span class="group-count">${taskList.length}</span>
          </div>
          <div class="alert-group-items">
            ${taskList.map(t => {
              const owner = userById(t.ownerId);
              return `
                <div class="alert-task-card planned-alert-card" data-id="${t.id}">
                  <div class="alert-task-info">
                    <div class="alert-task-top">
                      <span class="alert-task-name">${esc(t.title)}</span>
                      <span class="alert-deadline-badge">
                        🎯 <b>Prazo Final: ${formatDateBR(t.endDate)}</b>
                      </span>
                    </div>

                    <div class="alert-task-sub">
                      <span>🗓️ Início: <b>${formatDateBR(t.startDate)}</b></span>
                      <span>•</span>
                      <span>Data Final do Prazo: <b class="deadline-highlight">${formatDateBR(t.endDate)}</b></span>
                      ${t.carteira ? `<span>• 🏷️ ${esc(t.carteira)}</span>` : ''}
                      <span>• 👤 ${esc(owner.name)}</span>
                    </div>

                    ${t.notes ? `
                      <div class="alert-task-notes">
                        <span class="notes-lbl">📝 <b>Observações:</b></span>
                        <span class="notes-val">${esc(t.notes)}</span>
                      </div>
                    ` : ''}
                  </div>
                  <div class="alert-task-actions">
                    <button type="button" class="btn small success-btn alert-complete-btn" data-id="${t.id}" title="Marcar tarefa como concluída">
                      ✓ Concluir
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    html += `
      <div class="alert-section-title">
        <span>📋 Prazos Próximos (${alertTasks.length})</span>
      </div>
      ${renderPlannedGroup('Dia da Finalização (HOJE)', '🚨', 'bg-today', todayTasks, 'Atenção máxima: vence hoje!')}
      ${renderPlannedGroup('Falta 1 Dia (Amanhã)', '⏰', 'bg-tomorrow', tomorrowTasks, 'Vence amanhã')}
      ${renderPlannedGroup('Faltam 2 Dias', '⚠️', 'bg-two-days', twoDaysTasks, 'Prazo em 2 dias')}
      ${renderPlannedGroup('Prazos Ultrapassados', '❗', 'bg-overdue', overdueTasks, 'Prazo final já ultrapassado')}
    `;
  }

  // 2. SEÇÃO: TAREFAS ATRASADAS (AÇÕES DO CRONOGRAMA)
  if (lateCronograma.length > 0) {
    html += `
      <div class="alert-section-title" style="margin-top:${alertTasks.length > 0 ? '18px' : '0'};">
        <span>⚠️ Tarefas Atrasadas (${lateCronograma.length})</span>
      </div>
      <div class="alert-group">
        <div class="alert-group-header bg-overdue">
          <span class="group-icon">⏱️</span>
          <span class="group-title">Ações do Cronograma com Status Atrasada</span>
          <span class="group-note">Role para ver todas (${lateCronograma.length})</span>
          <span class="group-count">${lateCronograma.length}</span>
        </div>
        <div class="alert-group-items cronograma-scroll-list">
          ${lateCronograma.map(item => {
            const t = item.task;
            const owner = userById(t.ownerId);
            const cat = catOf(t.cat);
            return `
              <div class="alert-task-card" data-task-id="${t.id}" data-task-date="${item.date}">
                <div class="alert-task-info">
                  <div class="alert-task-title">${esc(t.title)}</div>
                  <div class="alert-task-sub">
                    <span class="date-badge">📅 <b>${formatDateBR(item.date)}</b></span>
                    <span>🕒 ${esc(t.start || '--:--')}${t.end ? ' às ' + esc(t.end) : ''}</span>
                    <span class="cat-chip-mini" style="background:${cat.color}22;color:${cat.color}">● ${esc(cat.label)}</span>
                    ${t.carteira ? `<span>🏷️ ${esc(t.carteira)}</span>` : ''}
                    <span>👤 ${esc(owner.name)}</span>
                  </div>
                </div>
                <div class="alert-task-actions">
                  <button type="button" class="btn small ghost alert-goto-date-btn" data-date="${item.date}" title="Ver no cronograma">
                    👁️ Ver
                  </button>
                  <button type="button" class="btn small success-btn alert-complete-cronograma-btn" data-task-id="${t.id}" data-task-date="${item.date}">
                    ✓ Concluir
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  content.innerHTML = html;

  // Bind complete planned task buttons
  content.querySelectorAll('.alert-complete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        toggleTaskDone(id);
        showPlannedTasksAlertModal(true);
      }
    });
  });

  // Bind complete cronograma task buttons
  content.querySelectorAll('.alert-complete-cronograma-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const tid = el.dataset.taskId;
      const date = el.dataset.taskDate;
      if (tid && date && data.daily[date]) {
        const t = data.daily[date].find(x => x.id === tid);
        if (t) {
          t.done = true;
          t.updatedAt = Date.now();
          saveState(true);
          updatePlannedTasksBadge();
          showPlannedTasksAlertModal(true);
        }
      }
    });
  });

  // Bind go to date in daily cronograma
  content.querySelectorAll('.alert-goto-date-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const date = (e.currentTarget as HTMLElement).dataset.date;
      if (date) {
        ui.date = date;
        ui.tab = 'daily';
        dismissPlannedTasksAlertModal();
        $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'daily'));
        $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-daily'));
        saveState(false);
        const dailyInput = $('#dailyDate') as HTMLInputElement;
        if (dailyInput) dailyInput.value = date;
        window.dispatchEvent(new CustomEvent('cronoplano:render-daily'));
      }
    });
  });

  modal.hidden = false;
}

/**
 * Dismiss the alert modal and remember for the session
 */
export function dismissPlannedTasksAlertModal() {
  const modal = $('#plannedTasksAlertModal');
  if (modal) modal.hidden = true;

  const today = todayISO();
  const storageKey = `cronoplano_planned_alerts_${today}_${ui.currentUserId || 'guest'}`;
  try {
    sessionStorage.setItem(storageKey, 'dismissed');
  } catch (e) { }
}

/**
 * Sets up all DOM event listeners for the planned tasks feature
 */
export function initPlannedTasks() {
  // Toggle right lateral tab
  $('#plannedTasksTab')?.addEventListener('click', () => {
    togglePlannedTasksPanel();
  });

  // Close lateral panel
  $('#plannedCloseBtn')?.addEventListener('click', () => {
    togglePlannedTasksPanel(false);
  });

  // Backdrop click closes lateral panel
  $('#plannedTasksBackdrop')?.addEventListener('click', () => {
    togglePlannedTasksPanel(false);
  });

  // Button in panel header: "＋ Nova Tarefa" opens modal
  $('#plannedOpenAddModalBtn')?.addEventListener('click', () => {
    openPlannedTaskModal();
  });

  // Button in topbar: "🔔 Alertas" opens alert modal
  $('#topbarAlertsBtn')?.addEventListener('click', () => {
    showPlannedTasksAlertModal(true);
  });

  // Planned Task modal form submission
  $('#plannedTaskModalForm')?.addEventListener('submit', handleModalFormSubmit);

  // Planned Task modal close / cancel buttons
  $('#plannedModalClose')?.addEventListener('click', () => {
    closePlannedTaskModal();
  });

  $('#plannedModalCancel')?.addEventListener('click', () => {
    closePlannedTaskModal();
  });

  // Quick date chips inside modal
  $$('.quick-date-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = parseInt((e.currentTarget as HTMLElement).dataset.days || '0', 10);
      const startInput = $('#plannedStartDate') as HTMLInputElement;
      const endInput = $('#plannedEndDate') as HTMLInputElement;

      const base = startInput?.value ? new Date(startInput.value + 'T00:00:00') : new Date();
      base.setDate(base.getDate() + days);
      if (endInput) {
        endInput.value = base.toLocaleDateString('sv-SE');
      }
    });
  });

  // Filter tabs in lateral panel
  $$('.planned-tabs .p-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', (e) => {
      $$('.planned-tabs .p-tab').forEach(b => b.classList.remove('active'));
      const btn = e.currentTarget as HTMLElement;
      btn.classList.add('active');
      activeFilter = (btn.dataset.filter as any) || 'all';
      renderPlannedTasksList();
    });
  });

  // Search input in lateral panel
  $('#plannedSearch')?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderPlannedTasksList();
  });

  // Alert modal close buttons
  $('#plannedAlertModalClose')?.addEventListener('click', () => {
    dismissPlannedTasksAlertModal();
  });

  $('#plannedAlertModalDismiss')?.addEventListener('click', () => {
    dismissPlannedTasksAlertModal();
  });

  $('#plannedAlertModalOpenPanel')?.addEventListener('click', () => {
    dismissPlannedTasksAlertModal();
    togglePlannedTasksPanel(true);
  });

  // Initial updates and sync
  updatePlannedTasksBadge();
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  const topbar = $('#appTopbar');
  if (topbar && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => syncTopbarHeight()).observe(topbar);
  }
}
