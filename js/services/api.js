const DEFAULT_DATA_API_BASE = 'https://higienixservicios.com';
const DEFAULT_CONTROL_API_BASE = `${location.protocol}//${location.host}`;

function sanitizeBaseUrl(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  return raw.replace(/\/+$/, '');
}

function readQueryParam(name) {
  try {
    const parsed = new URL(window.location.href);
    return parsed.searchParams.get(name);
  } catch (_) {
    return null;
  }
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

function resolveInitialBases() {
  const queryData = readQueryParam('dataApi');
  const queryControl = readQueryParam('controlApi');
  const storedData = readStorage('worker.front.dataApiBase');
  const storedControl = readStorage('worker.front.controlApiBase');

  const dataApiBase = sanitizeBaseUrl(queryData || storedData, DEFAULT_DATA_API_BASE);
  const controlApiBase = sanitizeBaseUrl(queryControl || storedControl, DEFAULT_CONTROL_API_BASE);

  return { dataApiBase, controlApiBase };
}

const state = resolveInitialBases();

export function getApiBases() {
  return {
    dataApiBase: state.dataApiBase,
    controlApiBase: state.controlApiBase
  };
}

export function setApiBases({ dataApiBase, controlApiBase }) {
  if (dataApiBase) {
    state.dataApiBase = sanitizeBaseUrl(dataApiBase, state.dataApiBase);
    writeStorage('worker.front.dataApiBase', state.dataApiBase);
  }

  if (controlApiBase) {
    state.controlApiBase = sanitizeBaseUrl(controlApiBase, state.controlApiBase);
    writeStorage('worker.front.controlApiBase', state.controlApiBase);
  }

  return getApiBases();
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

export function api(path, options = {}) {
  return request(state.dataApiBase, path, options);
}

export function localApi(path, options = {}) {
  return request(state.controlApiBase, path, options);
}
