import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords, updateRecord, pbErrorMessage, pbEscape } from '$lib/server/crud';
import { createProduct, updateProduct, parseProductForm, importProducts } from '$lib/server/products';
import * as m from '$lib/paraglide/messages.js';

const PATH = '/app/products';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);
	const q = (url.searchParams.get('q') ?? '').trim();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	const filter = q
		? `(name ~ "${pbEscape(q)}" || barcode ~ "${pbEscape(q)}") && deleted != true`
		: 'deleted != true';
	const [items, categories, units] = await Promise.all([
		listRecords(locals.token, 'products', { filter, sort: '-created', page, perPage: 20, expand: 'category,unit' }),
		listRecords<{ id: string; name: string }>(locals.token, 'product_categories', { sort: 'name', perPage: 500 }),
		listRecords<{ id: string; name: string }>(locals.token, 'product_units', { sort: 'name', perPage: 500 })
	]);

	return { items, categories, units, q };
};

export const actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const parsed = parseProductForm(await request.formData(), { forCreate: true });
		if (!parsed.data) return fail(400, { error: parsed.error });
		try {
			await createProduct(locals.token, user, parsed.data);
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const id = form.get('id')?.toString() ?? '';
		if (!id) return fail(400, { error: 'ID tidak valid' });
		const parsed = parseProductForm(form, { forCreate: false });
		if (!parsed.data) return fail(400, { error: parsed.error });
		try {
			await updateProduct(locals.token, user, id, parsed.data);
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const id = form.get('id')?.toString() ?? '';
		if (!id) return fail(400, { error: 'ID tidak valid' });
		try {
			// Soft delete — produk yang sudah punya riwayat stok/transaksi tidak boleh hilang.
			await updateRecord({
				token: locals.token,
				user,
				collection: 'products',
				id,
				data: { deleted: true },
				actionLabel: 'delete'
			});
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	import: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: m['products.import_no_file']() });
		if (!file.name.toLowerCase().endsWith('.csv')) return fail(400, { error: m['products.import_not_csv']() });
		if (file.size > 5 * 1024 * 1024) return fail(400, { error: m['products.import_too_large']() });
		const text = await file.text();
		if (!text.trim()) return fail(400, { error: m['products.import_empty_file']() });
		try {
			const imported = await importProducts(locals.token, user, text);
			return { success: true, imported };
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
	}
};
