import {
  data, ui, saveState, currentUser, userById, usersList,
  canEditCurrentView, viewingAll, isLeader, getAllCarteiras,
  ensureCarteirasInitialized, touchUser, pushNotification
} from './state';
import {
  $, $$, esc, normalizeName, hashPassword, showAlert, showConfirm,
  resizeImageFile, todayISO, uid, fmtDateLong, catOf, taskStatus,
  avatarHTML, timeToMin
} from './utils';
import { CATEGORIES, PRIO, PHOTO_SIZE, ALL_MEMBERS } from './constants';
import { TaskItem, UserProfile } from './types';
import * as XLSX from 'xlsx';
import {
  openImportModal as openImportModalHelper,
  closeImportModal as closeImportModalHelper,
  bindImportEvents,
  setOnImportSuccess
} from './importHelper';

let onRenderRequest: (() => void) | null = null;
export function setRenderRequester(cb: () => void) {
  onRenderRequest = cb;
}
function triggerRender() {
  if (onRenderRequest) onRenderRequest();
}

// 1. CARTEIRAS PICKER HELPER
export function renderCarteiraPicker(wrapEl: HTMLElement | null, selectedList: string[]) {
  if (!wrapEl) return;
  const selected = new Set(selectedList || []);
  const all = getAllCarteiras();
  wrapEl.innerHTML = all.map(c => {
    const on = selected.has(c);
    return `<button type="button" class="carteira-opt ${on ? 'on' : ''}" data-carteira="${esc(c)}">
      <span class="chk">${on ? '✓' : ''}</span>
      <span class="lbl" title="${esc(c)}">${esc(c)}</span>
    </button>`;
  }).join('');
}

// 2. MODAL TAREFA (NEW / EDIT)
let taskModalCtx: { mode: 'new' | 'edit'; date?: string; item?: TaskItem } | null = null;

