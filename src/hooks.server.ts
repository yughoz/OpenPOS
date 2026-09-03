import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, getUser } from '$lib/server/auth';
import type { AuthUser } from '$lib/server/auth';

const PUBLIC_ROUTES = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	return paraglideMiddleware(event.request, async ({ locale }) => {
		const path = event.url.pathname;

		const token = event.cookies.get(SESSION_COOKIE);
		let user: AuthUser | null = null;
		if (token) {
			user = await getUser(token);
		}
		event.locals.user = user;
		event.locals.token = token ?? null;

		if (!PUBLIC_ROUTES.includes(path) && !user) {
			redirect(302, `/login?redirect=${encodeURIComponent(path)}`);
		}

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('<html lang="id">', `<html lang="${locale}">`)
		});
	});
};
