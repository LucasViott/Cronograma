import './index.css';
import {
  data, ui, saveState, forceSaveNow, loadLocal, seedPredefinedUsers,
  migrateLegacyData, setOnSaveStateChange, setRenderCallback,
  hasUnsavedChanges, currentUser, usersList, userById, touchUser,
  canEditCurrentView, viewingAll, isLeader, getAllCarteiras,
  applyMergedRemote
} from './state';
import {
  renderDaily, renderWeekly, renderMonth, renderDashboard,
  renderTeam, refreshTopbarCarteiras
} from './renderers';
import {
  $, $$, esc, normalizeName, hashPassword, showAlert, showConfirm,
  applyAvatar, todayISO, uid
} from './utils';
import {
  fetchInitialRemote, subscribeToRemoteChanges, onSyncStatusChange,
  type SyncStatus
} from './firebase';
import { CATEGORIES, ALL_MEMBERS, THEME_KEY } from './constants';
import {
  bindModalListeners, setRenderRequester, openTaskModal,
  openDayDetail, openUserModal, openProfileModal, openEditMemberModal,
  openCarteirasModal, openImportModal, openExportModal
} from './modals';

let loginCtx = { step: 'name', userId: null as string | null };

function setSyncIndicator(status: SyncStatus) {
  const el = $('#syncIndicator');
  if (!el) return;
  el.className = 'sync-indicator ' + status;
  el.title = ({
    ok: 'Sincronizado com a nuvem',
    syncing: 'Salvando alterações...',
    offline: 'Sem conexão com a nuvem',
    error: 'Erro de sincronização'
  })[status] || 'Sincronização';
}

function updateSaveButton() {
  const btn = $('#saveBtn');
  const label = $('#saveBtnLabel');
  if (!btn || !label) return;

  if (hasUnsavedChanges) {
    btn.classList.add('dirty');
    label.textContent = 'Salvar';
  } else {
    btn.classList.remove('dirty');
    label.textContent = 'Salvo';
  }
}

