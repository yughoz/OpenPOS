<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import StockMovementsTable from '$lib/components/stock-movements-table.svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as m from '$lib/paraglide/messages.js';
	import type { MovementRow, OptionItem } from '$lib/types';

	let { data } = $props<{
		data: {
			products: { items: Array<{ id: string; name: string; stock: number }> };
			suppliers: { items: Array<{ id: string; name: string }> };
			movements: { items: MovementRow[] };
			q: string;
		};
	}>();

	const NONE = '__none__';
	let productId = $state('');
	let qty = $state('');
	let supplierId = $state(NONE);
	let note = $state('');

	function productName(value: string): string {
		return data.products.items.find((p: { id: string; name: string; stock: number }) => p.id === value)?.name ?? m['stockIn.pick_product']();
	}
	function supplierName(value: string): string {
		if (value === NONE) return m['common.no_supplier']();
		return data.suppliers.items.find((s: { id: string; name: string }) => s.id === value)?.name ?? '—';
	}

	const submitEnhance = () =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'success') {
				toast.success(m['stockIn.saved_toast']());
				qty = '';
				note = '';
			} else if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
			}
		};
</script>

<svelte:head>
	<title>{m['stockIn.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['stockIn.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['stockIn.description']()}</p>
	</div>

	<Card class="max-w-2xl">
		<CardHeader>
			<CardTitle>{m['stockIn.form_title']()}</CardTitle>
			<CardDescription>{m['stockIn.form_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/create" use:enhance={submitEnhance} class="grid gap-4">
				<input type="hidden" name="product_id" value={productId} />
				<input type="hidden" name="supplier_id" value={supplierId === NONE ? '' : supplierId} />
				<div class="grid gap-2">
					<Label>{m['common.product']()}</Label>
					<Select.Root type="single" bind:value={productId} required>
						<Select.Trigger class="w-full">{productName(productId)}</Select.Trigger>
						<Select.Content class="max-h-72">
							{#each data.products.items as p (p.id)}
								<Select.Item value={p.id} label={`${p.name} (${m['pos.stock_n']({ n: p.stock })})`} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="qty">{m['common.qty']()} *</Label>
						<Input id="qty" name="qty" bind:value={qty} type="number" min="1" required placeholder="1" />
					</div>
					<div class="grid gap-2">
						<Label>{m['nav.suppliers']()}</Label>
						<Select.Root type="single" bind:value={supplierId}>
							<Select.Trigger class="w-full">{supplierName(supplierId)}</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value={NONE} label={m['common.no_supplier']()} />
								{#each data.suppliers.items as s (s.id)}
									<Select.Item value={s.id} label={s.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
				<div class="grid gap-2">
					<Label for="note">{m['common.note']()}</Label>
					<Input id="note" name="note" bind:value={note} placeholder={m['stockIn.note_placeholder']()} maxlength={300} />
				</div>
				<div>
					<Button type="submit" disabled={!productId || !qty}>{m['stockIn.save']()}</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<div class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">{m['stockIn.history']()}</h2>
		<form method="GET" class="relative w-full max-w-xs">
			<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input name="q" value={data.q} placeholder={m['stockIn.search']()} class="pl-8" />
		</form>
		<StockMovementsTable rows={data.movements.items} emptyText={data.q ? m['common.history_empty']() : m['stockIn.empty']()} />
	</div>
</div>
