import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords, createRecord, updateRecord, deleteRecord, pbErrorMessage, pbEscape } from '$lib/server/crud';

const COLLECTION = 'customers';
const PATH = '/app/customers';

function parseForm(form: FormData): { data: Record<string, string> | null; error?: string } {
	const name = form.get('name')?.toString().trim() ?? '';
	if (!name) return { data: null, error: 'Nama wajib diisi' };
	const gender = form.get('gender')?.toString().trim() ?? '';
	if (gender && !['L', 'P'].includes(gender)) return { data: null, error: 'Gender harus L atau P' };
	return {
		data: {
			name,
			gender,
			address: form.get('address')?.toString().trim() ?? '',
			phone: form.get('phone')?.toString().trim() ?? ''
		}
	};
}

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);
	const q = (url.searchParams.get('q') ?? '').trim();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const filter = q ? `(name ~ "${pbEscape(q)}" || phone ~ "${pbEscape(q)}")` : undefined;
	const items = await listRecords(locals.token, COLLECTION, { filter, sort: 'name', page, perPage: 20 });
	return { items, q };
};

export const actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const parsed = parseForm(await request.formData());
		if (!parsed.data) return fail(400, { error: parsed.error });
		try {
			await createRecord({ token: locals.token, user, collection: COLLECTION, data: parsed.data });
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
		const parsed = parseForm(form);
		if (!parsed.data) return fail(400, { error: parsed.error });
		try {
			await updateRecord({ token: locals.token, user, collection: COLLECTION, id, data: parsed.data });
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
