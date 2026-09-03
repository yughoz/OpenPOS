import { env } from '$env/dynamic/private';
import { pbForUser } from '$lib/server/pb';
import { buildTxFilter, summarize } from '$lib/server/transaction';
import { pbEscape } from '$lib/server/crud';
import { getSetting } from '$lib/server/settings';

/**
 * Asisten AI (read-only) untuk /app/ai-chat.
 * - Format API: OpenAI-compatible chat/completions dengan tool-calling.
 * - READ-ONLY di 3 lapisan: hanya tool baca yang didefinisikan; eksekusi via
 *   pbForUser (API rules PocketBase tetap berlaku); system prompt menolak aksi tulis.
 */

const BASE_URL = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = env.OPENAI_MODEL || 'gpt-4o-mini';
const API_KEY = env.OPENAI_API_KEY || '';

const MAX_TOOL_ROUNDS = 4;
const TOOL_RESULT_MAX_CHARS = 8000;
const LLM_TIMEOUT_MS = 60_000;
// batas total waktu eksekusi tools dalam satu pertanyaan — lewat ini AI tetap
// diberi jawaban (berisi info deadline) alih-alih request menggantung selamanya
const TOOL_BUDGET_MS = 90_000;
// saat provider balas 429 (kuota), ulangi dengan jeda sebelum menyerah
const RATE_LIMIT_RETRIES = [2_000, 6_000];

export class AiNotConfiguredError extends Error {}
export class AiRateLimitedError extends Error {}

export interface AiChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

/** Pesan internal LLM (termasuk system & tool result). */
interface LlmMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
}

// ---------- util tanggal ----------

function dayKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Validasi & rapikan rentang tanggal: default bulan berjalan, maks 366 hari, dari<=sampai. */
function clampRange(from?: unknown, to?: unknown): { from: string; to: string } {
	const now = new Date();
	const ok = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
	let f = ok(from) ? (from as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	let t = ok(to) ? (to as string) : dayKey(now);
	if (f > t) [f, t] = [t, f];
	const endMs = new Date(`${t}T00:00:00`).getTime();
	if (endMs - new Date(`${f}T00:00:00`).getTime() > 365 * 86_400_000) {
		f = dayKey(new Date(endMs - 365 * 86_400_000));
	}
	return { from: f, to: t };
}

function num(v: unknown, def: number, max: number): number {
	const n = Math.floor(Number(v));
	if (!Number.isFinite(n) || n < 1) return def;
	return Math.min(n, max);
}

// ---------- kumpulan data (semuanya baca-saja) ----------

interface TxLite {
	id: string;
	total_final: number;
	status: string;
	payment_method: string;
	date: string;
}

async function txInRange(token: string, from: string, to: string): Promise<TxLite[]> {
	const pb = pbForUser(token);
	const all = (await pb.collection('transactions').getFullList({
		filter: buildTxFilter({ from, to }),
		sort: 'transaction_date',
		fields: 'id,total_final,status,payment_method,transaction_date',
		requestKey: null
	})) as any[];
	return all.map((t) => ({
		id: t.id,
		total_final: t.total_final ?? 0,
		status: t.status ?? '',
		payment_method: t.payment_method ?? '',
		date: String(t.transaction_date ?? '').slice(0, 10)
	}));
}

/**
 * Versi cepat fetchItemsGrouped untuk rentang besar (pertanyaan tahunan):
 * chunk diambil paralel (10 sekaligus) + payload ditrim via fields + sadar
 * deadline (berhenti lebih awal bila anggaran waktu habis).
 */
async function itemsCostGrouped(
	token: string,
	txIds: string[],
	ctx: ToolCtx
): Promise<Map<string, Array<{ qty: number; cost_price: number; product_name: string; final_price: number }>>> {
	const map = new Map<string, Array<{ qty: number; cost_price: number; product_name: string; final_price: number }>>();
	if (txIds.length === 0) return map;
	const pb = pbForUser(token);
	const CHUNK = 100;
	const CONCURRENCY = 10;
	const chunks: string[][] = [];
	for (let i = 0; i < txIds.length; i += CHUNK) chunks.push(txIds.slice(i, i + CHUNK));

	for (let i = 0; i < chunks.length; i += CONCURRENCY) {
		if (Date.now() > ctx.deadline) throw new Error('analisis melebihi anggaran waktu — persempit periode pertanyaan');
		const results = await Promise.all(
			chunks.slice(i, i + CONCURRENCY).map((chunk) =>
				pb.collection('transaction_items').getFullList({
					filter: chunk.map((id) => `transaction = "${pbEscape(id)}"`).join(' || '),
					fields: 'transaction,qty,cost_price,product_name,final_price',
					requestKey: null
				})
			)
		);
		for (const items of results) {
			for (const raw of items as any[]) {
				const list = map.get(raw.transaction) ?? [];
				list.push({
					qty: raw.qty ?? 0,
					cost_price: raw.cost_price ?? 0,
					product_name: raw.product_name ?? '',
					final_price: raw.final_price ?? 0
				});
				map.set(raw.transaction, list);
			}
		}
	}
	return map;
}

async function soldProductIds(token: string, from: string, to: string): Promise<Set<string>> {
	const pb = pbForUser(token);
	const completed = (await txInRange(token, from, to)).filter((t) => t.status === 'completed').map((t) => t.id);
	const ids = new Set<string>();
	const CHUNK = 100;
	for (let i = 0; i < completed.length; i += CHUNK) {
		const filter = completed.slice(i, i + CHUNK).map((id) => `transaction = "${pbEscape(id)}"`).join(' || ');
		const items = (await pb.collection('transaction_items').getFullList({ filter, fields: 'product', requestKey: null })) as any[];
		for (const it of items) if (it.product) ids.add(it.product);
	}
	return ids;
}

type ToolArgs = Record<string, unknown>;
interface ToolCtx {
	deadline: number;
}
type ToolFn = (token: string, args: ToolArgs, ctx: ToolCtx) => Promise<unknown>;

const TOOL_EXEC: Record<string, ToolFn> = {
	async sales_summary(token, args, ctx) {
		const { from, to } = clampRange(args.from, args.to);
		const txs = await txInRange(token, from, to);
		const itemsByTx = await itemsCostGrouped(token, txs.map((t) => t.id), ctx);
		const s = summarize(txs, itemsByTx);
		return { from, to, ...s, voided: txs.filter((t) => t.status === 'voided').length };
	},

	async top_products(token, args, ctx) {
		const { from, to } = clampRange(args.from, args.to);
		const limit = num(args.limit, 10, 20);
		const txs = (await txInRange(token, from, to)).filter((t) => t.status === 'completed');
		const itemsByTx = await itemsCostGrouped(token, txs.map((t) => t.id), ctx);
		const agg = new Map<string, { name: string; qty: number; omzet: number; modal: number }>();
		for (const tx of txs) {
			for (const it of itemsByTx.get(tx.id) ?? []) {
				const key = it.product_name || '(tanpa nama)';
				const a = agg.get(key) ?? { name: key, qty: 0, omzet: 0, modal: 0 };
				a.qty += it.qty ?? 0;
				a.omzet += it.final_price ?? 0;
				a.modal += (it.cost_price ?? 0) * (it.qty ?? 0);
				agg.set(key, a);
			}
		}
		const rows = Array.from(agg.values())
			.map((p) => ({ name: p.name, qty: p.qty, omzet: p.omzet, laba: p.omzet - p.modal }))
			.sort((a, b) => b.qty - a.qty)
			.slice(0, limit);
		return { from, to, rows };
	},

	async daily_sales(token, args) {
		const { from, to } = clampRange(args.from, args.to);
		const txs = (await txInRange(token, from, to)).filter((t) => t.status === 'completed');
		const perDay = new Map<string, { omzet: number; transactions: number }>();
		for (const tx of txs) {
			const b = perDay.get(tx.date) ?? { omzet: 0, transactions: 0 };
			b.omzet += tx.total_final;
			b.transactions += 1;
			perDay.set(tx.date, b);
		}
		return {
			from,
			to,
			days: Array.from(perDay.entries())
				.sort(([a], [b]) => (a < b ? -1 : 1))
				.map(([date, v]) => ({ date, ...v }))
		};
	},

	async payment_breakdown(token, args) {
		const { from, to } = clampRange(args.from, args.to);
		const txs = (await txInRange(token, from, to)).filter((t) => t.status === 'completed');
		const agg = new Map<string, { transactions: number; omzet: number }>();
		for (const tx of txs) {
			const key = tx.payment_method || 'lainnya';
			const a = agg.get(key) ?? { transactions: 0, omzet: 0 };
			a.transactions += 1;
			a.omzet += tx.total_final;
			agg.set(key, a);
		}
		return { from, to, methods: Array.from(agg.entries()).map(([method, v]) => ({ method, ...v })) };
	},

	async low_stock(token, args) {
		const limit = num(args.limit, 15, 30);
		const pb = pbForUser(token);
		const items = (await pb.collection('products').getFullList({
			filter: 'deleted != true && min_stock > 0 && stock <= min_stock',
			sort: 'stock',
			fields: 'name,barcode,stock,min_stock,sell_price'
		})) as any[];
		return { rows: items.slice(0, limit).map((p) => ({ name: p.name, barcode: p.barcode, stock: p.stock, min_stock: p.min_stock })) };
	},

	async dead_products(token, args) {
		const days = num(args.days, 30, 365);
		const limit = num(args.limit, 15, 30);
		const now = new Date();
		const to = dayKey(now);
		const from = dayKey(new Date(now.getTime() - days * 86_400_000));
		const pb = pbForUser(token);
		const [products, soldIds] = await Promise.all([
			pb.collection('products').getFullList({ filter: 'deleted != true', fields: 'id,name,stock' }),
			soldProductIds(token, from, to)
		]);
		const dead = (products as any[]).filter((p) => !soldIds.has(p.id));
		return {
			days,
			totalDead: dead.length,
			rows: dead.slice(0, limit).map((p) => ({ name: p.name, stock: p.stock }))
		};
	},

	async sales_by_cashier(token, args) {
		const { from, to } = clampRange(args.from, args.to);
		const pb = pbForUser(token);
		const all = (await pb.collection('transactions').getFullList({
			filter: buildTxFilter({ from, to }),
			expand: 'user'
		})) as any[];
		const agg = new Map<string, { kasir: string; transactions: number; omzet: number }>();
		for (const t of all) {
			if (t.status !== 'completed') continue;
			const name = t.expand?.user?.name || t.expand?.user?.email || '—';
			const a = agg.get(name) ?? { kasir: name, transactions: 0, omzet: 0 };
			a.transactions += 1;
			a.omzet += t.total_final ?? 0;
			agg.set(name, a);
		}
		return { from, to, rows: Array.from(agg.values()).sort((a, b) => b.omzet - a.omzet) };
	},

	async debt_summary(token) {
		const pb = pbForUser(token);
		const debts = (await pb.collection('debts').getFullList({
			filter: "status != 'paid'",
			expand: 'customer'
		})) as any[];
		const byCustomer = new Map<string, { customer: string; sisa: number; invoices: number }>();
		let totalSisa = 0;
		for (const d of debts) {
			const sisa = Math.max(0, (d.total ?? 0) - (d.paid ?? 0));
			if (sisa <= 0) continue;
			totalSisa += sisa;
			const name = d.expand?.customer?.name ?? '—';
			const a = byCustomer.get(name) ?? { customer: name, sisa: 0, invoices: 0 };
			a.sisa += sisa;
			a.invoices += 1;
			byCustomer.set(name, a);
		}
		return {
			totalSisa,
			customers: Array.from(byCustomer.values()).sort((a, b) => b.sisa - a.sisa).slice(0, 20)
		};
	},

	async product_lookup(token, args) {
		const q = String(args.q ?? '').trim().slice(0, 60);
		if (!q) return { rows: [], note: 'kata kunci kosong' };
		const pb = pbForUser(token);
		const items = await pb.collection('products').getList(1, 10, {
			filter: `(name ~ "${pbEscape(q)}" || barcode ~ "${pbEscape(q)}") && deleted != true`,
			fields: 'name,barcode,sell_price,cost_price,stock,min_stock'
		});
		return { rows: items.items };
	}
};

// ---------- skema tools (format OpenAI) ----------

const dateProp = { type: 'string', description: 'Tanggal YYYY-MM-DD (opsional)' };

const TOOLS = [
	{ type: 'function', function: { name: 'sales_summary', description: 'Ringkasan omzet, modal, laba kotor, jumlah transaksi (completed) pada rentang tanggal. Untuk pertanyaan omzet/laba/berapa transaksi.', parameters: { type: 'object', properties: { from: dateProp, to: dateProp }, required: [] } } },
	{ type: 'function', function: { name: 'top_products', description: 'Produk terlaris pada rentang tanggal, diurutkan qty terjual, termasuk omzet & laba per produk.', parameters: { type: 'object', properties: { from: dateProp, to: dateProp, limit: { type: 'number', description: 'jumlah baris, default 10, maks 20' } }, required: [] } } },
	{ type: 'function', function: { name: 'daily_sales', description: 'Omzet dan jumlah transaksi per hari pada rentang tanggal.', parameters: { type: 'object', properties: { from: dateProp, to: dateProp }, required: [] } } },
	{ type: 'function', function: { name: 'payment_breakdown', description: 'Omzet dan jumlah transaksi per metode pembayaran (cash/qris/debit/ewallet).', parameters: { type: 'object', properties: { from: dateProp, to: dateProp }, required: [] } } },
	{ type: 'function', function: { name: 'low_stock', description: 'Produk dengan stok di bawah / sama dengan ambang minimum.', parameters: { type: 'object', properties: { limit: { type: 'number' } }, required: [] } } },
	{ type: 'function', function: { name: 'dead_products', description: 'Produk aktif yang TIDAK terjual sama sekali dalam N hari terakhir (dead stock).', parameters: { type: 'object', properties: { days: { type: 'number', description: 'default 30' }, limit: { type: 'number' } }, required: [] } } },
	{ type: 'function', function: { name: 'sales_by_cashier', description: 'Omzet dan jumlah transaksi per kasir pada rentang tanggal.', parameters: { type: 'object', properties: { from: dateProp, to: dateProp }, required: [] } } },
	{ type: 'function', function: { name: 'debt_summary', description: 'Total piutang dan daftar customer yang masih berhutang.', parameters: { type: 'object', properties: {}, required: [] } } },
	{ type: 'function', function: { name: 'product_lookup', description: 'Cari produk berdasarkan nama/barcode: harga jual, harga modal, stok.', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } } }
];

