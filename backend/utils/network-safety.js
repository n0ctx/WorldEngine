import net from 'node:net';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  return parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254);
}

function isBlockedIpv6(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd');
}

function isBlockedRemoteHostname(hostname) {
  const lowered = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(lowered) || lowered.endsWith('.local')) {
    return true;
  }

  const ipVersion = net.isIP(lowered);
  if (ipVersion === 4) {
    return isPrivateIpv4(lowered);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(lowered);
  }

  return false;
}

export function validateModelFetchBaseUrl(provider, baseUrl) {
  if (!baseUrl) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Base URL 格式不合法');
  }

  const normalized = parsed.toString().replace(/\/+$/, '');
  const hostname = parsed.hostname.toLowerCase();
  const rawHostname = hostname.replace(/^\[|\]$/g, '');

  if (LOCAL_PROVIDERS.has(provider)) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('本地 provider 的 Base URL 只支持 http/https');
    }
    if (!LOCAL_HOSTNAMES.has(rawHostname)) {
      throw new Error('本地 provider 的 Base URL 仅允许 localhost / 127.0.0.1 / ::1');
    }
    return normalized;
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('远程 provider 的 Base URL 必须使用 https');
  }

  if (isBlockedRemoteHostname(rawHostname)) {
    throw new Error('远程 provider 的 Base URL 不允许指向本机或私有网络');
  }

  return normalized;
}
