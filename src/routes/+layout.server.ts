import type { LayoutServerLoad } from './$types';
import { getSetting } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals }) => {
	// simbol mata uang untuk seluruh UI; fallback "Rp" (mis. di /login tanpa sesi)
	const currency = locals.user ? await getSetting(locals.token, 'currency_symbol', 'Rp') : 'Rp';
	return { user: locals.user, currency };
};
