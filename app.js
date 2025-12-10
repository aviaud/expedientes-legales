/* ---------------------------
  Configuración - modifica aquí
   - CLIENT_ID: desde Google Cloud Console (OAuth client ID)
   - SHEET_ID: ID de la Google Sheet donde guardarás metadatos
----------------------------*/
const CONFIG = {
  CLIENT_ID: 'REEMPLAZA_CON_TU_CLIENT_ID.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
  SHEET_ID: 'REEMPLAZA_CON_TU_SHEET_ID', // hoja con pestaña "Expedientes"
  SHEET_RANGE: 'Expedientes!A:G' // columnas: id,codigo,nombre,asunto,fecha,notas,folderId
};

/* Estado runtime */
let tokenClient = null;
let accessToken = null;
let userProfile = null;

/* Elementos DOM */
const btnSign = document.getElementById('btnSign');
const btnSignOut = document.getElementById('btnSignOut');
const userInfo = document.getElementById('userInfo');
const btnAdd = document.getElementById('btnAdd');
const btnExport = document.getElementById('btnExport');
const tableBody = document.getElementById('tableBody');
const search = document.getElementById('search');

const form = document.getElementById('formExpediente');
const adjInput = document.getElementById('adjuntos');
const adjList = document.getElementById('adjList');

let pendingFiles = []; // archivos a subir (File objects)
let expedientesCache = []; // cache de filas leídas desde Sheet

/* ---------- Inicializar Google Identity Services token client ---------- */
function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('token error', tokenResponse);
        alert('Error al obtener token: ' + tokenResponse.error);
        return;
      }
      accessToken = tokenResponse.access_token;
      afterSignIn();
    },
  });
}

/* ---------- UI: Sign in / out ---------- */
btnSign.onclick = () => {
  if (!tokenClient) initAuth();
  // requestAccessToken triggers popup
  tokenClient.requestAccessToken();
};

btnSignOut.onclick = () => {
  accessToken = null;
  userProfile = null;
  expedientesCache = [];
  updateUIForSignOut();
};

/* ---------- After signin: get basic profile (optional) ---------- */
async function afterSignIn() {
  // get basic profile info via people? easier: use token to get tokeninfo endpoint
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) throw new Error('No userinfo');
    userProfile = await res.json();
  } catch (err) {
    console.warn('No se pudo obtener userinfo', err);
    userProfile = null;
  }
  updateUIForSignIn();
  await loadExpedientesFromSheet();
}

/* ---------- UI updates ---------- */
function updateUIForSignIn() {
  btnSign.classList.add('d-none');
  btnSignOut.classList.remove('d-none');
  btnAdd.disabled = false;
  btnExport.disabled = false;
  userInfo.textContent = userProfile ? `Conectado: ${userProfile.name} (${userProfile.email})` : 'Conectado';
}

function updateUIForSignOut() {
  btnSign.classList.remove('d-none');
  btnSignOut.classList.add('d-none');
  btnAdd.disabled = true;
  btnExport.disabled = true;
  userInfo.textContent = 'No conectado.';
  tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Conéctate con Google para ver expedientes.</td></tr>';
}

