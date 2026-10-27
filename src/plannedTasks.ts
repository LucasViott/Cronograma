import { PlannedTask } from './types';
import { data, ui, saveState, currentUser, usersList, userById, isLeader, getAllCarteiras } from './state';
import { $, $$, esc, uid, todayISO, showConfirm, applyAvatar } from './utils';

let activeFilter: 'all' | 'pending' | 'alerts' | 'done' = 'all';
let searchQuery = '';
let isPanelOpen = false;
let editingTaskId: string | null = null;
let lastAlertCheckDate = '';

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = endDateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats YYYY-MM-DD into DD/MM/YYYY
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Calculates progress percent (0 - 100) between start and end date relative to today
 */
export function calculateTimelineProgress(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const today = new Date().setHours(0, 0, 0, 0);
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd).setHours(0, 0, 0, 0);
  const end = new Date(ey, em - 1, ed).setHours(0, 0, 0, 0);

  if (end <= start) return today >= end ? 100 : 0;
  if (today <= start) return 0;
  if (today >= end) return 100;
  const total = end - start;
  const elapsed = today - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Returns planned tasks that need pop-up alerts:
 * Active (not done) and diff is 0, 1, or 2 days!
 */
export function getAlertTasks(): PlannedTask[] {
  const tasks = data.plannedTasks || [];
  return tasks.filter(t => {
    if (t.done) return false;
    const diff = getDaysDiff(t.endDate);
    return diff === 0 || diff === 1 || diff === 2;
  }).sort((a, b) => getDaysDiff(a.endDate) - getDaysDiff(b.endDate));
}

/**
 * Toggle open / close planned tasks side panel
 */
export function togglePlannedTasksPanel(open?: boolean) {
  const panel = $('#plannedTasksPanel');
  const backdrop = $('#plannedTasksBackdrop');
  const tab = $('#plannedTasksTab');
  if (!panel || !tab) return;

  isPanelOpen = typeof open === 'boolean' ? open : !isPanelOpen;

  if (isPanelOpen) {
    panel.classList.add('open');
    if (backdrop) backdrop.hidden = false;
    tab.classList.add('active');
    populateFormOptions();
    renderPlannedTasksList();
  } else {
    panel.classList.remove('open');
    if (backdrop) backdrop.hidden = true;
    tab.classList.remove('active');
    resetForm();
  }
}

/**
 * Populates owner and carteira selects in the form
 */
