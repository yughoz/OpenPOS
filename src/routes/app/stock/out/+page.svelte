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
	import type { MovementRow } from '$lib/types';

	let { data } = $props<{
		data: {
			products: { items: Array<{ id: string; name: string; stock: number }> };
			movements: { items: MovementRow[] };
			q: string;
		};
	}>();

	let productId = $state('');
	let qty = $state('');
	let note = $state('');

	function productName(value: string): string {
		return data.products.items.find((p: { id: string; name: string; stock: number }) => p.id === value)?.name ?? m['stockIn.pick_product']();
	}

	const submitEnhance = () =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'success') {
				toast.success(m['stockOut.saved_toast']());
				qty = '';
				note = '';
			} else if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
			}
		};
</script>

<svelte:head>
	<title>{m['stockOut.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['stockOut.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['stockOut.description']()}</p>
	</div>

	<Card class="max-w-2xl">
		<CardHeader>
			<CardTitle>{m['stockOut.form_title']()}</CardTitle>
			<CardDescription>{m['stockOut.form_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/create" use:enhance={submitEnhance} class="grid gap-4">
				<input type="hidden" name="product_id" value={productId} />
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
				<div class="grid max-w-xs gap-2">
					<Label for="qty">{m['common.qty']()} *</Label>
					<Input id="qty" name="qty" bind:value={qty} type="number" min="1" required placeholder="1" />
				</div>
				<div class="grid gap-2">
					<Label for="note">{m['stockOut.reason']()}</Label>
					<Input id="note" name="note" bind:value={note} placeholder={m['stockOut.reason_placeholder']()} maxlength={300} />
				</div>
				<div>
					<Button type="submit" disabled={!productId || !qty}>{m['stockOut.save']()}</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<div class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">{m['stockOut.history']()}</h2>
		<form method="GET" class="relative w-full max-w-xs">
			<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input name="q" value={data.q} placeholder={m['stockIn.search']()} class="pl-8" />
		</form>
		<StockMovementsTable rows={data.movements.items} emptyText={data.q ? m['common.history_empty']() : m['stockOut.empty']()} />
	</div>
</div>
