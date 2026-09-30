import { data, ui, usersList, currentUser, isLeader, getAllCarteiras, touchUser, pushNotification, saveState } from './state';
import { $, $$, esc, normalizeName, showAlert, showConfirm, uid } from './utils';
import { CATEGORIES, LEGACY_CAT_MAP } from './constants';
import * as XLSX from 'xlsx';

export interface ParsedImportRow {
  rowNum: number;
  rawDate: string;
  iso: string;
  start: string;
  end: string;
  title: string;
  catKey: string;
  catRaw: string;
  carteira: string;
  valid: boolean;
  errors: {
    data?: string;
    descricao?: string;
    categoria?: string;
    carteira?: string;
  };
}

let importRows: ParsedImportRow[] = [];
let importMode: 'single' | 'multi' = 'single';
let importSingleUid: string | null = null;
let importMultiUids: string[] = [];
let onImportSuccessCb: (() => void) | null = null;

export function setOnImportSuccess(cb: () => void) {
  onImportSuccessCb = cb;
}

function parseExcelDate(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toLocaleDateString('sv-SE');
  }
  if (typeof val === 'number' && val > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + val * 86400000);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('sv-SE', { timeZone: 'UTC' });
  }
  const s = String(val).trim();
  const mBR = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (mBR) {
    let dd = parseInt(mBR[1], 10), mm = parseInt(mBR[2], 10), yy = parseInt(mBR[3], 10);
    if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  const mISO = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (mISO) {
    const yy = parseInt(mISO[1], 10), mm = parseInt(mISO[2], 10), dd = parseInt(mISO[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseExcelTime(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return String(val.getHours()).padStart(2, '0') + ':' + String(val.getMinutes()).padStart(2, '0');
  }
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60), mi = totalMin % 60;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  }
  return s;
}

function resolveExcelCategory(val: any): string | null {
  const s = String(val || '').trim();
  if (!s) return null;
  if (CATEGORIES[s]) return s;
  const norm = normalizeName(s);
  for (const [k, v] of Object.entries(CATEGORIES)) {
    if (normalizeName(v.label) === norm || normalizeName(k) === norm) return k;
  }
  for (const [legacy, current] of Object.entries(LEGACY_CAT_MAP)) {
    if (normalizeName(legacy) === norm) return current;
  }
  return null;
}

function pickCol(row: any, names: string[]): any {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n];
    for (const k of Object.keys(row)) {
      if (normalizeName(k) === normalizeName(n)) return row[k];
    }
  }
  return '';
}

export function renderImportMultiPicker() {
  const wrap = $('#importMultiPicker');
  if (!wrap) return;
  const selected = new Set(importMultiUids);
  wrap.innerHTML = usersList().map(u => {
    const on = selected.has(u.id);
    return `<button type="button" class="carteira-opt ${on ? 'on' : ''}" data-import-uid="${u.id}">
      <span class="chk">${on ? '✓' : ''}</span>
      <span class="lbl">${esc(u.name)}</span>
    </button>`;
  }).join('');
}

export function updateImportConfirmState() {
  const confirmBtn = $('#importConfirmBtn') as HTMLButtonElement;
  if (!confirmBtn) return;
  const validCount = importRows.filter(r => r.valid).length;
  let targetOk = false;

  if (!isLeader()) {
    targetOk = true;
  } else if (importMode === 'single') {
    targetOk = !!importSingleUid;
  } else {
    targetOk = importMultiUids.length > 0;
  }

  confirmBtn.disabled = validCount === 0 || !targetOk;
  if (validCount > 0 && targetOk) {
    const targetCount = isLeader() && importMode === 'multi' ? importMultiUids.length : 1;
    const totalAdded = validCount * targetCount;
    confirmBtn.textContent = `Importar ${totalAdded} tarefa${totalAdded > 1 ? 's' : ''}`;
  } else {
    confirmBtn.textContent = 'Importar';
  }
}

