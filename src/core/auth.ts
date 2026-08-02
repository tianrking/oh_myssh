export type BrowserAuthState = 'authenticated' | 'required' | 'unavailable';

async function readJson(response: Response): Promise<{ authenticated?: boolean; error?: string }> {
  try {
    return await response.json() as { authenticated?: boolean; error?: string };
  } catch {
    return {};
  }
}

/**
 * The production Worker owns the login session. Static mirrors that do not expose
 * the auth API are deliberately reported as unavailable instead of pretending the
 * relay is configured.
 */
export async function getBrowserAuthState(): Promise<BrowserAuthState> {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const body = await readJson(response);
    if (response.ok && typeof body.authenticated === 'boolean') {
      return body.authenticated ? 'authenticated' : 'required';
    }
    return response.status === 401 || response.status === 403 ? 'required' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function loginWithPassword(password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const body = await readJson(response);
    if (response.ok && body.authenticated === true) return { ok: true };
    return { ok: false, message: body.error || '登录失败，请检查密码后重试。' };
  } catch {
    return { ok: false, message: '无法连接 Worker 登录服务，请检查网络后重试。' };
  }
}

export async function logoutBrowserSession(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'include',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  }).catch(() => undefined);
}
