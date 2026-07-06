import { createPendientesController } from './features/pendientes.js';
import { getApiBases, localApi, setApiBases } from './services/api.js';
import {
  loadRuntimeConfig,
  saveRuntimeConfig,
  toggleMode
} from './features/runtimeConfig.js';

function getDom() {
  return {
    listEl: document.getElementById('list'),
    statusEl: document.getElementById('status'),
    refreshBtn: document.getElementById('refreshBtn'),
    totalEl: document.getElementById('totalCount'),
    updatedEl: document.getElementById('updatedAt'),
    panelCountEl: document.getElementById('panelCount'),
    panelsListEl: document.getElementById('panelsList'),

    saveConfigBtn: document.getElementById('saveConfigBtn'),
    reloadConfigBtn: document.getElementById('reloadConfigBtn'),
    saveApiBaseBtn: document.getElementById('saveApiBaseBtn'),
    dataApiBaseEl: document.getElementById('dataApiBase'),
    controlApiBaseEl: document.getElementById('controlApiBase'),
    apiConnectionStatusEl: document.getElementById('apiConnectionStatus'),

    profileTodosIdEl: document.getElementById('profileTodosId'),
    profileCerradosIdEl: document.getElementById('profileCerradosId'),
    profileUsuariosIdEl: document.getElementById('profileUsuariosId'),
    executionModeEl: document.getElementById('executionMode'),
    maxConcurrencyPerProfileEl: document.getElementById('maxConcurrencyPerProfile'),
    maxUsersPerPassEl: document.getElementById('maxUsersPerPass'),
    usersListEl: document.getElementById('usersList'),

    modeButtons: {
      todos: document.getElementById('modeTodosBtn'),
      cerrados: document.getElementById('modeCerradosBtn'),
      usuarios: document.getElementById('modeUsuariosBtn')
    },
    modeStates: {
      todos: document.getElementById('modeTodosState'),
      cerrados: document.getElementById('modeCerradosState'),
      usuarios: document.getElementById('modeUsuariosState')
    }
  };
}

function fillApiBaseForm(dom) {
  const bases = getApiBases();
  dom.dataApiBaseEl.value = bases.dataApiBase;
  dom.controlApiBaseEl.value = bases.controlApiBase;
}

async function saveApiBaseForm(dom, setStatus) {
  const dataApiBase = String(dom.dataApiBaseEl.value || '').trim();
  const controlApiBase = String(dom.controlApiBaseEl.value || '').trim();

  setApiBases({ dataApiBase, controlApiBase });
  if (dom.apiConnectionStatusEl) {
    dom.apiConnectionStatusEl.textContent = 'Guardado. Validando...';
  }

  try {
    await localApi('/api/modes/status');
    if (dom.apiConnectionStatusEl) {
      dom.apiConnectionStatusEl.textContent = 'Control API OK';
    }
    setStatus('URLs de API guardadas correctamente.', 'ok');
  } catch (error) {
    if (dom.apiConnectionStatusEl) {
      dom.apiConnectionStatusEl.textContent = `Control API error: ${error.message}`;
    }
    setStatus(`APIs guardadas, pero control API no responde: ${error.message}`, 'err');
  }
}

function setStatusFactory(statusEl) {
  return (text, type = '') => {
    statusEl.textContent = text;
    statusEl.className = `status ${type}`.trim();
  };
}

function setProcessStatus(dom, scope, processInfo) {
  const stateEl = dom.modeStates?.[scope];
  if (!stateEl) {
    return;
  }

  const currentlyEnabled = dom.modeButtons?.[scope]?.dataset?.enabled !== '0';
  const modeText = currentlyEnabled ? 'Modo activo' : 'Modo detenido';

  if (processInfo?.running) {
    const pidText = processInfo.pid ? `PID ${processInfo.pid}` : 'PID n/a';
    stateEl.textContent = `${modeText} · Proceso ON (${pidText})`;
    return;
  }

  stateEl.textContent = `${modeText} · Proceso OFF`;
}

async function refreshProcessStatuses(dom, setStatus) {
  try {
    const response = await localApi('/api/modes/status');
    const modes = Array.isArray(response.modes) ? response.modes : [];
    modes.forEach((mode) => setProcessStatus(dom, mode.scope, mode));
  } catch (error) {
    setStatus(`No se pudo consultar estado de procesos: ${error.message}`, 'err');
  }
}

async function boot() {
  const dom = getDom();
  const setStatus = setStatusFactory(dom.statusEl);
  const pendientes = createPendientesController(dom, setStatus);

  document.addEventListener('visibilitychange', () => {
    pendientes.startAutoRefresh();
    if (!document.hidden) {
      pendientes.loadPendientes({ silent: true, source: 'focus' });
    }
  });

  window.addEventListener('online', () => {
    pendientes.loadPendientes({ source: 'online' });
  });

  dom.refreshBtn.addEventListener('click', () => {
    pendientes.loadPendientes({ source: 'manual', forceRender: true });
  });

  dom.saveConfigBtn.addEventListener('click', () => {
    saveRuntimeConfig(dom, setStatus);
  });

  dom.reloadConfigBtn.addEventListener('click', () => {
    loadRuntimeConfig(dom, setStatus);
  });

  if (dom.saveApiBaseBtn) {
    dom.saveApiBaseBtn.addEventListener('click', async () => {
      await saveApiBaseForm(dom, setStatus);
      await pendientes.loadPendientes({ source: 'manual', forceRender: true });
      await refreshProcessStatuses(dom, setStatus);
    });
  }

  Object.entries(dom.modeButtons).forEach(([scope, button]) => {
    if (!button) {
      return;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        toggleMode(scope, dom);
        const runtime = await saveRuntimeConfig(dom, setStatus);
        if (!runtime) {
          await loadRuntimeConfig(dom, setStatus);
          return;
        }

        const enabled = dom.modeButtons?.[scope]?.dataset?.enabled !== '0';
        if (enabled) {
          const result = await localApi(`/api/modes/${scope}/start`, { method: 'POST' });
          const mode = result?.status || { running: false };
          setProcessStatus(dom, scope, mode);
          setStatus(`Modo ${scope.toUpperCase()} iniciado.`, 'ok');
        } else {
          const result = await localApi(`/api/modes/${scope}/stop`, { method: 'POST' });
          const mode = result?.status || { running: false };
          setProcessStatus(dom, scope, mode);
          setStatus(`Modo ${scope.toUpperCase()} detenido.`, 'ok');
        }
      } catch (error) {
        await loadRuntimeConfig(dom, setStatus);
        setStatus(`No se pudo cambiar modo ${scope}: ${error.message}`, 'err');
      } finally {
        button.disabled = false;
      }
    });
  });

  await pendientes.loadPendientes({ source: 'initial', forceRender: true });
  fillApiBaseForm(dom);
  await loadRuntimeConfig(dom, setStatus);
  await refreshProcessStatuses(dom, setStatus);
  pendientes.startAutoRefresh();
}

boot();
