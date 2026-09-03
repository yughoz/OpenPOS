import { requireAdmin } from '$lib/server/guard';
import { pbAdmin } from '$lib/server/pb';
import { pbEscape } from '$lib/server/crud';

const PATH = '/app/audit';

const ACTIONS = ['checkout', 'void-cart', 'void-transaction', 'create', 'update', 'delete', 'reset-password', 'pay-debt'];
const COLLECTIONS = ['transactions', 'products', 'users', 'settings', 'debts', 'stock_movements'];

function asObject(v: unknown): Record<string, unknown> | null {
	if (!v) return null;
	if (typeof v === 'string') {
		try {
			return JSON.parse(v) as Record<string, unknown>;
		} catch {
			return { nilai: v };
		}
	}
	if (typeof v === 'object') return v as Record<string, unknown>;
	return null;
}

export const load = async ({ locals, url }) => {
	requireAdmin(locals.user, PATH);

	const from = url.searchParams.get('from')?.toString() ?? '';
	const to = url.searchParams.get('to')?.toString() ?? '';
	const action = url.searchParams.get('action')?.toString() ?? '';
	const collection = url.searchParams.get('collection')?.toString() ?? '';
	const user = url.searchParams.get('user')?.toString() ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	// audit_logs hanya bisa dibaca superuser — selalu lewat pbAdmin, bukan token user
	const conditions: string[] = [];
	if (/^\d{4}-\d{2}-\d{2}$/.test(from)) conditions.push(`created >= "${from} 00:00:00"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(to)) conditions.push(`created <= "${to} 23:59:59"`);
	if (action) conditions.push(`action = "${pbEscape(action)}"`);
	if (collection) conditions.push(`collection = "${pbEscape(collection)}"`);
	if (user) conditions.push(`user = "${pbEscape(user)}"`);
	const filter = conditions.length > 0 ? conditions.join(' && ') : undefined;

	const admin = await pbAdmin();
	const [result, users] = await Promise.all([
		admin.collection('audit_logs').getList(page, 25, { filter, sort: '-created', expand: 'user' }),
		admin.collection('users').getFullList({ filter: 'role = "kasir" || role = "admin"', sort: 'name' })
	]);

	const items = result.items.map((t: any) => ({
		id: t.id,
		created: t.created ?? '',
		action: t.action ?? '',
		collection: t.collection ?? '',
		record_id: t.record_id ?? '',
		userName: t.expand?.user?.name || t.expand?.user?.email || '—',
		old: asObject(t.old_data),
		new: asObject(t.new_data)
	}));

	return {
		items,
		totalItems: result.totalItems,
		totalPages: result.totalPages,
		page: result.page,
		filters: { from, to, action, collection, user },
		actions: ACTIONS,
		collections: COLLECTIONS,
		users: users.map((u: any) => ({ id: u.id, name: u.name || u.email }))
	};
};