// ---------- panggil LLM ----------

async function buildSystemPrompt(token: string): Promise<string> {
	const storeName = await getSetting(token, 'store_name', 'OpenPOS');
	return [
		`Kamu adalah "Asisten AI" di dalam aplikasi kasir OpenPOS milik toko "${storeName}".`,
		`Tanggal hari ini: ${dayKey(new Date())} (zona waktu server). "Bulan ini" = dari tanggal 1 bulan berjalan sampai hari ini.`,
		'',
		'ATURAN WAJIB:',
		'1. TOPIK KAMU TERBATAS: kamu HANYA menjawab seputar toko ini dan data POS-nya — penjualan, omzet, laba, produk, stok, hutang/piutang, customer, kasir, laporan, serta cara memakai aplikasi OpenPOS.',
		'2. Pertanyaan di LUAR topik itu (pengetahuan umum, teknologi/programming, berita, matematika sekadar, dll.) WAJIB ditolak singkat dan sopan — katakan kamu hanya bisa membantu soal data toko, lalu tawarkan 1–2 contoh pertanyaan yang bisa kamu jawab. Jangan dijawab walau kamu tahu jawabannya.',
		'3. Kamu READ-ONLY: tidak bisa dan tidak boleh mengubah/menghapus data apa pun. Jika diminta aksi tulis (hapus produk, void nota, ubah harga, dsb.), tolak dengan sopan dan arahkan ke menu aplikasi yang sesuai.',
		'4. SEMUA angka harus berasal dari hasil tool. Jangan pernah mengarang atau menebak angka.',
		'5. Jawab ringkas dan padat dalam bahasa yang dipakai user (default Bahasa Indonesia). Format rupiah dengan pemisah ribuan.',
		'6. Untuk pertanyaan kompleks, panggil beberapa tool sekaligus dalam satu giliran.',
	'',
	'PANDUAN MEMILIH TOOL (istilah umum):',
	'- "untung/laba" → sales_summary (laba = laba kotor). "omzet/penjualan/pendapatan" → sales_summary (omzet).',
	'- "paling laku/terlaris/banyak terjual" → top_products. "tidak pernah terjual/macet" → dead_products.',
	'- "tahun 2026" → from=2026-01-01 to=2026-12-31 (satu tahun penuh). "bulan ini" → tanggal 1 s/d hari ini. "minggu ini" → 7 hari terakhir.',
	'- "hari ini" → from=to=hari ini. "kemarin" → hari sebelumnya. "bulan lalu" → bulan kalender sebelumnya.',
	'- "hutang/piutang/belum bayar" → debt_summary. "kasir/pegawai" → sales_by_cashier. "QRIS/tunai/debit" → payment_breakdown.',
	'- Pertanyaan per-bandringan periode (mis. bulan ini vs bulan lalu) → panggil tool yang sama dua kali dengan rentang berbeda.'
	].join('\n');
}

