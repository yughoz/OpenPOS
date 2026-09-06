import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { restoreBackupUpload } from '$lib/server/backup';

const PATH = '/app/settings';

/**
 * Restore dari file ZIP yang diunggah admin.
 * Sengaja +server.ts (bukan form action) supaya bebas dari body size limit
 * bawaan form action SvelteKit; upload diproses via fetch dari klien.
 */
export const POST = async ({ locals, request }) => {
	requireAdmin(locals.user, PATH);
	const form = await request.formData();
	const confirm = form.get('confirm')?.toString().trim() ?? '';
	if (confirm !== 'RESTORE') {
		return json({ error: 'Konfirmasi salah — ketik RESTORE untuk memulihkan.' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0 || !file.name.toLowerCase().endsWith('.zip')) {
		return json({ error: 'File harus ZIP backup PocketBase.' }, { status: 400 });
	}
	try {
		await restoreBackupUpload(file);
	} catch (err) {
		const message = (err as { response?: { message?: string } })?.response?.message ?? 'Gagal memulihkan backup dari file.';
		return json({ error: message }, { status: 400 });
	}
	return json({ ok: true });
};
