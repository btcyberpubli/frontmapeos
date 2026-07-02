const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');
const totalEl = document.getElementById('totalCount');
const updatedEl = document.getElementById('updatedAt');

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3067'
  : 'https://higienixservicios.com';

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`.trim();
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function buildCard(item, index) {
  const card = document.createElement('div');
  card.className = 'card';
  const pendingUrl = String(item.url || '');
  const panelName = String(item.panel || 'Sin panel');
  const baseCode = String(item.nomenclaturaBase || '-');
  const origin = String(item.origen || 'extension');
  const attempts = Number(item.attempts || 0);
  const detectedAt = item.detectedAt || item.updatedAt || null;

  card.innerHTML = `
    <div class="card-head">
      <span class="pill">#${index + 1}</span>
      <span class="badge">${escapeHtml(origin)}</span>
      <span class="time">${escapeHtml(formatDate(detectedAt))}</span>
    </div>
    <div class="meta">
      <span>Panel: ${escapeHtml(panelName)}</span>
      <span>Base: ${escapeHtml(baseCode)}</span>
      <span>Intentos: ${attempts}</span>
    </div>
    <div class="url">${escapeHtml(pendingUrl)}</div>
    <div class="row">
      <input type="text" maxlength="1" placeholder="Letra" value="" />
      <button class="btn primary">Guardar letra</button>
      <button class="btn">Solo mapear</button>
      <button class="btn danger">Eliminar</button>
    </div>
  `;

  const input = card.querySelector('input');
  const assignAndCompleteBtn = card.querySelectorAll('button')[0];
  const assignOnlyBtn = card.querySelectorAll('button')[1];
  const deleteBtn = card.querySelectorAll('button')[2];

  const submit = async (markAsDone) => {
    const letra = String(input.value || '').trim().toUpperCase();
    if (!letra) {
      setStatus('Debes ingresar una letra.', 'err');
      input.focus();
      return;
    }

    try {
      assignAndCompleteBtn.disabled = true;
      assignOnlyBtn.disabled = true;

      await api('/pendientes/asignar', {
        method: 'POST',
        body: JSON.stringify({
          url: pendingUrl,
          letra,
          panel: panelName,
          nomenclaturaBase: baseCode,
          origen: origin,
          marcarCompletada: markAsDone
        })
      });

      setStatus(
        markAsDone
          ? `Guardado y quitado de pendientes: ${pendingUrl}`
          : `Mapeo guardado para ${pendingUrl}`,
        'ok'
      );

      await loadPendientes();
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'err');
      assignAndCompleteBtn.disabled = false;
      assignOnlyBtn.disabled = false;
    }
  };

  const removePending = async () => {
    try {
      deleteBtn.disabled = true;
      input.disabled = true;

      await api(`/pendientes/${encodeURIComponent(pendingUrl)}`, {
        method: 'DELETE'
      });

      setStatus(`Pendiente eliminado: ${pendingUrl}`, 'ok');
      await loadPendientes();
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'err');
      deleteBtn.disabled = false;
      input.disabled = false;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submit(true);
    }
  });

  assignAndCompleteBtn.addEventListener('click', () => submit(true));
  assignOnlyBtn.addEventListener('click', () => submit(false));
  deleteBtn.addEventListener('click', removePending);

  return card;
}

async function loadPendientes() {
  try {
    setStatus('Cargando panel de nomenclatura...');
    listEl.innerHTML = '';

    const data = await api('/pendientes');
    const pendientes = Array.isArray(data.pendientes) ? data.pendientes : [];

    if (totalEl) totalEl.textContent = String(pendientes.length);
    if (updatedEl) updatedEl.textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

    if (pendientes.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <strong>No hay pendientes ahora.</strong>
          <div>La extensión puede seguir reportando URLs sin letra y aparecerán acá.</div>
        </div>
      `;
      setStatus('Sin pendientes.', 'ok');
      return;
    }

    pendientes.forEach((item, index) => {
      listEl.appendChild(buildCard(item, index));
    });

    setStatus(`Pendientes activos: ${pendientes.length}`);
  } catch (error) {
    listEl.innerHTML = '';
    if (totalEl) totalEl.textContent = '0';
    setStatus(`No se pudo cargar el panel: ${error.message}`, 'err');
  }
}

refreshBtn.addEventListener('click', loadPendientes);
loadPendientes();
