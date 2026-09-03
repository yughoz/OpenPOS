import { redirect } from '@sveltejs/kit';
import { verifyAuth, getUser, updateProfile, authenticate, setSessionCookie, SESSION_COOKIE } from '$lib/server/auth';

export const load = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (!token || !verifyAuth(token)) redirect(302, '/login?redirect=/profile');
	const user = await getUser(token);
	if (!user) redirect(302, '/login?redirect=/profile');
	return { user };
};

export const actions = {
	default: async ({ request, cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (!token || !verifyAuth(token)) redirect(302, '/login?redirect=/profile');

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const email = formData.get('email')?.toString().trim();
		const newPassword = formData.get('newPassword')?.toString();
		const currentPassword = formData.get('currentPassword')?.toString();

		const updates: { name?: string; email?: string; password?: string } = {};
		if (name) updates.name = name;
		if (email) updates.email = email;
		if (newPassword) updates.password = newPassword;

		// If changing email or password, require current password verification
		if (updates.email || updates.password) {
			if (!currentPassword) {
				return { success: false, error: 'Masukkan password saat ini untuk mengubah email/password' };
			}
			const currentUser = await getUser(token);
			if (!currentUser) redirect(302, '/login?redirect=/profile');
			const reauth = await authenticate(currentUser.email, currentPassword);
			if (!reauth) {
				return { success: false, error: 'Password saat ini salah' };
			}
		}

		const ok = await updateProfile(token, updates);
		if (!ok) {
			return { success: false, error: 'Gagal menyimpan perubahan' };
		}

		// Re-auth to get fresh token with updated data
		const finalEmail = email ?? (await getUser(token))!.email;
		const finalPassword = newPassword ?? currentPassword;
		if (finalPassword) {
			const fresh = await authenticate(finalEmail, finalPassword);
			if (fresh) setSessionCookie(cookies, fresh.token);
		}

		return { success: true };
	}
};