export function openTaskModal(opts: { mode: 'new' | 'edit'; date?: string; item?: TaskItem }) {
  if (!canEditCurrentView()) return;
  taskModalCtx = opts;
  const item = opts.item || ({} as any);
  const editing = opts.mode === 'edit';

  const modalTitle = $('#modalTitle');
  if (modalTitle) modalTitle.textContent = editing ? 'Editar atividade' : 'Nova atividade';

  const fTitle = $('#fTitle') as HTMLInputElement;
  if (fTitle) fTitle.value = item.title || '';

  let defaultOwner = item.ownerId || (ui.viewUserId && ui.viewUserId !== ALL_MEMBERS ? ui.viewUserId : ui.currentUserId);
  const ownerRow = $('#ownerRow');
  const fOwner = $('#fOwner') as HTMLSelectElement;
  if (isLeader() && ownerRow && fOwner) {
    ownerRow.hidden = false;
    fOwner.innerHTML = usersList().map(u => `<option value="${u.id}" ${u.id === defaultOwner ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  } else if (ownerRow) {
    ownerRow.hidden = true;
  }

  const fCarteira = $('#fCarteira') as HTMLSelectElement;
  if (fCarteira) {
    const carteiras = getAllCarteiras();
    fCarteira.innerHTML = carteiras.map(c => `<option value="${c}" ${item.carteira === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
    if (item.carteira) fCarteira.value = item.carteira;
    else if (carteiras.length) fCarteira.value = carteiras[0];
  }

  const fDate = $('#fDate') as HTMLInputElement;
  if (fDate) fDate.value = opts.date || ui.date || todayISO();

  const fStart = $('#fStart') as HTMLInputElement;
  if (fStart) fStart.value = item.start || '';

  const fEnd = $('#fEnd') as HTMLInputElement;
  if (fEnd) fEnd.value = item.end || '';

  const fCat = $('#fCat') as HTMLSelectElement;
  if (fCat) {
    fCat.innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    if (item.cat) fCat.value = item.cat;
  }

  const fPrio = $('#fPrio') as HTMLSelectElement;
  if (fPrio) fPrio.value = item.prio || 'media';

  const fNotes = $('#fNotes') as HTMLTextAreaElement;
  if (fNotes) fNotes.value = item.notes || '';

  $('#modal').hidden = false;
  setTimeout(() => fTitle?.focus(), 60);
}

export function closeTaskModal() {
  $('#modal').hidden = true;
  taskModalCtx = null;
}

// 3. MODAL DETALHES DO DIA
let dayDetailDate: string | null = null;

export function openDayDetail(dateIso: string) {
  dayDetailDate = dateIso;
  const tasks = (data.daily[dateIso] || []).slice().sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  const allView = viewingAll();
  const canEdit = canEditCurrentView();

  const titleEl = $('#dayDetailTitle');
  if (titleEl) titleEl.textContent = fmtDateLong(dateIso);

  const bodyEl = $('#dayDetailBody');
  if (bodyEl) {
    if (!tasks.length) {
      bodyEl.innerHTML = `<div class="empty" style="padding:30px 16px;"><span class="big">☀️</span>Nenhuma atividade registrada para este dia.</div>`;
    } else {
      bodyEl.innerHTML = `<ul class="day-detail-list">${tasks.map(t => {
        const cat = catOf(t.cat);
        const prio = PRIO[t.prio] || PRIO.media;
        const status = taskStatus(t, dateIso);
        const owner = userById(t.ownerId);
        const statusBadge = status === 'done' ? `<span class="status-badge done">Concluída</span>` :
          status === 'late' ? `<span class="status-badge late">Atrasada</span>` : `<span class="status-badge pending">Pendente</span>`;

        return `<li class="day-detail-item ${t.done ? 'done' : ''}" style="--c:${cat.color}">
          <div class="dd-time">${t.start ? esc(t.start) : '--:--'}${t.end ? `<small>${esc(t.end)}</small>` : ''}</div>
          <div class="dd-main">
            <div class="dd-title">${esc(t.title)}</div>
            <div class="dd-meta">
              ${allView ? `<span class="pill owner-pill" style="--c:${owner.color}">${avatarHTML(owner)}${esc(owner.name)}</span>` : ''}
              <span class="pill" style="--c:${cat.color}">${cat.label}</span>
              ${t.carteira ? `<span class="pill carteira">🏷️ ${esc(t.carteira)}</span>` : ''}
              ${t.prio && t.prio !== 'media' ? `<span class="pill prio-${t.prio}">${prio.label}</span>` : ''}
              ${statusBadge}
            </div>
            ${t.notes ? `<div class="dd-notes">${esc(t.notes)}</div>` : ''}
          </div>
          ${canEdit ? `<div class="dd-actions">
            <button data-dd-act="edit" data-dd-id="${t.id}">✎</button>
            <button data-dd-act="del" data-dd-id="${t.id}">🗑</button>
          </div>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }
  }

  const addBtn = $('#dayDetailBtnAdd');
  if (addBtn) addBtn.hidden = !(canEdit && !allView);
  $('#dayDetailModal').hidden = false;
}

export function closeDayDetail() {
  $('#dayDetailModal').hidden = true;
  dayDetailDate = null;
}

// 4. MODAL ADICIONAR MEMBRO
let userModalRole = 'member';
let userModalCarteiras: string[] = [];

export function openUserModal() {
  userModalRole = 'member';
  userModalCarteiras = [];
  ($('#uName') as HTMLInputElement).value = '';
  ($('#uCargo') as HTMLInputElement).value = '';
  ($('#uEmail') as HTMLInputElement).value = '';
  ($('#uCarteiraCustom') as HTMLInputElement).value = '';

  $$('.role-opt[data-role]').forEach(b => b.classList.toggle('active', b.dataset.role === userModalRole));
  renderCarteiraPicker($('#uCarteirasPicker'), userModalCarteiras);
  $('#userModal').hidden = false;
  setTimeout(() => ($('#uName') as HTMLInputElement)?.focus(), 60);
}

export function closeUserModal() {
  $('#userModal').hidden = true;
}

// 5. MODAL MEU PERFIL
let profileCarteiras: string[] = [];
let profilePhoto = '';

export function openProfileModal() {
  const u = currentUser();
  if (!u) return;
  profileCarteiras = (u.carteiras || []).slice();
  profilePhoto = u.photo || '';

  ($('#pName') as HTMLInputElement).value = u.name;
  ($('#pCargo') as HTMLInputElement).value = u.cargo || '';
  ($('#pEmail') as HTMLInputElement).value = u.email || '';
  ($('#pCarteiraCustom') as HTMLInputElement).value = '';

  renderCarteiraPicker($('#pCarteirasPicker'), profileCarteiras);
  renderProfilePhotoPreview();
  $('#profileModal').hidden = false;
}

export function closeProfileModal() {
  $('#profileModal').hidden = true;
}

function renderProfilePhotoPreview() {
  const prev = $('#pPhotoPreview');
  if (!prev) return;
  const u = currentUser() || ({} as any);
  if (profilePhoto) {
    prev.innerHTML = `<img src="${profilePhoto}" alt="Foto">`;
    prev.style.background = '#000';
  } else {
    prev.innerHTML = u.name ? u.name[0].toUpperCase() : '?';
    prev.style.background = u.color || '#666';
  }
}

// 6. MODAL EDITAR MEMBRO
let editMemberId: string | null = null;
let editMemberCarteiras: string[] = [];
let editMemberPhoto = '';
let editMemberRole: 'member' | 'leader' = 'member';

export function openEditMemberModal(userId: string) {
  const u = data.users[userId];
  if (!u) return;
  editMemberId = userId;
  editMemberCarteiras = (u.carteiras || []).slice();
  editMemberPhoto = u.photo || '';
  editMemberRole = u.role;

  const titleEl = $('#editMemberTitle');
  if (titleEl) titleEl.textContent = `Editar ${u.name}`;

  ($('#emName') as HTMLInputElement).value = u.name;
  ($('#emCargo') as HTMLInputElement).value = u.cargo || '';
  ($('#emEmail') as HTMLInputElement).value = u.email || '';
  ($('#emCarteiraCustom') as HTMLInputElement).value = '';
  ($('#emNewPwd') as HTMLInputElement).value = '';

  $$('.role-opt[data-em-role]').forEach(b => b.classList.toggle('active', b.dataset.emRole === editMemberRole));
  renderCarteiraPicker($('#emCarteirasPicker'), editMemberCarteiras);
  renderEditMemberPhotoPreview();
  $('#editMemberModal').hidden = false;
}

export function closeEditMemberModal() {
  $('#editMemberModal').hidden = true;
  editMemberId = null;
}

export function renderEditMemberPhotoPreview() {
  const prev = $('#emPhotoPreview');
  if (!prev) return;
  const u = editMemberId ? data.users[editMemberId] : null;
  if (editMemberPhoto) {
    prev.innerHTML = `<img src="${editMemberPhoto}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:18px;">`;
    prev.style.background = '#000';
  } else {
    prev.innerHTML = u?.name ? u.name[0].toUpperCase() : '?';
    prev.style.background = u?.color || '#666';
  }
}

// 7. MODAL GERENCIAR CARTEIRAS
export function openCarteirasModal() {
  renderCarteirasManageList();
  ($('#newCarteiraName') as HTMLInputElement).value = '';
  $('#carteirasModal').hidden = false;
}

export function closeCarteirasModal() {
  $('#carteirasModal').hidden = true;
}

export function renderCarteirasManageList() {
  const wrap = $('#carteirasManageList');
  if (!wrap) return;
  const carteiras = getAllCarteiras();
  if (!carteiras.length) {
    wrap.innerHTML = `<li class="carteiras-manage-item empty-msg">Nenhuma carteira cadastrada.</li>`;
    return;
  }
  wrap.innerHTML = carteiras.map(c => `
    <li class="carteiras-manage-item" data-carteira-name="${esc(c)}">
      <span class="nm" title="${esc(c)}">${esc(c)}</span>
      <button type="button" class="act" data-act="del-carteira" data-carteira="${esc(c)}" title="Excluir">🗑</button>
    </li>
  `).join('');
}

// 8. MODAL IMPORTAR EXCEL
export function openImportModal() {
  openImportModalHelper();
}

export function closeImportModal() {
  closeImportModalHelper();
}

// 9. MODAL EXPORTAR
let exportMode = 'all';

export function openExportModal() {
  exportMode = 'all';
  const userWrap = $('#exportUserWrap');
  if (userWrap) userWrap.hidden = true;
  $$('.export-opt').forEach((o, i) => o.classList.toggle('active', i === 0));
  const sel = $('#exportUserSelect') as HTMLSelectElement;
  if (sel) {
    sel.innerHTML = usersList().map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }
  $('#exportModal').hidden = false;
}

export function closeExportModal() {
  $('#exportModal').hidden = true;
}

export function exportToExcel() {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [['Data', 'Colaborador', 'Carteira', 'Início', 'Fim', 'Descrição', 'Categoria', 'Status']];

  Object.entries(data.daily).forEach(([iso, arr]) => {
    arr.forEach(t => {
      const u = userById(t.ownerId);
      if (exportMode === 'selected') {
        const selectedUid = ($('#exportUserSelect') as HTMLSelectElement)?.value;
        if (t.ownerId !== selectedUid) return;
      }
      rows.push([
        iso,
        u.name,
        t.carteira || '',
        t.start || '',
        t.end || '',
        t.title || '',
        catOf(t.cat).label,
        t.done ? 'Concluída' : 'Pendente'
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
  XLSX.writeFile(wb, `cronoplano-export-${todayISO()}.xlsx`);
  closeExportModal();
}

// BIND ALL MODAL LISTENERS
export function bindModalListeners() {
  // Task modal submit
  $('#modalForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!taskModalCtx) return;
    const title = ($('#fTitle') as HTMLInputElement).value.trim();
    if (!title) return;

    const newDate = ($('#fDate') as HTMLInputElement).value || ui.date || todayISO();
    const newStart = ($('#fStart') as HTMLInputElement).value || '';
    const newEnd = ($('#fEnd') as HTMLInputElement).value || '';
    const newCat = ($('#fCat') as HTMLSelectElement).value;
    const newCarteira = ($('#fCarteira') as HTMLSelectElement).value || '';
    const newPrio = ($('#fPrio') as HTMLSelectElement).value as any;
    const newNotes = ($('#fNotes') as HTMLTextAreaElement).value.trim();

    let owner = isLeader() ? (($('#fOwner') as HTMLSelectElement)?.value || ui.currentUserId) : ui.currentUserId;
    if (!owner || owner === ALL_MEMBERS) owner = ui.currentUserId;

    if (taskModalCtx.mode === 'new') {
      if (!Array.isArray(data.daily[newDate])) data.daily[newDate] = [];
      data.daily[newDate].push({
        id: uid(),
        ownerId: owner || '',
        title,
        start: newStart,
        end: newEnd,
        cat: newCat,
        carteira: newCarteira,
        prio: newPrio,
        notes: newNotes,
        done: false,
        updatedAt: Date.now()
      });
      touchUser(owner || '');
      if (owner && owner !== ui.currentUserId) {
        pushNotification(owner, 'created', { title, date: newDate });
      }
    } else if (taskModalCtx.mode === 'edit' && taskModalCtx.item) {
      const oldDate = taskModalCtx.date || newDate;
      const oldTasks = data.daily[oldDate] || [];
      const idx = oldTasks.findIndex(t => t.id === taskModalCtx!.item!.id);
      const wasDone = idx >= 0 ? oldTasks[idx].done : false;
      if (idx >= 0) oldTasks.splice(idx, 1);

      if (!Array.isArray(data.daily[newDate])) data.daily[newDate] = [];
      data.daily[newDate].push({
        id: taskModalCtx.item.id,
        ownerId: owner || taskModalCtx.item.ownerId,
        title,
        start: newStart,
        end: newEnd,
        cat: newCat,
        carteira: newCarteira,
        prio: newPrio,
        notes: newNotes,
        done: wasDone,
        updatedAt: Date.now()
      });
      touchUser(owner || '');
      if (owner && owner !== ui.currentUserId) {
        pushNotification(owner, 'updated', { title, date: newDate });
      }
    }

    ui.date = newDate;
    saveState(true);
    closeTaskModal();
    triggerRender();
  });

  $('#modalClose')?.addEventListener('click', closeTaskModal);
  $('#btnCancel')?.addEventListener('click', closeTaskModal);

  // Day detail modal actions
  $('#dayDetailClose')?.addEventListener('click', closeDayDetail);
  $('#dayDetailBtnClose')?.addEventListener('click', closeDayDetail);
  $('#dayDetailBtnAdd')?.addEventListener('click', () => {
    if (dayDetailDate) {
      const d = dayDetailDate;
      closeDayDetail();
      openTaskModal({ mode: 'new', date: d });
    }
  });

  $('#dayDetailBody')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-dd-act]') as HTMLElement;
    if (!btn || !dayDetailDate) return;
    const act = btn.dataset.ddAct;
    const id = btn.dataset.ddId;
    const tasks = data.daily[dayDetailDate] || [];
    const item = tasks.find(t => t.id === id);
    if (!item) return;

    if (act === 'edit') {
      closeDayDetail();
      openTaskModal({ mode: 'edit', date: dayDetailDate, item });
    } else if (act === 'del') {
      const ok = await showConfirm('Excluir esta atividade?', 'Excluir', { icon: '🗑', danger: true });
      if (!ok) return;
      const idx = tasks.findIndex(t => t.id === id);
      if (idx >= 0) {
        tasks.splice(idx, 1);
        data.deletedTaskIds[id!] = Date.now();
        touchUser(item.ownerId);
        saveState(true);
        triggerRender();
        openDayDetail(dayDetailDate);
      }
    }
  });

  // User modal
  $('#userModalClose')?.addEventListener('click', closeUserModal);
  $('#userBtnCancel')?.addEventListener('click', closeUserModal);
  $$('.role-opt[data-role]').forEach(b => {
    b.addEventListener('click', () => {
      userModalRole = b.dataset.role || 'member';
      $$('.role-opt[data-role]').forEach(x => x.classList.toggle('active', x === b));
    });
  });

  $('#uCarteirasPicker')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-carteira]') as HTMLElement;
    if (!btn) return;
    const c = btn.dataset.carteira;
    if (!c) return;
    const i = userModalCarteiras.indexOf(c);
    if (i >= 0) userModalCarteiras.splice(i, 1);
    else userModalCarteiras.push(c);
    renderCarteiraPicker($('#uCarteirasPicker'), userModalCarteiras);
  });

  $('#uCarteiraAdd')?.addEventListener('click', () => {
    const inp = $('#uCarteiraCustom') as HTMLInputElement;
    const v = inp.value.trim();
    if (!v) return;
    ensureCarteirasInitialized();
    if (!data.carteiras.includes(v)) {
      data.carteiras.push(v);
      data.carteiras.sort();
    }
    if (!userModalCarteiras.includes(v)) userModalCarteiras.push(v);
    inp.value = '';
    renderCarteiraPicker($('#uCarteirasPicker'), userModalCarteiras);
  });

  $('#userForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ($('#uName') as HTMLInputElement).value.trim();
    if (!name) return;
    const id = normalizeName(name).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ('u-' + uid());
    data.users[id] = {
      id,
      name,
      role: userModalRole as any,
      color: '#2563eb',
      cargo: ($('#uCargo') as HTMLInputElement).value.trim(),
      email: ($('#uEmail') as HTMLInputElement).value.trim(),
      carteiras: userModalCarteiras.slice(),
      photo: '',
      passwordHash: '',
      lastActivityAt: '',
      updatedAt: Date.now()
    };
    saveState(true);
    closeUserModal();
    triggerRender();
  });

  // Profile modal
  $('#profileModalClose')?.addEventListener('click', closeProfileModal);
  $('#profileBtnCancel')?.addEventListener('click', closeProfileModal);
  $('#pPhotoBtn')?.addEventListener('click', () => ($('#pPhotoInput') as HTMLInputElement)?.click());
  $('#pPhotoRemoveBtn')?.addEventListener('click', () => { profilePhoto = ''; renderProfilePhotoPreview(); });
  $('#pPhotoInput')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      try {
        profilePhoto = await resizeImageFile(f, PHOTO_SIZE);
        renderProfilePhotoPreview();
      } catch (err: any) {
        showAlert(err.message || 'Erro ao processar imagem', 'Erro', { icon: '⚠️' });
      }
    }
  });

  $('#pCarteirasPicker')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-carteira]') as HTMLElement;
    if (!btn) return;
    const c = btn.dataset.carteira;
    if (!c) return;
    const i = profileCarteiras.indexOf(c);
    if (i >= 0) profileCarteiras.splice(i, 1);
    else profileCarteiras.push(c);
    renderCarteiraPicker($('#pCarteirasPicker'), profileCarteiras);
  });

  $('#pCarteiraAdd')?.addEventListener('click', () => {
    const inp = $('#pCarteiraCustom') as HTMLInputElement;
    const v = inp.value.trim();
    if (!v) return;
    ensureCarteirasInitialized();
    if (!data.carteiras.includes(v)) {
      data.carteiras.push(v);
      data.carteiras.sort();
    }
    if (!profileCarteiras.includes(v)) profileCarteiras.push(v);
    inp.value = '';
    renderCarteiraPicker($('#pCarteirasPicker'), profileCarteiras);
  });

  $('#profileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = currentUser();
    if (!u) return;
    u.name = ($('#pName') as HTMLInputElement).value.trim() || u.name;
    u.cargo = ($('#pCargo') as HTMLInputElement).value.trim();
    u.email = ($('#pEmail') as HTMLInputElement).value.trim();
    u.carteiras = profileCarteiras.slice();
    u.photo = profilePhoto;
    u.updatedAt = Date.now();
    saveState(true);
    closeProfileModal();
    triggerRender();
  });

  // Edit Member Modal
  $('#editMemberClose')?.addEventListener('click', closeEditMemberModal);
  $('#editMemberBtnCancel')?.addEventListener('click', closeEditMemberModal);
  $$('.role-opt[data-em-role]').forEach(b => {
    b.addEventListener('click', () => {
      editMemberRole = (b.dataset.emRole as any) || 'member';
      $$('.role-opt[data-em-role]').forEach(x => x.classList.toggle('active', x === b));
    });
  });

  // Photo handlers for editing member
  $('#emPhotoBtn')?.addEventListener('click', () => ($('#emPhotoInput') as HTMLInputElement)?.click());
  $('#emPhotoRemoveBtn')?.addEventListener('click', () => {
    editMemberPhoto = '';
    renderEditMemberPhotoPreview();
  });
  $('#emPhotoInput')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      try {
        editMemberPhoto = await resizeImageFile(f, PHOTO_SIZE);
        renderEditMemberPhotoPreview();
      } catch (err: any) {
        showAlert(err.message || 'Erro ao processar imagem', 'Erro', { icon: '⚠️' });
      }
    }
  });

  $('#emCarteirasPicker')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-carteira]') as HTMLElement;
    if (!btn) return;
    const c = btn.dataset.carteira;
    if (!c) return;
    const i = editMemberCarteiras.indexOf(c);
    if (i >= 0) editMemberCarteiras.splice(i, 1);
    else editMemberCarteiras.push(c);
    renderCarteiraPicker($('#emCarteirasPicker'), editMemberCarteiras);
  });

  $('#emCarteiraAdd')?.addEventListener('click', () => {
    const inp = $('#emCarteiraCustom') as HTMLInputElement;
    const v = inp.value.trim();
    if (!v) return;
    ensureCarteirasInitialized();
    if (!data.carteiras.includes(v)) {
      data.carteiras.push(v);
      data.carteiras.sort();
    }
    if (!editMemberCarteiras.includes(v)) editMemberCarteiras.push(v);
    inp.value = '';
    renderCarteiraPicker($('#emCarteirasPicker'), editMemberCarteiras);
  });

  $('#editMemberForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editMemberId) return;
    const u = data.users[editMemberId];
    if (!u) return;

    u.name = ($('#emName') as HTMLInputElement).value.trim() || u.name;
    u.cargo = ($('#emCargo') as HTMLInputElement).value.trim();
    u.email = ($('#emEmail') as HTMLInputElement).value.trim();
    u.role = editMemberRole;
    u.carteiras = editMemberCarteiras.slice();
    u.photo = editMemberPhoto;
    const newPwd = ($('#emNewPwd') as HTMLInputElement).value;
    if (newPwd && newPwd.length >= 4) {
      u.passwordHash = hashPassword(newPwd);
    }
    u.updatedAt = Date.now();

    saveState(true);
    closeEditMemberModal();
    triggerRender();
    showAlert(`Informações de ${esc(u.name)} atualizadas!`, 'Sucesso', { icon: '✅' });
  });

  // Manage Carteiras
  $('#carteirasModalClose')?.addEventListener('click', closeCarteirasModal);
  $('#carteirasModalBtnClose')?.addEventListener('click', closeCarteirasModal);
  $('#newCarteiraAdd')?.addEventListener('click', () => {
    const inp = $('#newCarteiraName') as HTMLInputElement;
    const v = inp.value.trim();
    if (!v) return;
    ensureCarteirasInitialized();
    if (!data.carteiras.includes(v)) {
      data.carteiras.push(v);
      data.carteiras.sort();
      saveState(true);
      renderCarteirasManageList();
      triggerRender();
    }
    inp.value = '';
  });

  $('#carteirasManageList')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act="del-carteira"]') as HTMLElement;
    if (!btn) return;
    const c = btn.dataset.carteira;
    if (!c) return;
    const ok = await showConfirm(`Excluir a carteira "${esc(c)}"?`, 'Excluir', { icon: '🗑', danger: true });
    if (!ok) return;

    data.carteiras = data.carteiras.filter(x => x !== c);
    saveState(true);
    renderCarteirasManageList();
    triggerRender();
  });

  // Password Modal
  $('#passwordModalClose')?.addEventListener('click', () => { $('#passwordModal').hidden = true; });
  $('#passwordBtnCancel')?.addEventListener('click', () => { $('#passwordModal').hidden = true; });
  $('#passwordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = currentUser();
    if (!u) return;
    const p1 = ($('#pwNew') as HTMLInputElement).value;
    const p2 = ($('#pwNew2') as HTMLInputElement).value;
    if (!p1 || p1.length < 4 || p1 !== p2) {
      const err = $('#pwError');
      if (err) { err.textContent = p1.length < 4 ? 'Mínimo 4 caracteres' : 'As senhas não conferem'; err.hidden = false; }
      return;
    }
    u.passwordHash = hashPassword(p1);
    u.updatedAt = Date.now();
    saveState(true);
    $('#passwordModal').hidden = true;
    showAlert('Senha alterada com sucesso!', 'Pronto', { icon: '✅' });
  });

  // Bind Import Events from importHelper
  bindImportEvents();
  setOnImportSuccess(() => triggerRender());

  // Export Modal
  $('#exportModalClose')?.addEventListener('click', closeExportModal);
  $('#exportBtnCancel')?.addEventListener('click', closeExportModal);
  $$('.export-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.export-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      exportMode = opt.dataset.export || 'all';
      const userWrap = $('#exportUserWrap');
      if (userWrap) userWrap.hidden = exportMode !== 'selected';
    });
  });
  $('#exportConfirmBtn')?.addEventListener('click', exportToExcel);
}
