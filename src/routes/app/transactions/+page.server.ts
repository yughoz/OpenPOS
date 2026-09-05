import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { pbErrorMessage, listRecords } from '$lib/server/crud';
import { pbAdmin, pbForUser } from '$lib/server/pb';
import {
	buildTxFilter,
	fetchTxSummary,
	fetchItemsGrouped,
	voidTransaction,
	TransactionError,
	type ItemRow
} from '$lib/server/transaction';

const PATH = '/app/transactions';
const PER_PAGE = 20;

export const load = async ({ locals, url }) => {
	const user = requireUser(locals.user, PATH);
	const isAdmin = user.role === 'admin';

	const customer = url.searchParams.get('customer')?.toString() ?? '';
	const kasir = isAdmin ? url.searchParams.get('kasir')?.toString() ?? '' : '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	// default periode: bulan berjalan — tanpa ini, ringkasan seluruh riwayat
	// (ratusan ribu transaksi) akan berat setiap kali halaman dibuka
	let from = url.searchParams.get('from')?.toString() ?? '';
	let to = url.searchParams.get('to')?.toString() ?? '';
	if (!from) {
		const now = new Date();
		from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	}

	const filter = buildTxFilter({ from, to, customer, kasir }, isAdmin ? undefined : user.id);
	// scoping kasir untuk ringkasan: non-admin dipaksa ke transaksinya sendiri
	const statsQuery = { from, to, customer, kasir: isAdmin ? kasir : user.id };

	const pb = pbForUser(locals.token);

	// tabel: hanya 1 halaman (20 baris, 1 request) — pagination ditangani PocketBase
	const query = { filter, sort: '-transaction_date', expand: 'customer,user' };
	let result = await pb.collection('transactions').getList(page, PER_PAGE, query);
	const totalPages = Math.max(1, Math.ceil(result.totalItems / PER_PAGE));
	const safePage = Math.min(page, totalPages);
	if (safePage !== page) {
		result = await pb.collection('transactions').getList(safePage, PER_PAGE, query);
	}
	const pageRows = (result.items as any[]).map((t) => ({
		id: t.id,
		code: t.code ?? '',
		transaction_date: t.transaction_date ?? '',
		total_final: t.total_final ?? 0,
		status: t.status ?? '',
		customer: t.customer ?? '',
		user: t.user ?? '',
		expand: t.expand
	}));

	// detail item hanya untuk baris yang tampil (1 request @100 id)
	const itemsByTx = await fetchItemsGrouped(locals.token, pageRows.map((t) => t.id));
	const itemsMapPlain: Record<string, ItemRow[]> = {};
	for (const [k, v] of itemsByTx) itemsMapPlain[k] = v;

	// ringkasan periode dari endpoint agregat (1 request kecil)
	const summary = await fetchTxSummary(locals.token, statsQuery);

	const list = {
		items: pageRows,
		page: safePage,
		totalPages,
		totalItems: result.totalItems
	};

	// opsi filter: customer & daftar kasir (admin)
	const customers = await listRecords<{ id: string; name: string }>(locals.token, 'customers', { sort: 'name', perPage: 500 });
	let kasirs: Array<{ id: string; name: string }> = [];
	if (isAdmin) {
		try {
			const admin = await pbAdmin();
			const users = await admin.collection('users').getFullList({ filter: 'role = "kasir" || role = "admin"', sort: 'name' });
			kasirs = users.map((u: any) => ({ id: u.id, name: u.name || u.email }));
		} catch {
			kasirs = [];
		}
	}

	return {
		list,
		itemsMap: itemsMapPlain,
		summary,
		filters: { from, to, customer, kasir },
		customers,
		kasirs,
		isAdmin,
		defaultedFrom: url.searchParams.get('from') === null
	};
};

export const actions = {
	void: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		if (user.role !== 'admin') return fail(403, { error: 'Hanya admin yang bisa membatalkan transaksi.' });
		const form = await request.formData();
		try {
			await voidTransaction(locals.token, user, form.get('tx_id')?.toString() ?? '');
		} catch (err) {
			if (err instanceof TransactionError) return fail(400, { error: err.message });
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	}
};
