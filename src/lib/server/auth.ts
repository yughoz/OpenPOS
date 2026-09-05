import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'openpos_session';

export const PB_URL: string = env.POCKETBASE_URL ?? env.AUTH_POCKETBASE_URL ?? 'http://127.0.0.1:8094';

export type UserRole = 'admin' | 'kasir';

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	role: UserRole;
}

export async function authenticate(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
	try {
		const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ identity: email, password })
		});
		if (!res.ok) return null;
		const data = await res.json();
		return {
			token: data.token,
			user: {
				id: data.record.id,
				email: data.record.email,
				name: data.record.name ?? data.record.email,
				role: (data.record.role ?? 'kasir') as UserRole
			}
		};
	} catch {
		return null;
	}
}

export function verifyAuth(token: string): boolean {
	if (!token) return false;
	const parts = token.split('.');
	if (parts.length !== 3) return false;
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
		return payload.exp * 1000 > Date.now();
	} catch {
		return false;
	}
}

export async function getUser(token: string): Promise<AuthUser | null> {
	if (!verifyAuth(token)) return null;
	try {
		const res = await fetch(`${PB_URL}/api/collections/users/auth-refresh`, {
			method: 'POST',
			headers: { Authorization: token, 'content-type': 'application/json' },
			body: '{}'
		});
		if (!res.ok) return null;
		const data = await res.json();
		return {
			id: data.record.id,
			email: data.record.email,
			name: data.record.name ?? data.record.email,
			role: (data.record.role ?? 'kasir') as UserRole
		};
	} catch {
		return null;
	}
}

export function setSessionCookie(cookies: Cookies, token: string, requestUrl?: string) {
	// Cookie Secure ditolak browser saat diakses via http:// — ikuti protokol
	// request supaya tetap jalan lokal (deploy NekoApps tanpa TLS).
	const isHttps = requestUrl ? requestUrl.startsWith('https') : !dev;
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: isHttps,
		maxAge: 60 * 60 * 24 * 7 // 7 days
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function updateProfile(
	token: string,
	updates: { name?: string; email?: string; password?: string }
): Promise<boolean> {
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
		const res = await fetch(`${PB_URL}/api/collections/users/records/${payload.id}`, {
			method: 'PATCH',
			headers: {
				'content-type': 'application/json',
				Authorization: token
			},
			body: JSON.stringify(updates)
		});
		return res.ok;
	} catch {
		return false;
	}
}
