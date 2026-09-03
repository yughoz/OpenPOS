import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords, pbErrorMessage, pbEscape } from '$lib/server/crud';
import { stockIn, StockError } from '$lib/server/stock';

const PATH = '/app/stock/in';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);
	const q = (url.searchParams.get('q') ?? '').trim();

	const [products, suppliers, movements] = await Promise.all([
		listRecords<{ id: string; name: string; stock: number }>(locals.token, 'products', {
			filter: 'deleted != true',
			sort: 'name',
			perPage: 500
		}),
		listRecords<{ id: string; name: string }>(locals.token, 'suppliers', { sort: 'name', perPage: 500 }),
		listRecords(locals.token, 'stock_movements', {
			filter: q ? `type = "in" && (product.name ~ "${pbEscape(q)}" || note ~ "${pbEscape(q)}")` : 'type = "in"',
			sort: '-moved_at',
			perPage: 25,
			expand: 'product,user,supplier'
		})
	]);

	return { products, suppliers, movements, q };
};

export const actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();

		try {
			await stockIn(locals.token, user, {
				product_id: form.get('product_id')?.toString() ?? '',
				qty: Number(form.get('qty')?.toString() ?? '0'),
				supplier_id: form.get('supplier_id')?.toString() ?? '',
				note: form.get('note')?.toString() ?? '',
				reference: 'stok-masuk'
			});
		} catch (err) {
			if (err instanceof StockError) return fail(400, { error: err.message });
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	}
};
