<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import * as Separator from '$lib/components/ui/separator';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import SaveIcon from '@lucide/svelte/icons/save';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import XIcon from '@lucide/svelte/icons/x';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber, formatRupiah } from '$lib/utils';
	import { currency } from '$lib/currency.svelte';
	import type { CartSnapshot } from '$lib/server/pos';
	import type { OptionItem } from '$lib/types';

	interface ProductLite {
		id: string;
		name: string;
		barcode: string;
		sell_price: number;
		wholesale_price: number;
		stock: number;
	}

	let { data } = $props<{
		data: {
			cart: CartSnapshot | null;
			held: Array<{ id: string; code: string; items_count: number; total_final: number }>;
			customers: { items: OptionItem[] };
			customerDebt: number;
			txParam: string;
		};
	}>();

	const NONE = '__none__';

	// form tambah item
	let term = $state('');
	let qty = $state('1');
	let mode = $state<'retail' | 'wholesale'>('retail');
	let scanEl = $state<HTMLInputElement | null>(null);
	let paidEl = $state<HTMLInputElement | null>(null);
	let scanFormEl = $state<HTMLFormElement | null>(null);
	let suggestionIdx = $state(-1);

	// pembayaran
	let method = $state<'cash' | 'qris' | 'debit' | 'ewallet'>('cash');
	let paid = $state('');
	let payFormEl = $state<HTMLFormElement | null>(null);
	let printNext = $state('0');

	// customer picker (searchable) — pilih langsung tersimpan otomatis
	let customerSearch = $state('');
	let customerPickId = $state('');
	let customerOpen = $state(false);
	let customerFormEl = $state<HTMLFormElement | null>(null);

	const cart = $derived(data.cart);
	const totalFinal = $derived(cart?.total_final ?? 0);

	// sinkronkan picker dengan data server: kalau customer dihapus/diubah
	// di master data, pilihan lama tidak akan nyangkut
	$effect(() => {
		const id = cart?.customer ?? '';
		customerPickId = id;
		customerSearch = id
			? (data.customers.items.find((c: OptionItem) => c.id === id)?.name ?? '')
			: '';
		customerOpen = false;
	});

	const customerMatches = $derived.by(() => {
		const t = customerSearch.trim().toLowerCase();
		const list = data.customers.items;
		if (!t) return list.slice(0, 8);
		return list.filter((c: OptionItem) => c.name.toLowerCase().includes(t)).slice(0, 8);
	});
	const cartCustomerName = $derived(
		data.customers.items.find((c: OptionItem) => c.id === cart?.customer)?.name ?? ''
	);

	function submitCustomer() {
		if (!cart) return;
		tick().then(() => customerFormEl?.requestSubmit());
	}
	function chooseCustomer(c: OptionItem) {
		customerPickId = c.id;
		customerSearch = c.name;
		customerOpen = false;
		submitCustomer();
	}
	function clearCustomer() {
		customerPickId = '';
		customerSearch = '';
		customerOpen = false;
		submitCustomer();
	}
	function addPaid(v: number) {
		paid = String((Number(paid) || 0) + v);
	}
	function submitCheckout(withPrint: boolean) {
		printNext = withPrint ? '1' : '0';
		tick().then(() => payFormEl?.requestSubmit());
	}
	const totalBayar = $derived(totalFinal + data.customerDebt);
	const paidNum = $derived(method === 'cash' ? Number(paid) || 0 : totalBayar);
	const changeNum = $derived(paidNum - totalBayar);

	let suggestions = $state<ProductLite[]>([]);
	let suggestSeq = 0;
	let suggestTimer: ReturnType<typeof setTimeout> | null = null;

	async function loadSuggestions(t: string) {
		const seq = ++suggestSeq;
		try {
			const res = await fetch(`/app/pos/suggest?q=${encodeURIComponent(t)}`);
			const items = (await res.json()) as ProductLite[];
			// buang hasil basi: input sudah berubah/dikosongkan sejak fetch dikirim
			if (seq === suggestSeq && term.trim() === t) suggestions = items;
		} catch {
			if (seq === suggestSeq && term.trim() === t) suggestions = [];
		}
	}

	/** Tutup list + batalkan fetch yang masih di-flight (mencegah list muncul lagi setelah scan). */
	function clearSuggestions() {
		if (suggestTimer) clearTimeout(suggestTimer);
		suggestTimer = null;
		suggestSeq++;
		suggestionIdx = -1;
		suggestions = [];
	}

	function onTermInput() {
		const t = term.trim();
		if (!t) {
			clearSuggestions();
			return;
		}
		if (suggestTimer) clearTimeout(suggestTimer);
		suggestionIdx = -1;
		suggestTimer = setTimeout(() => loadSuggestions(t), 200);
	}

	async function chooseSuggestion(p: ProductLite) {
		term = p.barcode || p.name;
		clearSuggestions();
		// pastikan nilai baru sudah tercetak ke <input> sebelum form disubmit,
		// kalau tidak yang kekirim malah teks ketikan lama (mis. "ber")
		await tick();
		scanFormEl?.requestSubmit();
	}

	function onScanKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			// Enter diproses eksplisit (implicit submission tidak selalu terpicu di semua browser)
			e.preventDefault();
			if (suggestionIdx >= 0) chooseSuggestion(suggestions[suggestionIdx]);
			else scanFormEl?.requestSubmit();
			return;
		}
		if (suggestions.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			suggestionIdx = (suggestionIdx + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			suggestionIdx = (suggestionIdx - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Escape') {
			suggestionIdx = -1;
		}
	}

	function customerLabel(id: string): string {
		if (!id) return '';
		return data.customers.items.find((c: OptionItem) => c.id === id)?.name ?? '';
	}

	const methodLabel: Record<string, string> = {
		cash: m['pos.method_cash'](),
		qris: m['pos.method_qris'](),
		debit: m['pos.method_debit'](),
		ewallet: m['pos.method_ewallet']()
	};

	function err(result: { type: string; data?: unknown }) {
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['pos.fail']()));
			return true;
		}
		return false;
	}

	const addEnhance = (): SubmitFunction => {
		return (inp) =>
			async ({ update, result }) => {
				const d = ((result as any).data ?? {}) as {
					success?: boolean;
					txId?: string;
					isNew?: boolean;
					error?: string;
				};
				if (result.type === 'failure') {
					toast.error(d.error ?? m['pos.fail_add']());
					await tick();
					scanEl?.focus();
					return;
				}
				term = '';
				qty = '1';
				// batalkan fetch suggest yang masih di-flight supaya list tidak muncul lagi
				clearSuggestions();
				// nota BARU dibuat (setelah Hold / layar kosong) → pindah ke nota itu.
				// tambahan ke nota yang sama → cukup invalidate data.
				if (result.type === 'success' && d.isNew && d.txId) {
					await goto(`/app/pos?tx=${d.txId}`, { replaceState: true });
				} else {
					await update({ reset: false });
				}
				// fokus dikembalikan SETELAH semua re-render selesai (scan berikutnya langsung bisa)
				await tick();
				scanEl?.focus();
			};
	};

	const rowEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			err(result);
		};

	const removeEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			err(result);
		};

	const customerEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (!err(result)) toast.success(m['pos.customer_saved']());
		};

	const discountEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (!err(result)) toast.success(m['pos.discount_saved']());
		};

	const checkoutEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (!err(result)) {
				const d = (result as any).data ?? {};
				paid = '';
				method = 'cash';
				if (d.receipt) {
					toast.success(m['pos.done_toast']({ change: formatRupiah(d.change ?? 0) }));
					if (printNext === '1') await goto(`/app/pos/receipt/${d.receipt}?print=1`, { replaceState: true });
					else await goto('/app/pos?tx=none', { replaceState: true });
				}
			}
			// transaksi baru selesai — langsung siap scan berikutnya
			await tick();
			scanEl?.focus();
		};

	const heldVoidEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['pos.fail_remove']()));
			} else {
				toast.success(m['pos.held_void_success']());
			}
		};

	const voidEnhance = (): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (!err(result)) {
				toast.success(m['pos.void_success']());
				goto('/app/pos?tx=none');
			}
		};

	function hold() {
		if (!cart) return;
		goto('/app/pos?tx=none');
	}

	function handleKey(e: KeyboardEvent) {
		handleGlobalScan(e);
		if (e.key === 'F2') {
			e.preventDefault();
			scanEl?.focus();
		} else if (e.key === 'F4') {
			e.preventDefault();
			paidEl?.focus();
		}
	}

	// ---- tangkap scan barcode GLOBAL ----
	// Scanner nyata mengetik 10-50ms per karakter (manusia >150ms dan hampir
	// selalu berjeda mikir). Kolom uang (paidEl) dikecualikan — ketikan + Enter
	// di sana berarti pembayaran.
	const SCAN_GAP_MS = 150;
	const SCAN_MIN_LEN = 5;
	let scanBuf = '';
	let scanBufLast = 0;
	let scanBufQty = '1';

	function handleGlobalScan(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t === scanEl) return; // input scan punya alur sendiri (suggest + Enter)
		if (t === paidEl) {
			scanBuf = '';
			return;
		}
		if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'Tab') return;

		const now = Date.now();
		if (e.key === 'Enter') {
			const code = scanBuf;
			const isScan = code.length >= SCAN_MIN_LEN && now - scanBufLast <= SCAN_GAP_MS * 3;
			scanBuf = '';
			if (!isScan) return;
			e.preventDefault();
			qty = scanBufQty; // buang sampai karakter barcode yang nyasar di kolom qty
			term = code;
			suggestionIdx = -1;
			tick().then(() => scanFormEl?.requestSubmit());
			return;
		}
		if (e.key.length !== 1) {
			scanBuf = '';
			return;
		}
		if (!scanBuf || now - scanBufLast > SCAN_GAP_MS) {
			scanBuf = '';
			scanBufQty = qty; // simpan qty sebelum scan (mis. kasir sengaja set qty 5)
		}
		scanBuf += e.key;
		scanBufLast = now;
	}
