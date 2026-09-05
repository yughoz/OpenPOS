<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import SendIcon from '@lucide/svelte/icons/send';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import BotIcon from '@lucide/svelte/icons/bot';
	import * as m from '$lib/paraglide/messages.js';

	interface ChatMsg {
		role: 'user' | 'assistant';
		content: string;
	}

	marked.setOptions({ gfm: true, breaks: true, async: false });

	/** Jawaban asisten dirender sebagai Markdown (tabel, bold, list) — disanitasi dulu. */
	function renderMd(text: string): string {
		const html = marked.parse(text, { async: false }) as string;
		return DOMPurify.sanitize(html);
	}

	let { data } = $props<{ data: { user: { name: string } } }>();

	let STORAGE_KEY = 'openpos_ai_chat';
	let messages = $state<ChatMsg[]>([]);
	let restored = false;
	let input = $state('');
	let sending = $state(false);
	let listEl = $state<HTMLElement | null>(null);
	let scanEl = $state<HTMLInputElement | null>(null);

	// memory: percakapan disimpan di localStorage sehingga tidak hilang saat refresh
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
			if (Array.isArray(saved) && saved.length > 0) messages = saved;
		} catch {
			/* abaikan storage rusak */
		}
		restored = true;
		scanEl?.focus();
	});
	$effect(() => {
		if (restored) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80)));
	});

	const suggestions = [
		m['chat.s1'](),
		m['chat.s2'](),
		m['chat.s3'](),
		m['chat.s4']()
	];

	// auto-scroll ke bawah tiap ada pesan baru
	$effect(() => {
		void messages.length;
		void sending;
		tick().then(() => listEl?.scrollTo({ top: listEl.scrollHeight }));
	});

	async function send(text?: string) {
		const q = (text ?? input).trim();
		if (!q || sending) return;
		input = '';
		messages.push({ role: 'user', content: q });
		sending = true;
		try {
			const res = await fetch('/app/ai-chat/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) })
			});
			const data = await res.json();
			messages.push({ role: 'assistant', content: data.reply ?? data.error ?? m['chat.error']() });
		} catch {
			messages.push({ role: 'assistant', content: m['chat.error_network']() });
		} finally {
			sending = false;
			tick().then(() => scanEl?.focus());
		}
	}
</script>

<svelte:head>
	<title>{m['chat.title']()} — OpenPOS</title>
</svelte:head>

<div class="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-col">
	<!-- header ringkas -->
	<div class="flex shrink-0 items-center justify-between gap-3 pb-3">
		<div class="flex items-center gap-2">
			<div class="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
				<SparklesIcon class="size-4" />
			</div>
			<div>
				<h1 class="text-sm font-semibold leading-tight">{m['chat.title']()}</h1>
				<p class="text-xs text-muted-foreground">
					{m['chat.description']()}
					<span class="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium">{m['chat.readonly']()}</span>
				</p>
			</div>
		</div>
		{#if messages.length > 0}
			<Button variant="ghost" size="sm" onclick={() => messages.splice(0)} title={m['chat.clear']()}>
				<Trash2Icon class="mr-1 size-3.5" />
				{m['chat.clear']()}
			</Button>
		{/if}
	</div>

	<!-- area pesan: mengisi seluruh sisa tinggi -->
	<div bind:this={listEl} class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2">
		{#if messages.length === 0}
			<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
				<div class="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
					<SparklesIcon class="size-7" />
				</div>
				<div class="max-w-md space-y-1">
					<p class="font-medium">{m['chat.welcome']()}</p>
					<p class="text-sm text-muted-foreground">{data.user.name}, {m['chat.description']()}</p>
				</div>
				<div class="flex flex-wrap justify-center gap-2 pt-2">
					{#each suggestions as s (s)}
						<button
							class="rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => send(s)}
						>
							{s}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			{#each messages as msg, i (i)}
				<div class="flex gap-2.5 {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
					{#if msg.role === 'assistant'}
						<div class="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
							<BotIcon class="size-4" />
						</div>
					{/if}
					<div
						class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm {msg.role === 'user'
							? 'whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground'
							: 'overflow-x-auto rounded-bl-sm bg-muted'}"
					>
						{#if msg.role === 'assistant'}
							<div class="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-table:my-2 prose-pre:my-2 [&_table]:text-xs">
								{@html renderMd(msg.content)}
							</div>
						{:else}
							{msg.content}
						{/if}
					</div>
				</div>
			{/each}
			{#if sending}
				<div class="flex items-center gap-2.5 text-sm text-muted-foreground">
					<div class="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
						<BotIcon class="size-4" />
					</div>
					<span class="animate-pulse">{m['chat.thinking']()}</span>
				</div>
			{/if}
		{/if}
	</div>

	<!-- input: pill menempel di bawah -->
	<form
		class="flex shrink-0 items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm"
		onsubmit={(e) => {
			e.preventDefault();
			send();
		}}
	>
		<!-- Enter mengirim; preventDefault supaya tidak dobel dengan submit form.
			isComposing: jangan mengirim saat IME (mis. Enter untuk konfirmasi saran). -->
		<Input
			bind:ref={scanEl}
			bind:value={input}
			placeholder={m['chat.placeholder']()}
			maxlength={4000}
			disabled={sending}
			class="border-0 bg-transparent shadow-none focus-visible:ring-0"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.isComposing) {
					e.preventDefault();
					send();
				}
			}}
		/>
		<Button type="submit" size="icon" class="size-9 shrink-0 rounded-xl" disabled={sending || !input.trim()} title={m['chat.send']()}>
			<SendIcon class="size-4" />
		</Button>
	</form>
</div>
