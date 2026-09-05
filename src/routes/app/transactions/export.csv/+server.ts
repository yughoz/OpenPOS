import { requireUser } from '$lib/server/guard';
import { pbForUser } from '$lib/server/pb';
import { buildTxFilter } from '$lib/server/transaction';

const PATH = '/app/transactions';

/**
 * Export CSV dibuat on-demand di server (bukan diikutkan di payload halaman)
 * dengan filter yang sama seperti halaman daftar transaksi.
 */
export const GET = async ({ locals, url }) => {
	const user = requireUser(locals.user, PATH);
	const isAdmin = user.role === 'admin';

	const customer = url.searchParams.get('customer')?.toString() ?? '';
	const kasir = isAdmin ? url.searchParams.get('kasir')?.toString() ?? '' : '';

	// sama dengan halaman daftar: default periode bulan berjalan
	let from = url.searchParams.get('from')?.toString() ?? '';
	let to = url.searchParams.get('to')?.toString() ?? '';
	if (!from) {
		const now = new Date();
		from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	}

	const pb = pbForUser(locals.token);
	const all = (await pb.collection('transactions').getFullList({
		filter: buildTxFilter({ from, to, customer, kasir }, isAdmin ? undefined : user.id),
		sort: '-transaction_date',
		expand: 'customer,user',
		fields: 'code,transaction_date,total_final,status,expand.customer.name,expand.user.name'
	})) as any[];

	const lines = [['Tanggal', 'Nota', 'Customer', 'Kasir', 'Total', 'Status'].join(';')];
	for (const t of all) {
		lines.push(
			[
				String(t.transaction_date ?? '').slice(0, 19),
				t.code ?? '',
				t.expand?.customer?.name ?? '',
				t.expand?.user?.name ?? '',
				String(t.total_final ?? 0),
				t.status === 'completed' ? 'Selesai' : 'Dibatalkan'
			]
				.map((v) => `"${String(v).replace(/"/g, '""')}"`)
				.join(';')
		);
	}

	return new Response('\ufeff' + lines.join('\n'), {
		headers: {
			'Content-Type': 'text/csv;charset=utf-8',
			'Content-Disposition': `attachment; filename="laporan-transaksi-${new Date().toISOString().slice(0, 10)}.csv"`
		}
	});
};
