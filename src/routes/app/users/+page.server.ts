import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { pbAdmin } from '$lib/server/pb';
import { pbErrorMessage } from '$lib/server/crud';
import { logAudit } from '$lib/server/audit';

const PATH = '/app/users';
const TEMP_PASSWORD = 'azkasir123'; // password reset — wajib diganti setelah login

export const load = async ({ locals, url }) => {
	const admin = requireAdmin(locals.user, url.pathname || PATH);
	const pb = await pbAdmin();
	const users = (await pb.collection('users').getFullList({ sort: '-created' })) as any[];

	return {
		rows: users.map((u) => ({
			id: u.id,
			email: u.email,
			name: u.name ?? '',
			role: u.role ?? 'kasir',
			is_active: u.is_active ?? true,
			created: u.created ?? ''
		})),
		meId: admin.id
	};
};

export const actions = {
	create: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user, PATH);
		const f = await request.formData();
		const email = f.get('email')?.toString().trim().toLowerCase() ?? '';
		const name = f.get('name')?.toString().trim() ?? '';
		const role = f.get('role')?.toString() === 'admin' ? 'admin' : 'kasir';
		const password = f.get('password')?.toString() ?? '';

		if (!email.includes('@')) return fail(400, { error: 'Email tidak valid' });
		if (!name) return fail(400, { error: 'Nama wajib diisi' });
		if (password.length < 8) return fail(400, { error: 'Password minimal 8 karakter' });

		try {
			const pb = await pbAdmin();
			const u = await pb.collection('users').create({
				email,
				password,
				passwordConfirm: password,
				name,
				role,
				is_active: true
			});
			await logAudit(pb, {
				userId: admin.id,
				action: 'create',
				collection: 'users',
				recordId: u.id,
				newData: { email, role }
			});
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user, PATH);
		const f = await request.formData();
		const id = f.get('id')?.toString() ?? '';
		const name = f.get('name')?.toString().trim() ?? '';
		const role = f.get('role')?.toString() === 'admin' ? 'admin' : 'kasir';
		const is_active = f.get('is_active') === 'on' || f.get('is_active') === 'true';

		if (!id) return fail(400, { error: 'ID tidak valid' });
		if (!name) return fail(400, { error: 'Nama wajib diisi' });
		if (id === admin.id && (role !== 'admin' || !is_active)) {
			return fail(400, { error: 'Tidak bisa menonaktifkan/menurunkan role diri sendiri' });
		}

		try {
			const pb = await pbAdmin();
			const before = await pb.collection('users').getOne(id).catch(() => null);
			await pb.collection('users').update(id, { name, role, is_active });
			await logAudit(pb, {
				userId: admin.id,
				action: 'update',
				collection: 'users',
				recordId: id,
				oldData: before ? { name: before.name, role: before.role, is_active: before.is_active } : null,
				newData: { name, role, is_active }
			});
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	resetPassword: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user, PATH);
		const f = await request.formData();
		const id = f.get('id')?.toString() ?? '';
		const password = f.get('password')?.toString() ?? '';
		if (!id) return fail(400, { error: 'ID tidak valid' });
		if (password.length < 8) return fail(400, { error: 'Password minimal 8 karakter' });

		try {
			const pb = await pbAdmin();
			await pb.collection('users').update(id, { password, passwordConfirm: password });
			await logAudit(pb, {
				userId: admin.id,
				action: 'reset-password',
				collection: 'users',
				recordId: id
			});
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true, tempPassword: password };
	}
};
