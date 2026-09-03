import { requireUser } from '$lib/server/guard';
import { listRecords, pbEscape } from '$lib/server/crud';
import type { MovementRow } from '$lib/types';

const PATH = '/app/reports/stock';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);

	const from = url.searchParams.get('from')?.toString() ?? '';
	const to = url.searchParams.get('to')?.toString() ?? '';
	const type = url.searchParams.get('type')?.toString() ?? 'all';
	const productId = url.searchParams.get('product')?.toString() ?? '';

	const conditions: string[] = [];
	if (type === 'in' || type === 'out') conditions.push(`type = "${type}"`);
	if (productId) conditions.push(`product = "${pbEscape(productId)}"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(from)) conditions.push(`moved_at >= "${from} 00:00:00"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(to)) conditions.push(`moved_at <= "${to} 23:59:59"`);
	const filter = conditions.length > 0 ? conditions.join(' && ') : undefined;

	const [movements, products] = await Promise.all([
		listRecords<MovementRow>(locals.token, 'stock_movements', {
			filter,
			sort: '-moved_at',
			perPage: 200,
			expand: 'product,user,supplier'
		}),
		listRecords<{ id: string; name: string }>(locals.token, 'products', {
			filter: 'deleted != true',
			sort: 'name',
			perPage: 500
		})
	]);

	let totalIn = 0;
	let totalOut = 0;
	for (const m of movements.items) {
		if (m.type === 'in') totalIn += m.qty;
		else if (m.type === 'out') totalOut += m.qty;
	}

	return { movements, products, filters: { from, to, type, productId }, summary: { totalIn, totalOut } };
};
