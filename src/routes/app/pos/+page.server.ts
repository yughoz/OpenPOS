import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { listRecords } from '$lib/server/crud';
import { pbForUser } from '$lib/server/pb';
import { getCurrentCart, listHeldCarts, addItem, updateItem, removeItem, setCustomer, setDiscount, voidCart, checkout, PosError } from '$lib/server/pos';

const PATH = '/app/pos';

export const load = async ({ locals, url }) => {
	const user = requireUser(locals.user, PATH);
	const txParam = url.searchParams.get('tx')?.toString() ?? '';

	const [cart, customers] = await Promise.all([
		getCurrentCart(locals.token, user, txParam || undefined),
		listRecords<{ id: string; name: string }>(locals.token, 'customers', { sort: 'name', perPage: 500 })
	]);
	const held = await listHeldCarts(locals.token, user, cart?.id);

	// total piutang aktif untuk customer yang dipilih di keranjang
	let customerDebt = 0;
	if (cart?.customer) {
		try {
			const pb = pbForUser(locals.token);
			const debts = (await pb.collection('debts').getFullList({
				filter: `customer = "${cart.customer}" && status != "paid"`
			})) as any[];
			customerDebt = debts.reduce((s, d) => s + ((d.total ?? 0) - (d.paid ?? 0)), 0);
		} catch {
			customerDebt = 0;
		}
	}

	// suggest produk dicari on-demand via /app/pos/suggest (LIKE %% server-side)
	return { cart, held, customers, customerDebt, txParam };
};

export const actions = {
	add: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		try {
			const res = await addItem(locals.token, user, {
				term: form.get('term')?.toString() ?? '',
				qty: Number(form.get('qty')?.toString() ?? '1') || 1,
				priceMode: form.get('mode')?.toString() === 'wholesale' ? 'wholesale' : 'retail',
				txId: form.get('tx_id')?.toString() ?? ''
			});
			return { success: true, txId: res.cart.id, isNew: res.createdNew };
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal menambah item.' });
		}
	},

	updateItem: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		try {
			await updateItem(locals.token, user, {
				item_id: form.get('item_id')?.toString() ?? '',
				qty: Number(form.get('qty')?.toString() ?? '1'),
				sell_price: Number(form.get('sell_price')?.toString() ?? '0'),
				discount: Number(form.get('discount')?.toString() ?? '0')
			});
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal mengubah item.' });
		}
		return { success: true };
	},

	removeItem: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		try {
			await removeItem(locals.token, user, form.get('item_id')?.toString() ?? '');
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal menghapus item.' });
		}
		return { success: true };
	},

	setCustomer: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const txId = form.get('tx_id')?.toString() ?? '';
		if (!txId) return fail(400, { error: 'Keranjang belum ada — tambah item dulu.' });
		try {
			await setCustomer(locals.token, user, txId, form.get('customer_id')?.toString() ?? '');
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal menyimpan customer.' });
		}
		return { success: true };
	},

	setDiscount: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const txId = form.get('tx_id')?.toString() ?? '';
		if (!txId) return fail(400, { error: 'Keranjang belum ada — tambah item dulu.' });
		try {
			await setDiscount(locals.token, user, txId, Number(form.get('discount')?.toString() ?? '0'));
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal menyimpan diskon.' });
		}
		return { success: true };
	},

	void: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		try {
			await voidCart(locals.token, user, form.get('tx_id')?.toString() ?? '');
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal membatalkan.' });
		}
		return { success: true, voided: true };
	},

	checkout: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const methodRaw = form.get('method')?.toString() ?? 'cash';
		const method = (['cash', 'qris', 'debit', 'ewallet'].includes(methodRaw) ? methodRaw : 'cash') as
			| 'cash'
			| 'qris'
			| 'debit'
			| 'ewallet';
		try {
			const result = await checkout(locals.token, user, {
				txId: form.get('tx_id')?.toString() || undefined,
				paid: Number(form.get('paid')?.toString() ?? '0'),
				method,
				reference: form.get('reference')?.toString() ?? ''
			});
			return { success: true, receipt: result.id, change: result.change, code: result.code };
		} catch (err) {
			if (err instanceof PosError) return fail(400, { error: err.message });
			console.error('[pos action]', err);
			return fail(400, { error: 'Gagal memproses pembayaran.' });
		}
	}
};