/* ---------- Sheets helpers (append, read) ---------- */
async function appendRowToSheet(values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_RANGE)}:append?valueInputOption=RAW`;
  const body = { values: [values] };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Error appending to sheet: ' + res.status + ' ' + txt);
  }
  return res.json();
}

async function readSheetValues() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_RANGE)}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Error reading sheet: ' + res.status + ' ' + txt);
  }
  const data = await res.json();
  return data.values || [];
}

/* ---------- Drive helpers ---------- */
async function createFolder(name, parentId = null) {
  const metadata = { name: name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  if (!res.ok) throw new Error('Error creando carpeta: ' + await res.text());
  return res.json(); // includes id
}

async function uploadFileToFolder(file, folderId) {
  // multipart upload: metadata + file
  const metadata = { name: file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken },
    body: form
  });
  if (!res.ok) throw new Error('Error subiendo archivo: ' + await res.text());
  return res.json();
}

/* ---------- Expedientes logic ---------- */
function generateId() {
  return 'EXP-' + Date.now();
}

async function createExpediente({ codigo, nombre, asunto, fecha, notas, files }) {
  // 1) crear carpeta en Drive
  const expId = generateId();
  const folder = await createFolder(`${codigo}_${expId}`);
  const folderId = folder.id;

  // 2) subir archivos (si hay)
  const uploaded = [];
  for (const f of files || []) {
    const up = await uploadFileToFolder(f, folderId);
    uploaded.push(up);
  }

  // 3) guardar fila en Sheet: id,codigo,nombre,asunto,fecha,notas,folderId
  const row = [expId, codigo, nombre, asunto, fecha, notas || '', folderId];
  await appendRowToSheet(row);

  return { expId, folderId, uploaded };
}

async function loadExpedientesFromSheet() {
  try {
    const rows = await readSheetValues();
    // map rows to objects (skip empty header rows)
    expedientesCache = rows.map(r => ({
      id: r[0] || '',
      codigo: r[1] || '',
      nombre: r[2] || '',
      asunto: r[3] || '',
      fecha: r[4] || '',
      notas: r[5] || '',
      folderId: r[6] || ''
    })).filter(x => x.id); // keep only those with id
    renderTable(expedientesCache);
  } catch (err) {
    console.error(err);
    alert('Error al leer Sheet: ' + err.message);
  }
}

/* ---------- Render table ---------- */
function renderTable(items) {
  const q = (search.value || '').toLowerCase();
  const list = items.filter(it => {
    if (!q) return true;
    return (it.codigo||'').toLowerCase().includes(q) || (it.nombre||'').toLowerCase().includes(q) || (it.asunto||'').toLowerCase().includes(q);
  }).sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));

  if (!list.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay expedientes.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  list.forEach(it => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(it.codigo)}</td>
      <td>${escapeHtml(it.nombre)}</td>
      <td>${escapeHtml(it.asunto)}</td>
      <td>${escapeHtml(it.fecha)}</td>
      <td>${it.folderId ? '<a href="https://drive.google.com/drive/folders/' + it.folderId + '" target="_blank">Abrir</a>' : ''}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-list" data-id="${it.id}">Ver archivos</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll('.btn-list').forEach(btn => btn.onclick = async (e) => {
    const id = e.target.dataset.id;
    const exp = expedientesCache.find(x=>x.id===id);
    if (!exp) return alert('No encontrado');
    // abrir carpeta en Drive
    window.open(`https://drive.google.com/drive/folders/${exp.folderId}`, '_blank');
  });
}

/* ---------- Form handling ---------- */
adjInput.onchange = () => {
  pendingFiles = Array.from(adjInput.files || []);
  renderAdjSummary();
};

function renderAdjSummary() {
  if (!pendingFiles.length) {
    adjList.innerHTML = '<small class="text-muted">Sin archivos seleccionados.</small>';
    return;
  }
  adjList.innerHTML = pendingFiles.map(f => `<div class="d-flex gap-2 align-items-center"><div style="flex:1">${escapeHtml(f.name)} <small class="text-muted">(${f.size} bytes)</small></div></div>`).join('');
}

form.onsubmit = async (e) => {
  e.preventDefault();
  if (!accessToken) return alert('Conéctate con Google primero.');

  const payload = {
    codigo: document.getElementById('codigo').value.trim(),
    nombre: document.getElementById('nombre').value.trim(),
    asunto: document.getElementById('asunto').value.trim(),
    fecha: document.getElementById('fecha').value,
    notas: document.getElementById('notas').value.trim(),
    files: pendingFiles.slice()
  };

  try {
    const res = await createExpediente(payload);
    alert('Expediente creado. Carpeta: ' + res.folderId);
    // limpiar formulario
    form.reset();
    pendingFiles = [];
    renderAdjSummary();
    // recargar expedientes desde Sheet
    await loadExpedientesFromSheet();
    // cerrar modal
    const modalEl = document.querySelector('#modalForm');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  } catch (err) {
    console.error(err);
    alert('Error creando expediente: ' + err.message);
  }
};

/* ---------- Export (descarga JSON de sheet data) ---------- */
btnExport.onclick = async () => {
  if (!accessToken) return alert('Conéctate con Google primero.');
  try {
    const rows = await readSheetValues();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expedientes_sheet_export_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error exportando: ' + err.message);
  }
};

/* ---------- Utility ---------- */
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ---------- Init ---------- */
window.onload = () => {
  initAuth();
  updateUIForSignOut();
};