export function openImportModal() {
  importRows = [];
  importMode = 'single';
  importMultiUids = [];

  const leaderSection = $('#importLeaderSection');
  const ownerLine = $('#importOwnerLine');
  const fileInput = $('#importFile') as HTMLInputElement;
  if (fileInput) fileInput.value = '';

  if (isLeader()) {
    if (leaderSection) leaderSection.hidden = false;
    if (ownerLine) ownerLine.hidden = true;
    const members = usersList();
    const sel = $('#importSingleSelect') as HTMLSelectElement;
    if (sel) {
      sel.innerHTML = members.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
      importSingleUid = members[0]?.id || null;
    }
    $('#importSingleWrap').hidden = false;
    $('#importMultiWrap').hidden = true;
    $$('.role-opt[data-import-mode]').forEach(b => b.classList.toggle('active', b.dataset.importMode === 'single'));
    renderImportMultiPicker();
  } else {
    if (leaderSection) leaderSection.hidden = true;
    if (ownerLine) ownerLine.hidden = false;
    const me = currentUser();
    const ownerName = $('#importOwnerName');
    if (ownerName) ownerName.textContent = me?.name || '—';
    importSingleUid = me?.id || null;
  }

  $('#importPreviewWrap').hidden = true;
  const preview = $('#importPreview');
  if (preview) preview.innerHTML = '';
  const stats = $('#importStats');
  if (stats) stats.innerHTML = '';

  updateImportConfirmState();
  $('#importModal').hidden = false;
}

export function closeImportModal() {
  $('#importModal').hidden = true;
  importRows = [];
}

