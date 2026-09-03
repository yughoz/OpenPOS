import PocketBase, { type RecordModel } from 'pocketbase';
import { env } from '$env/dynamic/private';
import { PB_URL } from '$lib/server/auth';

const EMPTY_RECORD = {} as unknown as RecordModel;

/**
 * Client yang berjalan dengan token user (untuk query atas nama user yang login).
 * API rules PocketBase tetap berlaku sebagai lapisan pertahanan kedua.
 */
export function pbForUser(token?: string | null): PocketBase {
	const pb = new PocketBase(PB_URL);
	if (token) {
		pb.authStore.save(token, EMPTY_RECORD);
	}
	return pb;
}

let adminToken: string | null = null;
let adminExpiresAt = 0;

async function fetchAdminToken(): Promise<string> {
	const email = env.PB_SUPERUSER_EMAIL;
	const password = env.PB_SUPERUSER_PASSWORD;
	if (!email || !password) {
		throw new Error('PB_SUPERUSER_EMAIL dan PB_SUPERUSER_PASSWORD harus diset di .env');
	}
	const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ identity: email, password })
	});
	if (!res.ok) {
		throw new Error(`Gagal login superuser PocketBase (${res.status}). Cek kredensial PB_SUPERUSER_*.`);
	}
	const data = await res.json();
	adminToken = data.token as string;
	try {
		const payload = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString());
		adminExpiresAt = payload.exp * 1000 - 60_000;
	} catch {
		adminExpiresAt = Date.now() + 10 * 60_000;
	}
	return adminToken;
}

/**
 * Client superuser untuk operasi server (tulis transaksi, stok, audit log).
 * Token di-cache sampai mendekati expired.
 */
export async function pbAdmin(): Promise<PocketBase> {
	if (!adminToken || Date.now() >= adminExpiresAt) {
		await fetchAdminToken();
	}
	const pb = new PocketBase(PB_URL);
	pb.authStore.save(adminToken as string, EMPTY_RECORD);
	// Kalau token tiba-tiba invalid (PB restart / swap data dir → secret berubah),
	// coba sekali refresh lalu ulang request. PB menandai token superuser basi
	// dengan 401/403 ATAU 400 berpesan "Only superusers...". List bahkan balik
	// 200 kosong — makanya verifikasi keaktifan token dilakukan via pesan error.
	const originalSend = pb.send.bind(pb);
	pb.send = async function (path, options) {
		try {
			return await originalSend(path, options);
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { message?: string } };
			const status = e?.status;
			const message = e?.response?.message ?? '';
			const authProblem =
				status === 401 || status === 403 || /only superusers|authentication/i.test(message);
			if (!authProblem) throw err;
			await fetchAdminToken();
			pb.authStore.save(adminToken as string, EMPTY_RECORD);
			return await originalSend(path, options);
		}
	};
	return pb;
}