export function populateFormOptions() {
  const ownerSel = $('#plannedOwner') as HTMLSelectElement;
  if (ownerSel) {
    const cur = currentUser();
    const curVal = ownerSel.value;
    const users = usersList();
    ownerSel.innerHTML = users.map(u => {
      const isSelected = curVal ? curVal === u.id : (cur ? cur.id === u.id : false);
      return `<option value="${u.id}" ${isSelected ? 'selected' : ''}>${esc(u.name)}</option>`;
    }).join('');
  }

  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  if (carteiraSel) {
    const curVal = carteiraSel.value;
    const allCarteiras = getAllCarteiras();
    carteiraSel.innerHTML = `<option value="">(Sem carteira específica)</option>` +
      allCarteiras.map(c => `<option value="${c}" ${curVal === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
}

/**
 * Resets the add/edit form to its initial state
 */
function resetForm() {
  editingTaskId = null;
  const form = $('#plannedTaskForm') as HTMLFormElement;
  if (form) form.reset();

  const editId = $('#plannedEditId') as HTMLInputElement;
  if (editId) editId.value = '';

  const formTitle = $('#plannedFormTitle');
  if (formTitle) formTitle.textContent = '＋ Nova Tarefa Planejada';

  const submitBtn = $('#plannedSubmitBtn');
  if (submitBtn) submitBtn.textContent = '＋ Adicionar Tarefa';

  const cancelBtn = $('#plannedCancelEditBtn');
  if (cancelBtn) cancelBtn.hidden = true;

  // Set default dates
  const today = todayISO();
  const startInput = $('#plannedStartDate') as HTMLInputElement;
  const endInput = $('#plannedEndDate') as HTMLInputElement;
  if (startInput) startInput.value = today;
  if (endInput) {
    // Default 7 days from today
    const d = new Date();
    d.setDate(d.getDate() + 7);
    endInput.value = d.toLocaleDateString('sv-SE');
  }

  populateFormOptions();
}

/**
 * Loads an existing task into the form for editing
 */
function startEditTask(taskId: string) {
  const task = (data.plannedTasks || []).find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  const editId = $('#plannedEditId') as HTMLInputElement;
  if (editId) editId.value = task.id;

  const titleInput = $('#plannedTitle') as HTMLInputElement;
  if (titleInput) titleInput.value = task.title;

  const startInput = $('#plannedStartDate') as HTMLInputElement;
  if (startInput) startInput.value = task.startDate || todayISO();

  const endInput = $('#plannedEndDate') as HTMLInputElement;
  if (endInput) endInput.value = task.endDate || todayISO();

  const ownerSel = $('#plannedOwner') as HTMLSelectElement;
  if (ownerSel && task.ownerId) ownerSel.value = task.ownerId;

  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  if (carteiraSel) carteiraSel.value = task.carteira || '';

  const prioSel = $('#plannedPriority') as HTMLSelectElement;
  if (prioSel) prioSel.value = task.prio || 'media';

  const notesInput = $('#plannedNotes') as HTMLInputElement;
  if (notesInput) notesInput.value = task.notes || '';

  const formTitle = $('#plannedFormTitle');
  if (formTitle) formTitle.textContent = '✏️ Editar Tarefa Planejada';

  const submitBtn = $('#plannedSubmitBtn');
  if (submitBtn) submitBtn.textContent = '💾 Salvar Alterações';

  const cancelBtn = $('#plannedCancelEditBtn');
  if (cancelBtn) cancelBtn.hidden = false;

  // Scroll form into view inside panel body
  const body = $('.planned-panel-body');
  if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Adds or updates a planned task from form submission
 */
function handleFormSubmit(e: SubmitEvent) {
  e.preventDefault();

  const titleInput = $('#plannedTitle') as HTMLInputElement;
  const startInput = $('#plannedStartDate') as HTMLInputElement;
  const endInput = $('#plannedEndDate') as HTMLInputElement;
  const ownerSel = $('#plannedOwner') as HTMLSelectElement;
  const carteiraSel = $('#plannedCarteira') as HTMLSelectElement;
  const prioSel = $('#plannedPriority') as HTMLSelectElement;
  const notesInput = $('#plannedNotes') as HTMLInputElement;

  const title = titleInput.value.trim();
  const startDate = startInput.value;
  const endDate = endInput.value;
  const ownerId = ownerSel.value || ui.currentUserId || '';
  const carteira = carteiraSel.value;
  const prio = (prioSel.value as any) || 'media';
  const notes = notesInput.value.trim();

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
        ownerId,
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

    // If task deadline is 0, 1, or 2 days, show friendly notice
    const diff = getDaysDiff(endDate);
    if (diff === 0 || diff === 1 || diff === 2) {
      setTimeout(() => {
        showPlannedTasksAlertModal(true);
      }, 350);
    }
  }

  saveState(true);
  resetForm();
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

  if (editingTaskId === taskId) {
    resetForm();
  }

  renderPlannedTasksList();
  updatePlannedTasksBadge();
}

/**
 * Updates badge counters on the tab and inside the panel
 */
export function updatePlannedTasksBadge() {
  const tasks = data.plannedTasks || [];
  const alertTasks = getAlertTasks();

  const tabBadge = $('#plannedTasksTabBadge');
  if (tabBadge) {
    if (alertTasks.length > 0) {
      tabBadge.textContent = String(alertTasks.length);
      tabBadge.hidden = false;
      tabBadge.title = `${alertTasks.length} tarefa(s) com prazo em 2, 1 ou hoje!`;
    } else {
      tabBadge.hidden = true;
    }
  }

  const panelBadge = $('#plannedAlertsBtnBadge');
  if (panelBadge) {
    if (alertTasks.length > 0) {
      panelBadge.textContent = String(alertTasks.length);
      panelBadge.hidden = false;
    } else {
      panelBadge.hidden = true;
    }
  }

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
 * Renders the list of planned tasks inside the side panel
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
      return diff === 0 || diff === 1 || diff === 2;
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

  // Sorting:
  // Non-done first sorted by days remaining (urgent first), then done tasks
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
        <p>${activeFilter === 'alerts' ? 'Não há tarefas com prazo para hoje, amanhã ou em 2 dias.' : 'Use o formulário acima para adicionar metas e atividades com prazo.'}</p>
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
      if (id) startEditTask(id);
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

  if (alertTasks.length === 0) return;

  const storageKey = `cronoplano_planned_alerts_${today}_${ui.currentUserId || 'guest'}`;

  if (!force) {
    // Only auto-show once per day/session unless forced
    try {
      if (sessionStorage.getItem(storageKey) === 'dismissed') {
        return;
      }
    } catch (e) { }
  }

  showPlannedTasksAlertModal();
}

/**
 * Displays the Pop-up Modal for tasks with deadline in 2, 1, or 0 days
 */
export function showPlannedTasksAlertModal(force = false) {
  const modal = $('#plannedTasksAlertModal');
  const content = $('#plannedAlertModalContent');
  if (!modal || !content) return;

  const alertTasks = getAlertTasks();
  if (alertTasks.length === 0) {
    if (force) {
      content.innerHTML = `
        <div class="alert-empty-state">
          <div style="font-size:36px;margin-bottom:8px;">✨</div>
          <div style="font-weight:700;font-size:15px;">Tudo sob controle!</div>
          <div style="color:var(--muted);font-size:13px;margin-top:4px;">
            Nenhuma tarefa planejada com finalização prevista para hoje, amanhã ou em 2 dias.
          </div>
        </div>
      `;
      modal.hidden = false;
    }
    return;
  }

  // Group by: Hoje (0d), Amanhã (1d), Em 2 dias (2d)
  const todayTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 0);
  const tomorrowTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 1);
  const twoDaysTasks = alertTasks.filter(t => getDaysDiff(t.endDate) === 2);
  const overdueTasks = alertTasks.filter(t => getDaysDiff(t.endDate) < 0);

  const renderSection = (title: string, icon: string, badgeClass: string, taskList: PlannedTask[], note: string) => {
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
              <div class="alert-task-card" data-id="${t.id}">
                <div class="alert-task-info">
                  <div class="alert-task-title">${esc(t.title)}</div>
                  <div class="alert-task-sub">
                    <span>🗓️ Início: <b>${formatDateBR(t.startDate)}</b></span>
                    <span>•</span>
                    <span>Prazo: <b>${formatDateBR(t.endDate)}</b></span>
                    ${t.carteira ? `<span>• 🏷️ ${esc(t.carteira)}</span>` : ''}
                    <span>• 👤 ${esc(owner.name)}</span>
                  </div>
                </div>
                <div class="alert-task-actions">
                  <button type="button" class="btn small success-btn alert-complete-btn" data-id="${t.id}">
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

  content.innerHTML = `
    ${renderSection('Dia da Finalização (HOJE)', '🚨', 'bg-today', todayTasks, 'Atenção máxima: o prazo termina hoje!')}
    ${renderSection('Falta 1 Dia (Amanhã)', '⏰', 'bg-tomorrow', tomorrowTasks, 'Finalização prevista para amanhã')}
    ${renderSection('Faltam 2 Dias', '⚠️', 'bg-two-days', twoDaysTasks, 'Prepare-se: prazo final em 2 dias')}
    ${renderSection('Tarefas Atrasadas', '❗', 'bg-overdue', overdueTasks, 'Prazo final já ultrapassado')}
  `;

  // Bind quick complete buttons
  content.querySelectorAll('.alert-complete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        toggleTaskDone(id);
        // Refresh alert content
        showPlannedTasksAlertModal(true);
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
  // Toggle right tab
  $('#plannedTasksTab')?.addEventListener('click', () => {
    togglePlannedTasksPanel();
  });

  // Close panel
  $('#plannedCloseBtn')?.addEventListener('click', () => {
    togglePlannedTasksPanel(false);
  });

  // Backdrop click closes panel
  $('#plannedTasksBackdrop')?.addEventListener('click', () => {
    togglePlannedTasksPanel(false);
  });

  // Alert bell button in header
  $('#plannedAlertsBtn')?.addEventListener('click', () => {
    showPlannedTasksAlertModal(true);
  });

  // Form submit
  $('#plannedTaskForm')?.addEventListener('submit', handleFormSubmit);

  // Cancel edit button
  $('#plannedCancelEditBtn')?.addEventListener('click', () => {
    resetForm();
  });

  // Quick date chips
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

  // Filter tabs
  $$('.planned-tabs .p-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', (e) => {
      $$('.planned-tabs .p-tab').forEach(b => b.classList.remove('active'));
      const btn = e.currentTarget as HTMLElement;
      btn.classList.add('active');
      activeFilter = (btn.dataset.filter as any) || 'all';
      renderPlannedTasksList();
    });
  });

  // Search input
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

  // Set initial form dates
  resetForm();
  updatePlannedTasksBadge();
}
