import { requireUser } from '$lib/server/guard';
import { listRecords, pbEscape } from '$lib/server/crud';
import { pbForUser } from '$lib/server/pb';
import type { MovementRow } from '$lib/types';

const PATH = '/app/reports/stock';
const PER_PAGE = 50;

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);

	const from = url.searchParams.get('from')?.toString() ?? '';
	const to = url.searchParams.get('to')?.toString() ?? '';
	const type = url.searchParams.get('type')?.toString() ?? 'all';
	const productId = url.searchParams.get('product')?.toString() ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	const conditions: string[] = [];
	if (type === 'in' || type === 'out') conditions.push(`type = "${type}"`);
	if (productId) conditions.push(`product = "${pbEscape(productId)}"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(from)) conditions.push(`moved_at >= "${from} 00:00:00"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(to)) conditions.push(`moved_at <= "${to} 23:59:59"`);
	const filter = conditions.length > 0 ? conditions.join(' && ') : undefined;

	// ringkasan dihitung dari SELURUH baris yang cocok filter (bukan halaman aktif)
	const allRows = await pbForUser(locals.token).collection('stock_movements').getFullList({
		filter,
		fields: 'type,qty',
		requestKey: null
	});
	let totalIn = 0;
	let totalOut = 0;
	for (const m of allRows as any[]) {
		if (m.type === 'in') totalIn += m.qty;
		else if (m.type === 'out') totalOut += m.qty;
	}

	const [movements, products] = await Promise.all([
		(async () => {
			let rows = await listRecords<MovementRow>(locals.token, 'stock_movements', {
				filter,
				sort: '-moved_at',
				page,
				perPage: PER_PAGE,
				expand: 'product,user,supplier'
			});
			// URL manual melewati halaman terakhir → kembali ke halaman terakhir yang ada
			if (rows.totalPages > 0 && rows.page > rows.totalPages) {
				rows = await listRecords<MovementRow>(locals.token, 'stock_movements', {
					filter,
					sort: '-moved_at',
					page: rows.totalPages,
					perPage: PER_PAGE,
					expand: 'product,user,supplier'
				});
			}
			return rows;
		})(),
		listRecords<{ id: string; name: string }>(locals.token, 'products', {
			filter: 'deleted != true',
			sort: 'name',
			perPage: 500
		})
	]);

	return {
		movements,
		products,
		filters: { from, to, type, productId },
		summary: { totalIn, totalOut },
		perPage: PER_PAGE
	};
};