export function handleImportFile(file: File) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const buf = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) as any[];

      const systemCarteiras = getAllCarteiras();
      const parsed: ParsedImportRow[] = [];

      rawRows.forEach((r, idx) => {
        const dateRaw = pickCol(r, ['Data', 'Date', 'Dia', 'data']);
        const startRaw = pickCol(r, ['Hora Início', 'Hora Inicio', 'Início', 'Inicio', 'Start']);
        const endRaw = pickCol(r, ['Hora Fim', 'Fim', 'End', 'Hora Final']);
        const titleRaw = pickCol(r, ['Descrição', 'Descricao', 'Título', 'Titulo', 'Title', 'Atividade', 'Ação', 'Acao']);
        const catRaw = pickCol(r, ['Categoria', 'Category', 'Cat']);
        const carRaw = pickCol(r, ['Carteira', 'Portfolio', 'Carteiras']);

        const hasAny = String(dateRaw || '').trim() || String(startRaw || '').trim() ||
          String(endRaw || '').trim() || String(titleRaw || '').trim() ||
          String(catRaw || '').trim() || String(carRaw || '').trim();

        if (!hasAny) return;

        const rowNum = idx + 2; // Excel row numbering
        const iso = parseExcelDate(dateRaw);
        const start = parseExcelTime(startRaw);
        const end = parseExcelTime(endRaw);
        const title = String(titleRaw || '').trim();
        const catKey = resolveExcelCategory(catRaw);
        const carteira = String(carRaw || '').trim();

        const errors: ParsedImportRow['errors'] = {};

        if (!iso) {
          errors.data = 'Data inválida (formato esperado: DD/MM/AAAA)';
        }
        if (!title) {
          errors.descricao = 'Descrição da tarefa não preenchida';
        }
        if (!catKey) {
          errors.categoria = catRaw ? `Categoria "${catRaw}" não reconhecida` : 'Categoria não informada';
        }
        if (!carteira) {
          errors.carteira = 'Carteira não informada';
        } else if (!systemCarteiras.some(c => normalizeName(c) === normalizeName(carteira))) {
          errors.carteira = `Carteira "${carteira}" não existe no sistema`;
        }

        const valid = Object.keys(errors).length === 0;

        parsed.push({
          rowNum,
          rawDate: String(dateRaw || ''),
          iso: iso || '',
          start,
          end,
          title,
          catKey: catKey || '',
          catRaw: String(catRaw || ''),
          carteira,
          valid,
          errors
        });
      });

      importRows = parsed;
      renderImportPreviewTable();
      updateImportConfirmState();
    } catch (err: any) {
      showAlert('Não foi possível ler a planilha.<br><br><b>Erro:</b> ' + esc(err.message), 'Erro na leitura', { icon: '⚠️', iconVariant: 'danger' });
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderImportPreviewTable() {
  const previewWrap = $('#importPreviewWrap');
  const statsEl = $('#importStats');
  const previewEl = $('#importPreview');
  if (!previewWrap || !statsEl || !previewEl) return;

  previewWrap.hidden = false;

  const totalCount = importRows.length;
  const validCount = importRows.filter(r => r.valid).length;
  const errorCount = totalCount - validCount;

  statsEl.innerHTML = `
    <div class="st ok"><div class="v">${validCount}</div><div class="k">Tarefas Funcionais</div></div>
    <div class="st ${errorCount > 0 ? 'err' : ''}"><div class="v">${errorCount}</div><div class="k">Com Erros</div></div>
    <div class="st"><div class="v">${totalCount}</div><div class="k">Total de Linhas</div></div>
  `;

  if (!totalCount) {
    previewEl.innerHTML = `<div class="empty" style="padding:22px;"><span class="big">🤔</span>Nenhuma linha de tarefa encontrada na planilha.</div>`;
    return;
  }

  const tableRows = importRows.map(r => {
    const e = r.errors;
    const isErr = !r.valid;
    const catLabel = r.catKey ? (CATEGORIES[r.catKey]?.label || r.catKey) : (r.catRaw || '—');

    const errList = Object.values(e).filter(Boolean);
    const statusTxt = isErr
      ? `<span style="color:#f87171;font-weight:700;">⚠ ${esc(errList.join(' | '))}</span>`
      : `<span style="color:#34d399;font-weight:700;">✓ Funcional</span>`;

    return `<tr class="${isErr ? 'row-error' : ''}">
      <td style="font-weight:700;color:var(--muted);">${r.rowNum}</td>
      <td class="${e.data ? 'cell-error' : ''}" title="${esc(e.data || '')}">${esc(r.rawDate || r.iso || '—')}</td>
      <td>${esc(r.start || '—')}</td>
      <td>${esc(r.end || '—')}</td>
      <td class="${e.descricao ? 'cell-error' : ''}" title="${esc(e.descricao || '')}">${esc(r.title || '—')}</td>
      <td class="${e.categoria ? 'cell-error' : ''}" title="${esc(e.categoria || '')}">${esc(catLabel)}</td>
      <td class="${e.carteira ? 'cell-error' : ''}" title="${esc(e.carteira || '')}">${esc(r.carteira || '—')}</td>
      <td>${statusTxt}</td>
    </tr>`;
  }).join('');

  previewEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr>
        <th style="width:40px;">Linha</th>
        <th>Data</th>
        <th>Início</th>
        <th>Fim</th>
        <th>Descrição</th>
        <th>Categoria</th>
        <th>Carteira</th>
        <th>Status / Validação</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>`;
}

export async function confirmImportAction() {
  const validRows = importRows.filter(r => r.valid);
  if (!validRows.length) return;

  let targetUsers: any[] = [];
  if (isLeader()) {
    if (importMode === 'single') {
      const u = usersList().find(x => x.id === importSingleUid);
      if (!u) {
        await showAlert('Selecione um membro para receber as tarefas.', 'Aviso', { icon: '⚠️' });
        return;
      }
      targetUsers = [u];
    } else {
      if (!importMultiUids.length) {
        await showAlert('Selecione pelo menos um membro para receber as tarefas.', 'Aviso', { icon: '⚠️' });
        return;
      }
      targetUsers = importMultiUids.map(id => data.users[id]).filter(Boolean);
    }
  } else {
    const me = currentUser();
    if (!me) return;
    targetUsers = [me];
  }

  const validCount = validRows.length;
  const totalTasks = validCount * targetUsers.length;
  const skippedCount = importRows.length - validCount;

  let confirmMsg = '';
  if (targetUsers.length === 1) {
    confirmMsg = `Importar <b>${validCount}</b> tarefas funcionais para <b>${esc(targetUsers[0].name)}</b>?`;
  } else {
    confirmMsg = `Importar <b>${validCount}</b> tarefas para <b>${targetUsers.length} membros</b> (total de <b>${totalTasks} tarefas criadas</b>)?<br><br><b>Destinatários:</b> ${targetUsers.map(u => esc(u.name)).join(', ')}`;
  }

  if (skippedCount > 0) {
    confirmMsg += `<br><br><span style="color:#f87171;">⚠️ <b>${skippedCount} linha(s) com erros</b> serão ignoradas na importação.</span>`;
  }

  const ok = await showConfirm(confirmMsg, 'Confirmar importação', { icon: '📥', confirmText: 'Importar agora' });
  if (!ok) return;

  targetUsers.forEach(user => {
    validRows.forEach(r => {
      const iso = r.iso;
      if (!Array.isArray(data.daily[iso])) data.daily[iso] = [];
      data.daily[iso].push({
        id: uid(),
        ownerId: user.id,
        title: r.title,
        start: r.start,
        end: r.end,
        cat: r.catKey,
        carteira: r.carteira,
        prio: 'media',
        notes: '',
        done: false,
        updatedAt: Date.now()
      });
    });
    touchUser(user.id);
    if (user.id !== ui.currentUserId) {
      pushNotification(user.id, 'created', { title: `${validCount} tarefa(s) importada(s)`, date: validRows[0].iso });
    }
  });

  saveState(true);
  closeImportModal();
  if (onImportSuccessCb) onImportSuccessCb();

  await showAlert(
    `✅ <b>${totalTasks}</b> tarefa(s) adicionadas com sucesso!<br>${skippedCount > 0 ? `<br><small style="color:var(--muted);">${skippedCount} linha(s) com erros foram ignoradas.</small>` : ''}`,
    'Importação Concluída',
    { icon: '✅' }
  );
}

export function bindImportEvents() {
  $('#importModalClose')?.addEventListener('click', closeImportModal);
  $('#importBtnCancel')?.addEventListener('click', closeImportModal);

  // Template download
  $('#importDownloadTemplate')?.addEventListener('click', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Data', 'Hora Início', 'Hora Fim', 'Descrição', 'Categoria', 'Carteira'],
      ['15/01/2026', '09:00', '10:30', 'Exemplo: reunião de alinhamento com equipe', 'Reunião', 'GM'],
      ['15/01/2026', '14:00', '15:00', 'Exemplo: acompanhamento operacional', 'Acompanhamento', 'Safra'],
      ['16/01/2026', '08:30', '09:15', 'Exemplo: capacitação e treinamento', 'Capacitação Inicial', 'BMW']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 42 }, { wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
    XLSX.writeFile(wb, 'cronoplano-modelo-importacao.xlsx');
  });

  // Mode switcher (Single vs Multi)
  $$('.role-opt[data-import-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      importMode = (btn.dataset.importMode as any) || 'single';
      $$('.role-opt[data-import-mode]').forEach(b => b.classList.toggle('active', b === btn));
      $('#importSingleWrap').hidden = importMode !== 'single';
      $('#importMultiWrap').hidden = importMode !== 'multi';
      updateImportConfirmState();
    });
  });

  // Single select
  $('#importSingleSelect')?.addEventListener('change', (e) => {
    importSingleUid = (e.target as HTMLSelectElement).value || null;
    updateImportConfirmState();
  });

  // Multi select chips
  $('#importMultiPicker')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-import-uid]') as HTMLElement;
    if (!btn) return;
    const uidTarget = btn.dataset.importUid;
    if (!uidTarget) return;

    const idx = importMultiUids.indexOf(uidTarget);
    if (idx >= 0) {
      importMultiUids.splice(idx, 1);
    } else {
      importMultiUids.push(uidTarget);
    }
    renderImportMultiPicker();
    updateImportConfirmState();
  });

  // File input
  $('#importFile')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleImportFile(file);
  });

  // Confirm import button
  $('#importConfirmBtn')?.addEventListener('click', confirmImportAction);
}
