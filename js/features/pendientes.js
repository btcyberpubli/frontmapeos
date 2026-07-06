import { api } from '../services/api.js';

const POLL_INTERVAL_ACTIVE_MS = 4000;
const POLL_INTERVAL_HIDDEN_MS = 12000;

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function buildPendientesSnapshot(pendientes) {
  return JSON.stringify(
    pendientes.map((item) => ({
      url: String(item.url || ''),
      panel: String(item.panel || ''),
      letraBase: String(item.nomenclaturaBase || ''),
      status: String(item.status || ''),
      attempts: Number(item.attempts || 0),
      detectedAt: item.detectedAt || null,
      updatedAt: item.updatedAt || null
    }))
  );
}

function extractPanels(pendientes) {
  const counts = new Map();
  pendientes.forEach((item) => {
    const panel = String(item.panel || 'Sin panel').trim() || 'Sin panel';
    counts.set(panel, (counts.get(panel) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function createCard(item, index, controls) {
  const { setStatus, reload } = controls;
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
      <input class="letter-input" type="text" maxlength="1" placeholder="Letra" value="" />
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

      await reload({ source: 'manual', forceRender: true });
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
      await reload({ source: 'manual', forceRender: true });
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'err');
      deleteBtn.disabled = false;
      input.disabled = false;
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submit(true);
    }
  });

  assignAndCompleteBtn.addEventListener('click', () => submit(true));
  assignOnlyBtn.addEventListener('click', () => submit(false));
  deleteBtn.addEventListener('click', removePending);

  return card;
}

export function createPendientesController(dom, setStatus) {
  let pollTimer = null;
  let isLoading = false;
  let lastSnapshot = '';
  let lastKnownUrls = new Set();

  const renderPanels = (panels) => {
    dom.panelsListEl.innerHTML = '';
    dom.panelCountEl.textContent = String(panels.length);

    if (panels.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'mode-state';
      empty.textContent = 'Sin paneles detectados todavia';
      dom.panelsListEl.appendChild(empty);
      return;
    }

    panels.forEach((panel) => {
      const chip = document.createElement('span');
      chip.className = 'panel-chip';
      chip.textContent = `${panel.name} (${panel.count})`;
      dom.panelsListEl.appendChild(chip);
    });
  };

  const countNewUrls = (pendientes) => {
    const currentUrls = new Set(
      pendientes
        .map((item) => String(item.url || '').trim())
        .filter(Boolean)
    );

    let newCount = 0;
    if (lastKnownUrls.size > 0) {
      currentUrls.forEach((url) => {
        if (!lastKnownUrls.has(url)) {
          newCount += 1;
        }
      });
    }

    lastKnownUrls = currentUrls;
    return newCount;
  };

  const renderPendientes = (pendientes) => {
    dom.listEl.innerHTML = '';
    dom.totalEl.textContent = String(pendientes.length);
    dom.updatedEl.textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;

    if (pendientes.length === 0) {
      dom.listEl.innerHTML = `
        <div class="empty">
          <strong>No hay pendientes ahora.</strong>
          <div>Cuando ingresen URLs sin letra aparecerán acá automáticamente.</div>
        </div>
      `;
      return;
    }

    pendientes.forEach((item, index) => {
      dom.listEl.appendChild(createCard(item, index, { setStatus, reload: loadPendientes }));
    });
  };

  async function loadPendientes({ silent = false, source = 'manual', forceRender = false } = {}) {
    if (isLoading) {
      return;
    }

    isLoading = true;
    try {
      if (!silent) {
        setStatus('Cargando pendientes remotos...');
      }

      const data = await api('/pendientes');
      const pendientes = Array.isArray(data.pendientes) ? data.pendientes : [];
      const snapshot = buildPendientesSnapshot(pendientes);
      const changed = snapshot !== lastSnapshot;
      const newCount = changed ? countNewUrls(pendientes) : 0;

      renderPanels(extractPanels(pendientes));

      if (changed || forceRender) {
        renderPendientes(pendientes);
        lastSnapshot = snapshot;
      } else {
        dom.updatedEl.textContent = `Verificado ${new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit'
        })}`;
      }

      if (pendientes.length === 0) {
        setStatus('Sin pendientes.', 'ok');
      } else if (source === 'auto' && newCount > 0) {
        setStatus(`Entraron ${newCount} pendiente(s) nuevos. Total: ${pendientes.length}`, 'ok');
      } else {
        setStatus(`Pendientes activos: ${pendientes.length}`);
      }
    } catch (error) {
      if (!silent) {
        dom.listEl.innerHTML = '';
      }
      dom.totalEl.textContent = '0';
      dom.panelCountEl.textContent = '0';
      setStatus(`No se pudo cargar el panel: ${error.message}`, 'err');
    } finally {
      isLoading = false;
    }
  }

  function startAutoRefresh() {
    if (pollTimer) {
      clearInterval(pollTimer);
    }

    const interval = document.hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_ACTIVE_MS;
    pollTimer = setInterval(() => {
      loadPendientes({ silent: true, source: 'auto' });
    }, interval);
  }

  return {
    loadPendientes,
    startAutoRefresh
  };
}