/**
 * Parser toleran untuk respons provider. Beberapa proxy menempel artefak
 * streaming di respons non-stream, mis. `{...json...}data: [DONE]` — buang
 * sampahnya lalu parse; kalau tetap gagal, ambil objek JSON pertama yang seimbang.
 */
function parseLlmResponse(raw: string): any {
	let s = raw.trim();
	if (s.startsWith('data:')) {
		s = s
			.split('\n')
			.map((l) => l.replace(/^data:\s*/, '').trim())
			.join('');
	}
	if (s.endsWith('data: [DONE]')) s = s.slice(0, -'data: [DONE]'.length).trim();
	try {
		return JSON.parse(s);
	} catch {
		const start = s.indexOf('{');
		if (start === -1) throw new Error('Respons AI bukan JSON');
		let depth = 0;
		let inStr = false;
		let esc = false;
		for (let i = start; i < s.length; i++) {
			const c = s[i];
			if (inStr) {
				if (esc) esc = false;
				else if (c === '\\') esc = true;
				else if (c === '"') inStr = false;
				continue;
			}
			if (c === '"') inStr = true;
			else if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) return JSON.parse(s.slice(start, i + 1));
			}
		}
		throw new Error('Respons AI tidak lengkap');
	}
}

async function callLlm(messages: LlmMessage[]): Promise<any> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
			body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto' }),
			signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
		});
		if (res.ok) {
			const data = parseLlmResponse(await res.text());
			return data.choices?.[0]?.message;
		}
		const detail = await res.text().catch(() => '');
		// 429 = kuota provider habis → ulangi dengan jeda (proxy biasanya reset cepat)
		if (res.status === 429 && attempt < RATE_LIMIT_RETRIES.length) {
			await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRIES[attempt]));
			continue;
		}
		if (res.status === 429) {
			const reset = /reset[^\d"]*([\d-]+ [\d:]+)/i.exec(detail)?.[1];
			throw new AiRateLimitedError(reset ? `Kuota model AI sedang habis (reset ± ${reset}). Coba lagi sesudah itu.` : 'Kuota model AI sedang habis, coba lagi beberapa menit lagi.');
		}
		throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`);
	}
}

/** Jalankan satu sesi tanya-jawab. Hanya baca — tidak pernah menulis ke database. */
export async function runAiChat(history: AiChatMessage[], token: string): Promise<{ reply: string }> {
	if (!API_KEY) throw new AiNotConfiguredError();

	const deadline = Date.now() + TOOL_BUDGET_MS;
	const convo: LlmMessage[] = [
		{ role: 'system', content: await buildSystemPrompt(token) },
		...history.slice(-12)
	];

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const msg = await callLlm(convo);
		if (!msg) throw new Error('Respons AI kosong');

		if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
			convo.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
			for (const tc of msg.tool_calls) {
				let result: unknown;
				if (Date.now() > deadline) {
					result = { error: 'anggaran waktu analisis habis — jawab pertanyaan user dengan data yang sudah terkumpul, dan sebutkan bahwa analisis dibatasi waktu' };
				} else {
					try {
						const args = JSON.parse(tc.function?.arguments || '{}');
						const fn = TOOL_EXEC[tc.function?.name];
						result = fn ? await fn(token, args, { deadline }) : { error: `Tool tidak dikenal: ${tc.function?.name}` };
					} catch (err) {
						console.error(`[ai-chat][tool] ${tc.function?.name} gagal:`, err);
						result = { error: err instanceof Error ? err.message : 'tool gagal' };
					}
				}
				convo.push({
					role: 'tool',
					tool_call_id: tc.id,
					content: JSON.stringify(result).slice(0, TOOL_RESULT_MAX_CHARS)
				});
			}
			continue;
		}

		return { reply: (msg.content ?? '').trim() || '(tanpa jawaban)' };
	}

	return { reply: 'Saya belum selesai menganalisis (terlalu banyak langkah). Coba pertanyaan yang lebih spesifik.' };
}
