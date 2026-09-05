import { fail, redirect, type Actions } from '@sveltejs/kit';
import { authenticate, setSessionCookie } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim();
		const password = formData.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Email dan password wajib diisi' });
		}

		const result = await authenticate(email, password);
		if (!result) {
			return fail(401, { error: 'Email atau password salah' });
		}

		setSessionCookie(cookies, result.token, request.url);

		const redirectTo = url.searchParams.get('redirect') ?? '/';
		redirect(302, redirectTo);
	}
};
