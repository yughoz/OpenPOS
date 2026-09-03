import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords, createRecord, updateRecord, deleteRecord, pbErrorMessage, pbEscape } from '$lib/server/crud';

const COLLECTION = 'product_units';
const PATH = '/app/product-units';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);
	const q = (url.searchParams.get('q') ?? '').trim();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const items = await listRecords(locals.token, COLLECTION, {
		filter: q ? `name ~ "${pbEscape(q)}"` : undefined,
		sort: 'name',
		page,
		perPage: 20
	});
	return { items, q };
};

export const actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const name = form.get('name')?.toString().trim() ?? '';
		if (!name) return fail(400, { error: 'Nama wajib diisi' });
		try {
			await createRecord({ token: locals.token, user, collection: COLLECTION, data: { name } });
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const id = form.get('id')?.toString() ?? '';
		const name = form.get('name')?.toString().trim() ?? '';
		if (!id) return fail(400, { error: 'ID tidak valid' });
		if (!name) return fail(400, { error: 'Nama wajib diisi' });
		try {
			await updateRecord({ token: locals.token, user, collection: COLLECTION, id, data: { name } });
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
			await deleteRecord({ token: locals.token, user, collection: COLLECTION, id });
		} catch (err) {
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	}
};
