import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords, pbEscape } from '$lib/server/crud';

const PATH = '/app/pos';

/** Endpoint suggest produk untuk layar kasir — LIKE %% ke nama & barcode, semua produk. */
export const GET = async ({ locals, url }) => {
	requireUser(locals.user, PATH);
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (!q) return json([]);

	const items = await listRecords(locals.token, 'products', {
		filter: `(name ~ "${pbEscape(q)}" || barcode ~ "${pbEscape(q)}") && deleted != true`,
		sort: 'name',
		perPage: 8
	});

	return json(items.items);
};