function render() {
  if (!ui.currentUserId || !data.users[ui.currentUserId]) return;

  const user = data.users[ui.currentUserId];
  if (user.role === 'leader') {
    if (!ui.viewUserId || (!data.users[ui.viewUserId] && ui.viewUserId !== ALL_MEMBERS)) {
      ui.viewUserId = ALL_MEMBERS;
    }
    if (!ui.tab) ui.tab = 'month';
  } else {
    ui.viewUserId = user.id;
    if (ui.tab === 'team' || !ui.tab) ui.tab = 'daily';
  }

  // Ensure the appropriate view and tab have the active class
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + ui.tab));

  $$('[data-leader-only]').forEach(el => { el.hidden = user.role !== 'leader'; });
  refreshTopbarCarteiras();

  // Populate view user selects
  ['#viewUserSelectDaily', '#viewUserSelectWeekly', '#viewUserSelectMonth', '#viewUserSelectDash'].forEach(selId => {
    const sel = $(selId) as HTMLSelectElement;
    if (sel && isLeader()) {
      sel.innerHTML = `<option value="${ALL_MEMBERS}" ${ui.viewUserId === ALL_MEMBERS ? 'selected' : ''}>👥 Todos os membros</option>` +
        usersList().map(u => `<option value="${u.id}" ${ui.viewUserId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
    }
  });

  // Populate carteira filter selects
  ['#carteiraFilterDaily', '#carteiraFilterWeekly', '#carteiraFilterMonth', '#carteiraFilterDash'].forEach(selId => {
    const sel = $(selId) as HTMLSelectElement;
    if (sel) {
      sel.innerHTML = `<option value="">Todas as carteiras</option>` +
        getAllCarteiras().map(c => `<option value="${c}" ${ui.carteiraFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
    }
  });

  // Populate categoria filter selects
  ['#categoriaFilterDaily', '#categoriaFilterWeekly', '#categoriaFilterMonth', '#categoriaFilterDash'].forEach(selId => {
    const sel = $(selId) as HTMLSelectElement;
    if (sel) {
      sel.innerHTML = `<option value="">Todas as categorias</option>` +
        Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${ui.categoriaFilter === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    }
  });

  if (ui.tab === 'daily') renderDaily();
  else if (ui.tab === 'weekly') renderWeekly();
  else if (ui.tab === 'month') renderMonth();
  else if (ui.tab === 'team') renderTeam();
  else renderDashboard();

  const u = currentUser();
  if (u) {
    applyAvatar($('#userChipAvatar'), u);
    const nameEl = $('#userChipName');
    if (nameEl) nameEl.textContent = u.name;
    const roleEl = $('#userChipRole');
    if (roleEl) {
      roleEl.textContent = u.role === 'leader' ? 'líder' : 'membro';
      roleEl.className = 'role-badge ' + (u.role === 'leader' ? 'leader' : 'member');
    }
  }

  updateSaveButton();
}

function switchTab(tab: string) {
  if (tab === 'team' && !isLeader()) tab = 'daily';
  ui.tab = tab as any;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
  saveState(false);
  render();
}

function showLogin() {
  $('#loginScreen').hidden = false;
  $('#appTopbar').hidden = true;
  $('#appMain').hidden = true;
  const countEl = $('#loginUserCount');
  if (countEl) countEl.textContent = `${usersList().length} colaboradores`;
  setLoginStep('name');
}

function hideLogin() {
  $('#loginScreen').hidden = true;
  $('#appTopbar').hidden = false;
  $('#appMain').hidden = false;
}

function setLoginStep(step: string) {
  loginCtx.step = step;
  $('#loginStepName').hidden = step !== 'name';
  $('#loginStepPwd').hidden = step !== 'password';
  $('#loginStepSetup').hidden = step !== 'setup';
  ['#loginError', '#loginError2', '#loginError3'].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });

  const u = loginCtx.userId ? data.users[loginCtx.userId] : null;
  if (step === 'password' && u) {
    $('#loginSubtitle').textContent = 'Digite sua senha';
    applyAvatar($('#loginPwdAvatar'), u);
    $('#loginPwdName').textContent = u.name;
    $('#loginPwdRole').textContent = u.cargo || (u.role === 'leader' ? 'Líder' : 'Membro');
    setTimeout(() => ($('#loginPwd') as HTMLInputElement)?.focus(), 60);
  } else if (step === 'setup' && u) {
    $('#loginSubtitle').textContent = 'Primeiro acesso';
    applyAvatar($('#loginSetupAvatar'), u);
    $('#loginSetupName').textContent = u.name;
    $('#loginSetupRole').textContent = u.cargo || (u.role === 'leader' ? 'Líder' : 'Membro');
    setTimeout(() => ($('#loginPwdNew') as HTMLInputElement)?.focus(), 60);
  } else {
    $('#loginSubtitle').textContent = 'Acesse com seu nome e sobrenome';
    setTimeout(() => ($('#loginName') as HTMLInputElement)?.focus(), 60);
  }
}

function completeLogin(user: any) {
  ui.currentUserId = user.id;
  ui.date = todayISO();
  if (user.role === 'leader') {
    ui.viewUserId = ALL_MEMBERS;
    ui.tab = 'month';
  } else {
    ui.viewUserId = user.id;
    ui.tab = 'daily';
  }
  saveState(true);
  hideLogin();
  render();
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { }
  const icon = $('#setThemeIcon');
  if (icon) icon.textContent = next === 'light' ? '🌙' : '☀️';
  const label = $('#setThemeLabel');
  if (label) label.textContent = next === 'light' ? 'Modo escuro' : 'Modo claro';
}

