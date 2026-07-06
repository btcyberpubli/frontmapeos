import { localApi } from '../services/api.js';

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function setModeVisual(scope, enabled, dom) {
  const btn = dom.modeButtons?.[scope];
  const state = dom.modeStates?.[scope];
  if (!btn || !state) {
    return;
  }

  btn.dataset.enabled = enabled ? '1' : '0';
  btn.textContent = enabled ? 'Encendido' : 'Apagado';
  btn.classList.remove('mode-on', 'mode-off');
  btn.classList.add(enabled ? 'mode-on' : 'mode-off');
  state.textContent = enabled ? 'Modo activo' : 'Modo detenido';
}

export function fillRuntimeConfigForm(runtimeConfig, dom) {
  const profiles = runtimeConfig?.profiles || {};
  const execution = runtimeConfig?.execution || {};
  const users = Array.isArray(runtimeConfig?.users) ? runtimeConfig.users : [];

  dom.profileTodosIdEl.value = String(profiles.todos?.profileId || '');
  dom.profileCerradosIdEl.value = String(profiles.cerrados?.profileId || '');
  dom.profileUsuariosIdEl.value = String(profiles.usuarios?.profileId || '');

  setModeVisual('todos', profiles.todos?.enabled !== false, dom);
  setModeVisual('cerrados', profiles.cerrados?.enabled !== false, dom);
  setModeVisual('usuarios', profiles.usuarios?.enabled !== false, dom);

  dom.executionModeEl.value = execution.mode === 'sequential' ? 'sequential' : 'parallel';
  dom.maxConcurrencyPerProfileEl.value = String(execution.maxConcurrencyPerProfile || 3);
  dom.maxUsersPerPassEl.value = String(execution.maxUsersPerPass || 5);

  dom.usersListEl.value = users.map((item) => item.name).filter(Boolean).join('\n');
}

export function collectRuntimeConfigFromForm(dom) {
  const users = String(dom.usersListEl.value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, enabled: true }));

  const isEnabled = (scope) => dom.modeButtons?.[scope]?.dataset?.enabled !== '0';

  return {
    execution: {
      mode: dom.executionModeEl.value === 'sequential' ? 'sequential' : 'parallel',
      maxConcurrencyPerProfile: parsePositiveInt(dom.maxConcurrencyPerProfileEl.value, 3),
      maxUsersPerPass: parsePositiveInt(dom.maxUsersPerPassEl.value, 5)
    },
    profiles: {
      todos: {
        enabled: isEnabled('todos'),
        profileId: onlyDigits(dom.profileTodosIdEl.value),
        label: 'TODOS'
      },
      cerrados: {
        enabled: isEnabled('cerrados'),
        profileId: onlyDigits(dom.profileCerradosIdEl.value),
        label: 'CERRADOS'
      },
      usuarios: {
        enabled: isEnabled('usuarios'),
        profileId: onlyDigits(dom.profileUsuariosIdEl.value),
        label: 'USUARIOS'
      }
    },
    users
  };
}

export async function loadRuntimeConfig(dom, setStatus) {
  try {
    const data = await localApi('/api/runtime-config');
    fillRuntimeConfigForm(data.runtimeConfig || {}, dom);
    return data.runtimeConfig || {};
  } catch (error) {
    setStatus(`No se pudo cargar configuracion local: ${error.message}`, 'err');
    return null;
  }
}

export async function saveRuntimeConfig(dom, setStatus) {
  try {
    const payload = collectRuntimeConfigFromForm(dom);

    if (!payload.profiles.todos.profileId || !payload.profiles.cerrados.profileId || !payload.profiles.usuarios.profileId) {
      setStatus('Debes definir los 3 IDs de perfil (TODOS, CERRADOS y USUARIOS).', 'err');
      return null;
    }

    const data = await localApi('/api/runtime-config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    fillRuntimeConfigForm(data.runtimeConfig || payload, dom);
    setStatus('Configuracion local guardada correctamente.', 'ok');
    return data.runtimeConfig || payload;
  } catch (error) {
    setStatus(`Error guardando configuracion: ${error.message}`, 'err');
    return null;
  }
}

export function toggleMode(scope, dom) {
  const btn = dom.modeButtons?.[scope];
  if (!btn) {
    return;
  }

  const currentlyEnabled = btn.dataset.enabled !== '0';
  setModeVisual(scope, !currentlyEnabled, dom);
}
