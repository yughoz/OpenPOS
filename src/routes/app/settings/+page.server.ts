import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { getSetting, setSetting } from '$lib/server/settings';
import { createBackup, deleteBackup, listBackups, restoreBackup, isValidBackupName } from '$lib/server/backup';
import * as m from '$lib/paraglide/messages.js';

const PATH = '/app/settings';

// label & placeholder diterjemahkan di client (lihat LABELS/PLACEHOLDERS di +page.svelte)
const _FIELDS = [
	{ key: 'store_name', max: 30 },
	{ key: 'store_description', max: 70 },
	{ key: 'store_phone', max: 30 },
	{ key: 'currency_symbol', max: 6 },
	{ key: 'prefix_nota', max: 6 },
	{ key: 'prefix_barcode', max: 6 },
	{ key: 'receipt_size', max: 3 },
	{ key: 'receipt_footer', max: 100 }
] as const;

export const load = async ({ locals, url }) => {
	requireAdmin(locals.user, url.pathname || PATH);
	const values: Record<string, string> = {};
	for (const f of _FIELDS) values[f.key] = await getSetting(locals.token, f.key, '');
	let backups: Awaited<ReturnType<typeof listBackups>> = [];
	try {
		backups = await listBackups();
	} catch {
		// fitur backup tidak kritikal — jangan gagalkan seluruh halaman settings
	}
	return { fields: _FIELDS, values, backups };
};

export const actions = {
	save: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user, PATH);
		const form = await request.formData();

		try {
			for (const f of _FIELDS) {
				let value = form.get(f.key)?.toString().trim() ?? '';
				// prefix wajib huruf besar & tanpa spasi
				if (f.key.startsWith('prefix_')) value = value.replace(/\s+/g, '').toUpperCase();
				// ukuran struk hanya boleh 58 / 80 (mm)
				if (f.key === 'receipt_size' && value !== '58' && value !== '80') value = '80';
				await setSetting(admin, f.key, value);
			}
		} catch {
			return fail(400, { error: m['settings.save_error']() });
		}
		return { success: true };
	},

	create_backup: async ({ request, locals }) => {
		requireAdmin(locals.user, PATH);
		const form = await request.formData();
		const raw = form.get('name')?.toString().trim() ?? '';
		let name: string | undefined;
		if (raw) {
			if (!isValidBackupName(raw)) return fail(400, { backup_error: 'Nama backup hanya boleh huruf, angka, titik, garis.' });
			name = raw;
		}
		try {
			await createBackup(name);
		} catch (err) {
			return fail(400, { backup_error: (err as { response?: { message?: string } })?.response?.message ?? 'Gagal membuat backup.' });
		}
		return { backup_created: true };
	},

	delete_backup: async ({ request, locals }) => {
		requireAdmin(locals.user, PATH);
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		if (!isValidBackupName(name)) return fail(400, { backup_error: 'Nama backup tidak valid.' });
		try {
			await deleteBackup(name);
		} catch (err) {
			return fail(400, { backup_error: (err as { response?: { message?: string } })?.response?.message ?? 'Gagal menghapus backup.' });
		}
		return { backup_deleted: true };
	},

	// full replace: seluruh data saat ini diganti isi backup (users ikut ter-roll-back)
	restore_backup: async ({ request, locals }) => {
		requireAdmin(locals.user, PATH);
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		const confirm = form.get('confirm')?.toString().trim() ?? '';
		if (!isValidBackupName(name)) return fail(400, { backup_error: 'Nama backup tidak valid.' });
		if (confirm !== 'RESTORE') return fail(400, { backup_error: 'Konfirmasi salah — ketik RESTORE untuk memulihkan.' });
		try {
			await restoreBackup(name);
		} catch (err) {
			return fail(400, { backup_error: (err as { response?: { message?: string } })?.response?.message ?? 'Gagal memulihkan backup.' });
		}
		return { backup_restored: true };
	}
};
