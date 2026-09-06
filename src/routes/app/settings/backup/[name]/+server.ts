import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { fetchBackupZip, isValidBackupName } from '$lib/server/backup';

const PATH = '/app/settings';

/** Download ZIP backup — di-proxy lewat server karena butuh token superuser. */
export const GET = async ({ locals, params }) => {
	requireAdmin(locals.user, PATH);
	const name = params.name ?? '';
	if (!isValidBackupName(name)) error(400, 'Nama backup tidak valid.');
	const upstream = await fetchBackupZip(name);
	if (!upstream.ok || !upstream.body) error(404, 'Backup tidak ditemukan.');
	return new Response(upstream.body, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${name}"`
		}
	});
};