</script>

<svelte:head>
	<title>{m['pos.title']()} — OpenPOS</title>
</svelte:head>

<svelte:window onkeydown={handleKey} />

<div class="flex w-full flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{m['pos.h1']()}</h1>
			<p class="text-sm text-muted-foreground">
				{#if cart}
					{m['pos.cart_nota']({ code: cart.code })}
				{:else}
					{m['pos.cart_empty_hint']()}
				{/if}
			</p>
		</div>
		{#if cart && cart.items.length > 0}
			<div class="flex gap-2">
				<Button variant="outline" onclick={hold} title={m['pos.hold_title']()}>
					<PauseIcon class="mr-1 size-4" />
					{m['pos.hold']()}
				</Button>
				<form method="POST" action="?/void" use:enhance={voidEnhance()}
					onsubmit={(e) => {
						if (!confirm(m['pos.void_confirm']())) e.preventDefault();
					}}
				>
					<input type="hidden" name="tx_id" value={cart.id} />
					<Button variant="outline" type="submit" class="text-destructive">
						<XIcon class="mr-1 size-4" />
						{m['pos.cancel']()}
					</Button>
				</form>
			</div>
		{/if}
	</div>

	<div class="grid gap-4 xl:grid-cols-3">
		<!-- ================= kolom kiri: scan + items ================= -->
		<div class="flex flex-col gap-4 xl:col-span-2">
			<form
				method="POST"
				action="?/add"
				use:enhance={addEnhance()}
				bind:this={scanFormEl}
				class="flex flex-wrap items-center gap-2"
			>
				<input type="hidden" name="tx_id" value={cart?.id ?? 'new'} />
				<div class="relative min-w-48 flex-1">
					<Input
						bind:ref={scanEl}
						bind:value={term}
						name="term"
						placeholder={m['pos.scan_placeholder']()}
						class="w-full"
						autocomplete="off"
						required
						onkeydown={onScanKeydown}
						oninput={onTermInput}
					/>
					{#if suggestions.length > 0}
						<div class="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
							{#each suggestions as p, i (p.id)}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm {i === suggestionIdx ? 'bg-accent' : ''} hover:bg-accent"
									onmousedown={(e) => {
										e.preventDefault();
										chooseSuggestion(p);
									}}
									onmouseenter={() => (suggestionIdx = i)}
								>
									<span class="truncate">
										{#if p.barcode}<span class="mr-2 font-mono text-xs text-muted-foreground">{p.barcode}</span>{/if}
										{p.name}
									</span>
									<span class="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
										{formatRupiah(p.sell_price)} · {m['pos.stock_n']({ n: p.stock })}
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<Input bind:value={qty} name="qty" type="number" min="1" class="w-20" title={m['pos.qty_title']()} />
				<input type="hidden" name="mode" value={mode} />
				<Select.Root type="single" bind:value={mode}>
					<Select.Trigger class="w-32" title={m['pos.price_title']()}>
						{mode === 'wholesale' ? m['pos.price_wholesale']() : m['pos.price_normal']()}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="retail" label={m['pos.price_normal']()} />
						<Select.Item value="wholesale" label={m['pos.price_wholesale']()} />
					</Select.Content>
				</Select.Root>
				<Button type="submit">{m['pos.add']()}</Button>
			</form>

			<div class="rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m['pos.col_product']()}</Table.Head>
							<Table.Head class="w-20 text-right">{m['pos.col_qty']()}</Table.Head>
							<Table.Head class="w-28 text-right">{m['pos.col_price']()}</Table.Head>
							<Table.Head class="w-24 text-right">{m['pos.col_discount']()}</Table.Head>
							<Table.Head class="w-28 text-right">{m['pos.col_total']()}</Table.Head>
							<Table.Head class="w-16"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each cart?.items ?? [] as item (item.id)}
							<Table.Row>
								<Table.Cell class="p-0">
									<form id="edit-{item.id}" method="POST" action="?/updateItem" use:enhance={rowEnhance()} class="hidden">
										<input type="hidden" name="item_id" value={item.id} />
									</form>
									<div class="px-2 py-1.5 font-medium">
										{item.product_name}
										{#if item.qty > item.stock}
											<span class="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">{m['pos.stock_n']({ n: item.stock })}</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="w-20 p-1">
									<Input form="edit-{item.id}" name="qty" value={String(item.qty)} type="number" min="1" class="w-full text-right" />
								</Table.Cell>
								<Table.Cell class="w-28 p-1">
									<Input form="edit-{item.id}" name="sell_price" value={String(item.sell_price)} type="number" min="0" class="w-full text-right" />
								</Table.Cell>
								<Table.Cell class="w-24 p-1">
									<Input form="edit-{item.id}" name="discount" value={String(item.discount)} type="number" min="0" class="w-full text-right" />
								</Table.Cell>
								<Table.Cell class="w-28 p-1 text-right font-semibold tabular-nums">{formatNumber(item.final_price)}</Table.Cell>
								<Table.Cell class="w-16 p-1">
									<div class="flex justify-end gap-0.5">
										<Button form="edit-{item.id}" variant="ghost" size="icon" type="submit" class="size-7" title={m['pos.save_row']()}>
											<SaveIcon class="size-3.5" />
										</Button>
										<form method="POST" action="?/removeItem" use:enhance={removeEnhance()}>
											<input type="hidden" name="item_id" value={item.id} />
											<Button variant="ghost" size="icon" type="submit" class="size-7 text-destructive" title={m['pos.remove_item']()}>
												<Trash2Icon class="size-3.5" />
											</Button>
										</form>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={6} class="py-12 text-center text-muted-foreground">
									{m['pos.cart_empty']()}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			{#if data.held.length > 0}
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-base">{m['pos.held_title']()}</CardTitle>
						<CardDescription>{m['pos.held_desc']()}</CardDescription>
					</CardHeader>
					<CardContent class="flex flex-wrap gap-2">
						{#each data.held as h (h.id)}
							<div class="flex items-center gap-0.5 rounded-lg border pl-0.5 pr-0.5">
								<button
									class="px-3 py-1.5 text-left text-sm hover:bg-accent"
									onclick={() => goto(`/app/pos?tx=${h.id}`)}
								>
									<span class="font-mono text-xs">{h.code}</span>
									<span class="ml-2 text-muted-foreground">{m['common.items']({ n: h.items_count })}</span>
									<span class="ml-2 font-semibold tabular-nums">{formatNumber(h.total_final)}</span>
								</button>
								<form
									method="POST"
									action="?/void"
									use:enhance={heldVoidEnhance()}
									onsubmit={(e) => {
										if (!confirm(m['pos.held_discard_confirm']({ code: h.code }))) e.preventDefault();
									}}
								>
									<input type="hidden" name="tx_id" value={h.id} />
									<Button variant="ghost" size="icon" type="submit" class="size-7 text-destructive" title={m['pos.held_discard']()}>
										<Trash2Icon class="size-3.5" />
									</Button>
								</form>
							</div>
						{/each}
					</CardContent>
				</Card>
			{/if}
		</div>

		<!-- ================= kolom kanan: ringkasan + pembayaran ================= -->
		<div class="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
			<Card>
				<CardContent class="flex flex-col gap-2.5 p-4">
					<!-- customer -->
					<form
						method="POST"
						action="?/setCustomer"
						use:enhance={customerEnhance()}
						bind:this={customerFormEl}
						class="flex flex-col gap-1"
					>
						<input type="hidden" name="tx_id" value={cart?.id ?? ''} />
						<input type="hidden" name="customer_id" value={customerPickId} />
						<div class="relative grid flex-1 gap-1">
							<Label class="text-xs">{m['pos.customer']()}</Label>
							<div class="relative">
								<Input
									value={customerSearch || cartCustomerName}
									onfocus={() => (customerOpen = true)}
									oninput={(e) => {
										const el = e.currentTarget as HTMLInputElement;
										customerSearch = el.value;
										customerPickId = '';
										customerOpen = true;
									}}
									placeholder={m['pos.customer_search']()}
									class="h-8 w-full pr-8"
									autocomplete="off"
								/>
								{#if customerOpen}
									<div class="absolute top-full left-0 z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border bg-popover shadow-md">
										<button
											type="button"
											class="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
											onmousedown={(e) => {
												e.preventDefault();
												clearCustomer();
											}}
										>
											{m['pos.no_customer']()}
										</button>
										{#each customerMatches as c (c.id)}
											<button
												type="button"
												class="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent {customerPickId === c.id ? 'bg-accent' : ''}"
												onmousedown={(e) => {
													e.preventDefault();
													chooseCustomer(c);
												}}
											>
												{c.name}
											</button>
										{:else}
											<div class="px-3 py-1.5 text-sm text-muted-foreground">{m['pos.not_found']()}</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</form>

					<!-- diskon -->
					<form method="POST" action="?/setDiscount" use:enhance={discountEnhance()} class="flex items-end gap-2">
						<input type="hidden" name="tx_id" value={cart?.id ?? ''} />
						<div class="grid flex-1 gap-1">
							<Label class="text-xs" for="discount">{m['pos.discount_label']({ symbol: currency.symbol })}</Label>
							<Input id="discount" name="discount" type="number" min="0" value={String(cart?.total_discount ?? 0)} disabled={!cart} class="h-8" />
						</div>
						<Button type="submit" variant="outline" size="sm" class="h-8" disabled={!cart}>{m['pos.apply']()}</Button>
					</form>

					<Separator.Root class="bg-border h-px" />

					<div class="flex justify-between text-xs text-muted-foreground">
						<span>{m['pos.subtotal']()}</span>
						<span class="tabular-nums">{formatNumber(cart?.total_gross ?? 0)}</span>
					</div>
					{#if data.customerDebt > 0}
						<div class="flex justify-between text-xs text-amber-700 dark:text-amber-400">
							<span>{m['pos.debt_of']({ name: cartCustomerName })}</span>
							<span class="tabular-nums">+{formatRupiah(data.customerDebt)}</span>
						</div>
					{/if}
					{#if (cart?.total_discount ?? 0) > 0}
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>{m['pos.discount']()}</span>
							<span class="tabular-nums">−{formatNumber(cart?.total_discount ?? 0)}</span>
						</div>
					{/if}
					<div class="flex justify-between text-base font-bold">
						<span>{m['pos.total_pay']()}</span>
						<span class="tabular-nums">{formatRupiah(totalBayar)}</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<form method="POST" action="?/checkout" use:enhance={checkoutEnhance()} bind:this={payFormEl} class="flex flex-col gap-2 p-4">
					<input type="hidden" name="tx_id" value={cart?.id ?? ''} />
					<input type="hidden" name="paid" value={String(paidNum)} />
					<input type="hidden" name="method" value={method} />
					<input type="hidden" name="print" value={printNext} />
					<div class="grid grid-cols-2 gap-2">
						<div class="grid gap-1">
							<Label class="text-xs">{m['pos.method']()}</Label>
							<Select.Root type="single" bind:value={method}>
								<Select.Trigger class="w-full">{methodLabel[method]}</Select.Trigger>
								<Select.Content>
									<Select.Item value="cash" label={m['pos.method_cash']()} />
									<Select.Item value="qris" label={m['pos.method_qris']()} />
									<Select.Item value="debit" label={m['pos.method_debit']()} />
									<Select.Item value="ewallet" label={m['pos.method_ewallet']()} />
								</Select.Content>
							</Select.Root>
						</div>
						<div class="grid gap-1">
							<Label class="text-xs" for="paid-input">{m['pos.paid_amount']({ symbol: currency.symbol })}</Label>
							<Input id="paid-input" bind:ref={paidEl} bind:value={paid} type="number" min="0" class="h-8 text-right" placeholder={String(totalBayar)} />
						</div>
					</div>
					{#if method === 'cash'}
						<div class="flex flex-wrap gap-1.5">
							{#each [100000, 50000, 20000, 10000, 5000] as v (v)}
								<Button type="button" variant="outline" size="sm" class="h-7 px-2 text-xs tabular-nums" onclick={() => addPaid(v)} title={m['pos.add_to_paid']()}>
									+{formatNumber(v)}
								</Button>
							{/each}
							<Button type="button" variant="outline" size="sm" class="h-7 px-2 text-xs" onclick={() => (paid = String(totalBayar))} title={m['pos.exact']()}>
								{m['pos.exact']()}
							</Button>
						</div>
						<div class="flex justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
							<span class="text-muted-foreground">{m['pos.change']()}</span>
							<span class="font-bold tabular-nums {changeNum < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}">
								{formatRupiah(Math.max(0, changeNum))}
							</span>
						</div>
					{:else}
						<div class="flex justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
							<span class="text-muted-foreground">{m['pos.paid_with']({ method: methodLabel[method] })}</span>
							<span class="font-bold tabular-nums">{formatRupiah(totalBayar)}</span>
						</div>
					{/if}
					{#if method === 'cash' && paidNum < totalBayar}
						<p class="text-xs {cart?.customer ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}">
							{#if cart?.customer}
								{m['pos.shortage_debt']({ amount: formatRupiah(totalBayar - paidNum), name: customerLabel(cart.customer) })}
							{:else}
								{m['pos.shortage_no_customer']()}
							{/if}
						</p>
					{/if}
					<div class="grid grid-cols-2 gap-2">
						<Button
							type="button"
							variant="outline"
							size="lg"
							class="w-full"
							disabled={!cart || cart.items.length === 0 || (method === 'cash' && paidNum < totalBayar && !cart.customer)}
							onclick={() => submitCheckout(false)}
						>
							{m['pos.pay']()}
						</Button>
						<Button
							type="button"
							size="lg"
							class="w-full"
							disabled={!cart || cart.items.length === 0 || (method === 'cash' && paidNum < totalBayar && !cart.customer)}
							onclick={() => submitCheckout(true)}
						>
							{m['pos.pay_print']()}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	</div>
</div>
