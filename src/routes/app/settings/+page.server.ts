import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { getSetting, setSetting } from '$lib/server/settings';
import * as m from '$lib/paraglide/messages.js';

const PATH = '/app/settings';

// label & placeholder diterjemahkan di client (lihat LABELS/PLACEHOLDERS di +page.svelte)
const _FIELDS = [
	{ key: 'store_name', max: 30 },
	{ key: 'store_description', max: 70 },
	{ key: 'store_phone', max: 30 },
	{ key: 'prefix_nota', max: 6 },
	{ key: 'prefix_barcode', max: 6 },
	{ key: 'receipt_size', max: 3 },
	{ key: 'receipt_footer', max: 100 }
] as const;

export const load = async ({ locals, url }) => {
	requireAdmin(locals.user, url.pathname || PATH);
	const values: Record<string, string> = {};
	for (const f of _FIELDS) values[f.key] = await getSetting(locals.token, f.key, '');
	return { fields: _FIELDS, values };
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
	}
};