function bindEvents() {
  // Login
  $('#loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (loginCtx.step === 'name') {
      const name = ($('#loginName') as HTMLInputElement).value;
      const user = usersList().find(u => normalizeName(u.name) === normalizeName(name));
      if (!user) {
        const err = $('#loginError');
        if (err) { err.textContent = 'Usuário não encontrado. Confira o nome e sobrenome.'; err.hidden = false; }
        return;
      }
      loginCtx.userId = user.id;
      setLoginStep(user.passwordHash ? 'password' : 'setup');
    } else if (loginCtx.step === 'password') {
      const u = loginCtx.userId ? data.users[loginCtx.userId] : null;
      if (!u) return setLoginStep('name');
      const pwd = ($('#loginPwd') as HTMLInputElement).value;
      if (hashPassword(pwd) !== u.passwordHash) {
        const err = $('#loginError2');
        if (err) { err.textContent = 'Senha incorreta.'; err.hidden = false; }
        return;
      }
      completeLogin(u);
    } else if (loginCtx.step === 'setup') {
      const u = loginCtx.userId ? data.users[loginCtx.userId] : null;
      if (!u) return setLoginStep('name');
      const p1 = ($('#loginPwdNew') as HTMLInputElement).value;
      const p2 = ($('#loginPwdNew2') as HTMLInputElement).value;
      if (!p1 || p1.length < 4 || p1 !== p2) {
        const err = $('#loginError3');
        if (err) { err.textContent = p1.length < 4 ? 'Mínimo 4 caracteres' : 'As senhas não conferem'; err.hidden = false; }
        return;
      }
      u.passwordHash = hashPassword(p1);
      u.updatedAt = Date.now();
      completeLogin(u);
    }
  });

  $('#loginBack2')?.addEventListener('click', () => { loginCtx.userId = null; setLoginStep('name'); });
  $('#loginBack3')?.addEventListener('click', () => { loginCtx.userId = null; setLoginStep('name'); });
  $('#loginForgot')?.addEventListener('click', () => {
    showAlert('Entre em contato com o líder da equipe para redefinir sua senha.', 'Esqueci minha senha', { icon: '🔑' });
  });

  // Navigation
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'daily')));

  // Save Button
  $('#saveBtn')?.addEventListener('click', async () => {
    const btn = $('#saveBtn') as HTMLButtonElement;
    const label = $('#saveBtnLabel');
    if (!btn || !label) return;

    btn.disabled = true;
    label.textContent = 'Salvando...';

    const ok = await forceSaveNow();
    btn.disabled = false;

    if (ok) {
      label.textContent = 'Salvo ✓';
      setTimeout(() => updateSaveButton(), 2000);
      await showAlert('Cronograma salvo e sincronizado com sucesso no Firebase!', 'Salvo com sucesso', { icon: '✅' });
    } else {
      label.textContent = 'Salvar';
      await showAlert('Não foi possível salvar na nuvem agora. Suas alterações foram salvas localmente e serão sincronizadas assim que a conexão restabelecer.', 'Aviso', { icon: '⚠️', iconVariant: 'warn' });
    }
  });

  // Daily Quick Add Form
  $('#dailyForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canEditCurrentView() || viewingAll()) return;
    const title = ($('#qTitle') as HTMLTextAreaElement).value.trim();
    if (!title) return;

    const date = ui.date;
    const owner = isLeader() ? (ui.viewUserId || ui.currentUserId) : ui.currentUserId;
    if (!owner || owner === ALL_MEMBERS) return;

    const start = ($('#qTime') as HTMLInputElement).value || '';
    const end = ($('#qEnd') as HTMLInputElement).value || '';

    if (!Array.isArray(data.daily[date])) data.daily[date] = [];
    const newTask = {
      id: uid(),
      ownerId: owner,
      title,
      start,
      end,
      cat: ($('#qCat') as HTMLSelectElement).value,
      carteira: ($('#qCarteira') as HTMLSelectElement).value || '',
      prio: 'media' as const,
      notes: '',
      done: false,
      updatedAt: Date.now()
    };

    data.daily[date].push(newTask);
    touchUser(owner);
    saveState(true);

    ($('#qTitle') as HTMLTextAreaElement).value = '';
    render();
  });

  // Task actions in daily list (toggle, edit, delete)
  $('#dailyList')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const taskEl = target.closest('.task') as HTMLElement;
    if (!taskEl) return;

    const taskId = taskEl.dataset.id;
    const date = taskEl.dataset.date || ui.date;
    const act = target.closest('[data-act]')?.getAttribute('data-act');
    const tasks = data.daily[date] || [];
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (act === 'toggle') {
      task.done = !task.done;
      task.updatedAt = Date.now();
      touchUser(task.ownerId);
      saveState(true);
      render();
    } else if (act === 'edit') {
      openTaskModal({ mode: 'edit', date, item: task });
    } else if (act === 'del') {
      const ok = await showConfirm('Excluir esta atividade?', 'Excluir', { icon: '🗑', danger: true });
      if (!ok) return;

      const idx = tasks.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        tasks.splice(idx, 1);
        data.deletedTaskIds[taskId!] = Date.now();
        touchUser(task.ownerId);
        saveState(true);
        render();
      }
    }
  });

  // Calendar click
  $('#calGrid')?.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.cal-cell') as HTMLElement;
    if (cell?.dataset.date) {
      ui.date = cell.dataset.date;
      render();
    }
  });
  $('#calPrev')?.addEventListener('click', () => {
    const { year, month } = ui.calMonth;
    const d = new Date(year, month - 1, 1);
    ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    render();
  });
  $('#calNext')?.addEventListener('click', () => {
    const { year, month } = ui.calMonth;
    const d = new Date(year, month + 1, 1);
    ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    render();
  });
  $('#calToday')?.addEventListener('click', () => {
    const now = new Date();
    ui.calMonth = { year: now.getFullYear(), month: now.getMonth() };
    ui.date = todayISO();
    render();
  });

  // Week Grid
  $('#weekGrid')?.addEventListener('click', (e) => {
    const compactGo = (e.target as HTMLElement).closest('[data-goto-daily]') as HTMLElement;
    if (compactGo?.dataset.gotoDaily) {
      ui.date = compactGo.dataset.gotoDaily;
      switchTab('daily');
      return;
    }
    const memberBtn = (e.target as HTMLElement).closest('[data-mo-member]') as HTMLElement;
    if (memberBtn?.dataset.moMember && memberBtn.dataset.moMemberDate) {
      ui.viewUserId = memberBtn.dataset.moMember;
      ui.date = memberBtn.dataset.moMemberDate;
      switchTab('daily');
      return;
    }
    const addBtn = (e.target as HTMLElement).closest('[data-add-date]') as HTMLElement;
    if (addBtn?.dataset.addDate) {
      openTaskModal({ mode: 'new', date: addBtn.dataset.addDate });
    }
  });
  $('#wkPrev')?.addEventListener('click', () => {
    const [y, m, d] = ui.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 7);
    ui.date = dt.toLocaleDateString('sv-SE');
    render();
  });
  $('#wkNext')?.addEventListener('click', () => {
    const [y, m, d] = ui.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 7);
    ui.date = dt.toLocaleDateString('sv-SE');
    render();
  });
  $('#wkToday')?.addEventListener('click', () => {
    ui.date = todayISO();
    render();
  });

  // Month Grid
  $('#monthGrid')?.addEventListener('click', (e) => {
    const compactGo = (e.target as HTMLElement).closest('[data-goto-daily]') as HTMLElement;
    if (compactGo?.dataset.gotoDaily) {
      ui.date = compactGo.dataset.gotoDaily;
      switchTab('daily');
      return;
    }
    const memberBtn = (e.target as HTMLElement).closest('[data-mo-member]') as HTMLElement;
    if (memberBtn?.dataset.moMember && memberBtn.dataset.moMemberDate) {
      ui.viewUserId = memberBtn.dataset.moMember;
      ui.date = memberBtn.dataset.moMemberDate;
      switchTab('daily');
      return;
    }
    const addBtn = (e.target as HTMLElement).closest('[data-mo-add]') as HTMLElement;
    if (addBtn?.dataset.moAdd) {
      openTaskModal({ mode: 'new', date: addBtn.dataset.moAdd });
      return;
    }
    const dayEl = (e.target as HTMLElement).closest('[data-mo-day]') as HTMLElement;
    if (dayEl?.dataset.moDay) {
      openDayDetail(dayEl.dataset.moDay);
    }
  });
  $('#moPrev')?.addEventListener('click', () => {
    const { year, month } = ui.calMonth;
    const d = new Date(year, month - 1, 1);
    ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    render();
  });
  $('#moNext')?.addEventListener('click', () => {
    const { year, month } = ui.calMonth;
    const d = new Date(year, month + 1, 1);
    ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
    render();
  });
  $('#moToday')?.addEventListener('click', () => {
    const now = new Date();
    ui.calMonth = { year: now.getFullYear(), month: now.getMonth() };
    render();
  });

  // Team Grid Member Actions
  $('#view-team')?.addEventListener('click', async (e) => {
    const editBtn = (e.target as HTMLElement).closest('[data-act="edit-member"]') as HTMLElement;
    if (editBtn?.dataset.userId) {
      openEditMemberModal(editBtn.dataset.userId);
      return;
    }
    const delBtn = (e.target as HTMLElement).closest('[data-act="delete-member"]') as HTMLElement;
    if (delBtn?.dataset.userId) {
      const u = userById(delBtn.dataset.userId);
      const ok = await showConfirm(`Remover o membro "${esc(u.name)}" e todas as suas tarefas?`, 'Remover membro', { icon: '⚠️', danger: true });
      if (!ok) return;

      delete data.users[delBtn.dataset.userId];
      data.deletedUserIds.push(delBtn.dataset.userId);
      Object.keys(data.daily).forEach(iso => {
        data.daily[iso] = data.daily[iso].filter(t => t.ownerId !== delBtn.dataset.userId);
      });
      saveState(true);
      render();
    }
  });

  // Settings & Theme
  $('#settingsBtn')?.addEventListener('click', () => {
    const menu = $('#settingsMenu');
    if (menu) menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.settings-wrap')) {
      const menu = $('#settingsMenu');
      if (menu) menu.hidden = true;
    }
  });

  $('#userChip')?.addEventListener('click', openProfileModal);
  $('#setImport')?.addEventListener('click', () => { $('#settingsMenu').hidden = true; openImportModal(); });
  $('#setExport')?.addEventListener('click', () => { $('#settingsMenu').hidden = true; openExportModal(); });
  $('#setAddMember')?.addEventListener('click', () => { $('#settingsMenu').hidden = true; openUserModal(); });
  $('#setManageCarteiras')?.addEventListener('click', () => { $('#settingsMenu').hidden = true; openCarteirasModal(); });
  $('#setChangePwd')?.addEventListener('click', () => { $('#settingsMenu').hidden = true; $('#passwordModal').hidden = false; });
  $('#setTheme')?.addEventListener('click', toggleTheme);

  $('#setLogout')?.addEventListener('click', async () => {
    $('#settingsMenu').hidden = true;
    const ok = await showConfirm('Deseja realmente sair?', 'Sair');
    if (!ok) return;
    ui.currentUserId = null;
    saveState(false);
    showLogin();
  });

  // Filter Change Handlers
  const onUserFilter = (e: Event) => {
    ui.viewUserId = (e.target as HTMLSelectElement).value;
    render();
  };
  ['#viewUserSelectDaily', '#viewUserSelectWeekly', '#viewUserSelectMonth', '#viewUserSelectDash'].forEach(id => {
    $(id)?.addEventListener('change', onUserFilter);
  });

  const onCarFilter = (e: Event) => {
    ui.carteiraFilter = (e.target as HTMLSelectElement).value;
    render();
  };
  ['#carteiraFilterDaily', '#carteiraFilterWeekly', '#carteiraFilterMonth', '#carteiraFilterDash'].forEach(id => {
    $(id)?.addEventListener('change', onCarFilter);
  });

  const onCatFilter = (e: Event) => {
    ui.categoriaFilter = (e.target as HTMLSelectElement).value;
    render();
  };
  ['#categoriaFilterDaily', '#categoriaFilterWeekly', '#categoriaFilterMonth', '#categoriaFilterDash'].forEach(id => {
    $(id)?.addEventListener('change', onCatFilter);
  });

  // Date Nav
  $('#prevDay')?.addEventListener('click', () => {
    const [y, m, d] = ui.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    ui.date = dt.toLocaleDateString('sv-SE');
    render();
  });

  $('#nextDay')?.addEventListener('click', () => {
    const [y, m, d] = ui.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    ui.date = dt.toLocaleDateString('sv-SE');
    render();
  });

  $('#todayBtn')?.addEventListener('click', () => {
    ui.date = todayISO();
    render();
  });

  // Populate category options
  const qCat = $('#qCat');
  if (qCat) {
    qCat.innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  // Bind modals from modals.ts
  bindModalListeners();
}

