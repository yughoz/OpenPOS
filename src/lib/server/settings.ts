import { pbForUser, pbAdmin } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { pbEscape } from '$lib/server/crud';
import type { AuthUser } from '$lib/server/auth';

/** Baca satu setting (key-value). Fallback ke default kalau belum ada. */
export async function getSetting(token: string | null, key: string, fallback = ''): Promise<string> {
	try {
		const pb = pbForUser(token);
		const items = await pb.collection('settings').getList(1, 1, {
			filter: `key = "${pbEscape(key)}"`
		});
		if (items.items.length > 0) return items.items[0].value ?? fallback;
	} catch {
		/* jatuh ke fallback */
	}
	return fallback;
}

/** Tulis/upsert satu setting + audit log. */
export async function setSetting(user: AuthUser, key: string, value: string): Promise<void> {
	const admin = await pbAdmin();
	const existing = await admin.collection('settings').getList(1, 1, {
		filter: `key = "${pbEscape(key)}"`
	});
	if (existing.items.length > 0) {
		const old = existing.items[0];
		await admin.collection('settings').update(old.id, { value });
		await logAudit(admin, {
			userId: user.id,
			action: 'update',
			collection: 'settings',
			recordId: old.id,
			oldData: { key, value: old.value },
			newData: { key, value }
		});
	} else {
		const created = await admin.collection('settings').create({ key, value });
		await logAudit(admin, {
			userId: user.id,
			action: 'create',
			collection: 'settings',
			recordId: created.id,
			newData: { key, value }
		});
	}
}
