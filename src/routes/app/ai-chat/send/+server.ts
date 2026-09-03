import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guard';
import { runAiChat, AiNotConfiguredError, AiRateLimitedError, type AiChatMessage } from '$lib/server/ai';



/** Endpoint tanya-jawab asisten AI. Read-only: tidak ada aksi tulis sama sekali di sini. */
export const POST = async ({ request, locals }) => {
	requireAdmin(locals.user, '/app/ai-chat');

	let body: { messages?: Array<{ role?: string; content?: string }> };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body tidak valid' }, { status: 400 });
	}

	const messages: AiChatMessage[] = (body.messages ?? [])
		.filter(
			(m): m is { role: 'user' | 'assistant'; content: string } =>
				(m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0
		)
		.slice(-12)
		.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

	if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
		return json({ error: 'Pertanyaan kosong' }, { status: 400 });
	}

	try {
		return json(await runAiChat(messages, locals.token!));
	} catch (err) {
		if (err instanceof AiNotConfiguredError) {
			return json({ error: 'Asisten AI belum dikonfigurasi — isi OPENAI_API_KEY di file .env server.' }, { status: 503 });
		}
		if (err instanceof AiRateLimitedError) {
			return json({ error: err.message }, { status: 429 });
		}
		console.error('[ai-chat]', err);
		return json({ error: 'Asisten AI sedang bermasalah, coba lagi sebentar.' }, { status: 502 });
	}
};
