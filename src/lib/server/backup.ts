import { pbAdmin } from '$lib/server/pb';
import { PB_URL } from '$lib/server/auth';

/**
 * Wrapper fitur backup bawaan PocketBase (superuser-only):
 * satu ZIP berisi seluruh record, schema, dan file lokal (pb_data).
 * Restore = full replace pb_data dengan isi backup — bukan merge.
 */

export interface BackupInfo {
	name: string;
	size: number;
	modified: string;
}

/** Nama backup dibatasi karakter aman (tanpa slash/spasi) sebelum dipakai di URL/PATH. */
export function isValidBackupName(name: string): boolean {
	return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

export async function listBackups(): Promise<BackupInfo[]> {
	const admin = await pbAdmin();
	const rows = (await admin.backups.getFullList({ requestKey: null })) as any[];
	// API PocketBase menamai field filenya `key`
	return rows.map((r) => ({ name: String(r.key ?? r.name ?? ''), size: r.size ?? 0, modified: r.modified ?? '' }));
}

/** name kosong/undefined → PocketBase menamai otomatis. Nama custom wajib
 * pola [a-z0-9._-] berakhiran .zip — otomatis dilowercase + diberi suffix. */
export async function createBackup(name?: string): Promise<void> {
	const admin = await pbAdmin();
	let finalName = (name ?? '').trim().toLowerCase();
	if (finalName && !finalName.endsWith('.zip')) finalName += '.zip';
	await admin.backups.create(finalName, { requestKey: null });
}

export async function deleteBackup(name: string): Promise<void> {
	const admin = await pbAdmin();
	await admin.backups.delete(name, { requestKey: null });
}

/** Sesaat mengunci seluruh data; sesudah ini token login lama bisa invalid (users ikut ter-roll-back). */
export async function restoreBackup(name: string): Promise<void> {
	const admin = await pbAdmin();
	await admin.backups.restore(name, { requestKey: null, timeout: 120_000 });
}

/** Restore dari file ZIP yang diunggah user (diteruskan ke /api/backups/upload).
 * PB hanya menerima nama backup [a-z0-9._-] berakhiran .zip — nama file dari
 * browser sering mengandung spasi/kurung/huruf besar ("bu (1).ZIP"), jadi
 * nama disanitasi dulu. */
export async function restoreBackupUpload(file: File): Promise<void> {
	const admin = await pbAdmin();
	const safeName = (file.name || '')
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	const finalName = safeName.endsWith('.zip') ? safeName : `${safeName || 'upload'}.zip`;
	const clean = new File([file], finalName, { type: 'application/zip' });
	const form = new FormData();
	form.append('file', clean, finalName);
	await admin.backups.upload(form, { requestKey: null, timeout: 180_000 });
}

/** Ambil isi ZIP backup untuk di-proxy-kan ke browser admin.
 * Download memakai file token superuser berumur pendek via query param —
 * endpoint ini tidak menerima Authorization header (403 kalau dipaksa). */
export async function fetchBackupZip(name: string): Promise<Response> {
	const admin = await pbAdmin();
	const fileToken = await admin.files.getToken({ requestKey: null });
	return await fetch(`${PB_URL}/api/backups/${encodeURIComponent(name)}?token=${encodeURIComponent(String(fileToken))}`);
}
