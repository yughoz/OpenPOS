import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { pbErrorMessage, listRecords } from '$lib/server/crud';
import { pbAdmin, pbForUser } from '$lib/server/pb';
import { buildTxFilter, summarize, fetchItemsGrouped, voidTransaction, TransactionError, type ItemRow } from '$lib/server/transaction';

const PATH = '/app/transactions';

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

	// satu fetch untuk semuanya: ringkasan + daftar halaman + detail item
	const pb = pbForUser(locals.token);
	const all = await pb.collection('transactions').getFullList({ filter, sort: '-transaction_date', expand: 'customer,user' });
	const allTx = (all as any[]).map((t) => ({
		id: t.id,
		code: t.code ?? '',
		transaction_date: t.transaction_date ?? '',
		total_final: t.total_final ?? 0,
		status: t.status ?? '',
		customer: t.customer ?? '',
		user: t.user ?? '',
		expand: t.expand
	}));
	// data lengkap utk export CSV (tanpa expand — string polos)
	const csvRows = (all as any[]).map((t) => ({
		tanggal: String(t.transaction_date ?? '').slice(0, 19),
		nota: t.code ?? '',
		customer: t.expand?.customer?.name ?? '',
		kasir: t.expand?.user?.name ?? '',
		total: t.total_final ?? 0,
		status: t.status ?? ''
	}));
	const itemsByTx = await fetchItemsGrouped(locals.token, allTx.map((t) => t.id));
	const summary = summarize(allTx, itemsByTx);

	const PER_PAGE = 20;
	const totalPages = Math.max(1, Math.ceil(allTx.length / PER_PAGE));
	const safePage = Math.min(page, totalPages);
	const pageRows = allTx.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
	const itemsMapPlain: Record<string, ItemRow[]> = {};
	for (const [k, v] of itemsByTx) itemsMapPlain[k] = v;

	const list = {
		items: pageRows,
		page: safePage,
		totalPages,
		totalItems: allTx.length
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
		all: csvRows,
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
