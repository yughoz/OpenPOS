import { redirect } from '@sveltejs/kit';
import type { AuthUser } from '$lib/server/auth';

/** Halaman ini butuh login (role apa pun). Redirect ke /login kalau belum. */
export function requireUser(user: AuthUser | null, path = '/app'): AuthUser {
	if (!user) redirect(302, `/login?redirect=${encodeURIComponent(path)}`);
	return user;
}

/** Halaman ini khusus admin. Kasir dilempar balik ke /app. */
export function requireAdmin(user: AuthUser | null, path = '/app'): AuthUser {
	const u = requireUser(user, path);
	if (u.role !== 'admin') redirect(302, '/app');
	return u;
}
