import {
  createAccount,
  ensureAccountsStore,
  listAccounts,
  setActiveAccount,
  type AccountSummary,
} from './player-collection';

export const AUTH_CREDENTIALS_KEY = 'arknight_auth_v1';
export const AUTH_SESSION_KEY = 'arknight_auth_session_v1';

interface CredentialRecord {
  readonly salt: string;
  readonly hash: string;
  readonly updatedAt: number;
}

interface CredentialStore {
  readonly version: 1;
  readonly users: Readonly<Record<string, CredentialRecord>>;
}

export interface AuthSession {
  readonly username: string;
  readonly authenticatedAt: number;
}

const memoryKv = new Map<string, string>();
const authListeners = new Set<() => void>();

function kvGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {
    // 降级内存存储
  }
  return memoryKv.get(key) ?? null;
}

function kvSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      memoryKv.delete(key);
      return;
    }
  } catch {
    // 降级内存存储
  }
  memoryKv.set(key, value);
}

function kvRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    // ignore
  }
  memoryKv.delete(key);
}

function notifyAuthListeners(): void {
  for (const listener of authListeners) listener();
}

/** 同步加盐摘要（避免外部依赖与 HTTPS-only WebCrypto 限制）。 */
function hashPassword(password: string, salt: string): string {
  const input = `PRTS::${salt}::${password}::RHODES`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let round = 0; round < 32; round += 1) {
    for (let i = 0; i < input.length; i += 1) {
      const code = input.charCodeAt(i);
      h1 ^= code + round;
      h1 = Math.imul(h1, 0x01000193);
      h2 = Math.imul(h2 ^ ((code << 5) - code + round), 0x85ebca6b);
      h1 ^= h2 >>> 13;
      h2 ^= h1 >>> 15;
    }
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function generateSalt(): string {
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${Date.now().toString(36)}-${rand}`;
}

function readCredentialStore(): CredentialStore {
  const raw = kvGet(AUTH_CREDENTIALS_KEY);
  if (!raw) return { version: 1, users: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<CredentialStore> | null;
    if (parsed && parsed.version === 1 && parsed.users && typeof parsed.users === 'object') {
      return { version: 1, users: parsed.users };
    }
  } catch {
    // 忽略损坏凭证文件
  }
  return { version: 1, users: {} };
}

function writeCredentialStore(store: CredentialStore): void {
  kvSet(AUTH_CREDENTIALS_KEY, JSON.stringify(store));
}

function setSession(username: string): void {
  const session: AuthSession = { username, authenticatedAt: Date.now() };
  kvSet(AUTH_SESSION_KEY, JSON.stringify(session));
  notifyAuthListeners();
}

export function getAuthSession(): AuthSession | null {
  const raw = kvGet(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession> | null;
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      parsed.username.trim().length > 0 &&
      typeof parsed.authenticatedAt === 'number'
    ) {
      const store = ensureAccountsStore();
      if (parsed.username in store.accounts) {
        return { username: parsed.username, authenticatedAt: parsed.authenticatedAt };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getAuthSession() !== null;
}

export function hasAccountPassword(username: string): boolean {
  const trimmed = username.trim();
  if (!trimmed) return false;
  const creds = readCredentialStore();
  return Boolean(creds.users[trimmed]);
}

export function listLoginableAccounts(): readonly (AccountSummary & { readonly hasPassword: boolean })[] {
  const creds = readCredentialStore();
  return listAccounts().map((account) => ({
    ...account,
    hasPassword: Boolean(creds.users[account.name]),
  }));
}

export function registerAccount(
  username: string,
  password: string,
  confirmPassword: string,
): { readonly ok: boolean; readonly error?: string } {
  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: '请输入指挥官代号（账户名）。' };
  if (trimmed.length > 24) return { ok: false, error: '账户名长度不能超过 24 个字符。' };
  if (password.length < 4) return { ok: false, error: '登录密码至少需要 4 位字符。' };
  if (password !== confirmPassword) return { ok: false, error: '两次输入的密码不一致。' };

  const created = createAccount(trimmed);
  if (!created.ok) {
    return { ok: false, error: created.error ?? '创建账户失败。' };
  }

  const creds = readCredentialStore();
  const salt = generateSalt();
  writeCredentialStore({
    version: 1,
    users: {
      ...creds.users,
      [trimmed]: {
        salt,
        hash: hashPassword(password, salt),
        updatedAt: Date.now(),
      },
    },
  });

  setSession(trimmed);
  return { ok: true };
}

export function loginAccount(
  username: string,
  password: string,
): { readonly ok: boolean; readonly error?: string; readonly boundPassword?: boolean } {
  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: '请输入指挥官账户名。' };

  const accountsStore = ensureAccountsStore();
  if (!(trimmed in accountsStore.accounts)) {
    return { ok: false, error: `账户「${trimmed}」尚未注册，请先切换至「注册档案」创建。` };
  }

  const creds = readCredentialStore();
  const record = creds.users[trimmed];

  if (record) {
    if (!password) return { ok: false, error: '请输入登录密码。' };
    if (hashPassword(password, record.salt) !== record.hash) {
      return { ok: false, error: '账户名或密码校验失败，请重试。' };
    }
    setActiveAccount(trimmed);
    setSession(trimmed);
    return { ok: true };
  }

  // 既有免密本地账户首次输入密码登录时自动绑定密码
  if (password.length > 0 && password.length < 4) {
    return { ok: false, error: '首次为该本地账户设置密码时，长度需至少 4 位。' };
  }

  let boundPassword = false;
  if (password.length >= 4) {
    const salt = generateSalt();
    writeCredentialStore({
      version: 1,
      users: {
        ...creds.users,
        [trimmed]: {
          salt,
          hash: hashPassword(password, salt),
          updatedAt: Date.now(),
        },
      },
    });
    boundPassword = true;
  }

  setActiveAccount(trimmed);
  setSession(trimmed);
  return { ok: true, boundPassword };
}

export function quickLoginAccount(username: string): { readonly ok: boolean; readonly error?: string } {
  const trimmed = username.trim();
  const accountsStore = ensureAccountsStore();
  if (!(trimmed in accountsStore.accounts)) {
    return { ok: false, error: `账户「${trimmed}」不存在。` };
  }
  if (hasAccountPassword(trimmed)) {
    return { ok: false, error: `账户「${trimmed}」已设置密码，请使用密码登录。` };
  }
  setActiveAccount(trimmed);
  setSession(trimmed);
  return { ok: true };
}

export function logoutAccount(): void {
  kvRemove(AUTH_SESSION_KEY);
  notifyAuthListeners();
}

export function subscribeAuthSession(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}