async function init() {
  loadLocal();
  seedPredefinedUsers();
  migrateLegacyData();

  setSyncIndicator('offline');
  setOnSaveStateChange(() => updateSaveButton());
  setRenderCallback(() => render());
  setRenderRequester(() => render());
  onSyncStatusChange(status => setSyncIndicator(status));

  bindEvents();

  // Background Firebase connection and initial merge
  try {
    const remoteMerged = await fetchInitialRemote(data);
    applyMergedRemote(remoteMerged);

    subscribeToRemoteChanges((updated) => {
      applyMergedRemote(updated);
    }, () => data);
  } catch (err) {
    console.warn('[Firebase] init error:', err);
  }

  // Periodic safety check: ONLY syncs if there are pending unsaved changes
  setInterval(() => {
    if (hasUnsavedChanges) {
      forceSaveNow();
    }
  }, 10000);

  if (ui.currentUserId && data.users[ui.currentUserId]) {
    const user = data.users[ui.currentUserId];
    if (user.role === 'leader') {
      if (!ui.viewUserId || ui.viewUserId === user.id) ui.viewUserId = ALL_MEMBERS;
      if (!ui.tab || ui.tab === 'team') ui.tab = 'month';
    } else {
      ui.viewUserId = user.id;
      if (!ui.tab || ui.tab === 'team') ui.tab = 'daily';
    }
    hideLogin();
    render();
  } else {
    showLogin();
  }
}

init();
