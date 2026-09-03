<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import StockMovementsTable from '$lib/components/stock-movements-table.svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as m from '$lib/paraglide/messages.js';
	import type { MovementRow, OptionItem } from '$lib/types';
	import { formatNumber } from '$lib/utils';

	let { data } = $props<{
		data: {
			movements: { items: MovementRow[]; totalItems: number };
			products: { items: Array<{ id: string; name: string }> };
			filters: { from: string; to: string; type: string; productId: string };
			summary: { totalIn: number; totalOut: number };
		};
	}>();

	const NONE = '__none__';
	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let type = $state(data.filters.type);
	let productId = $state(data.filters.productId || NONE);

	function productName(value: string): string {
		if (value === NONE) return m['stockReport.all_products']();
		return data.products.items.find((p: { id: string; name: string }) => p.id === value)?.name ?? '—';
	}
	const typeLabel: Record<string, string> = {
		all: m['stockReport.type_all'](),
		in: m['stockReport.type_in'](),
		out: m['stockReport.type_out']()
	};
</script>

<svelte:head>
	<title>{m['stockReport.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['stockReport.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['stockReport.description']()}</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader>
				<CardDescription>{m['stockReport.total_in']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">+{formatNumber(data.summary.totalIn)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['stockReport.total_out']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums text-destructive">−{formatNumber(data.summary.totalOut)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['stockReport.row_count']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums">{data.movements.totalItems}</CardTitle>
			</CardHeader>
		</Card>
	</div>

	<Card>
		<CardContent class="pt-4">
			<form method="GET" class="grid items-end gap-4 md:grid-cols-5">
				<div class="grid gap-2">
					<Label for="from">{m['common.from_date']()}</Label>
					<Input id="from" name="from" type="date" bind:value={from} />
				</div>
				<div class="grid gap-2">
					<Label for="to">{m['common.to_date']()}</Label>
					<Input id="to" name="to" type="date" bind:value={to} />
				</div>
				<input type="hidden" name="type" value={type} />
				<div class="grid gap-2">
					<Label>{m['stockReport.type']()}</Label>
					<Select.Root type="single" bind:value={type}>
						<Select.Trigger class="w-full">{typeLabel[type] ?? m['stockReport.type_all']()}</Select.Trigger>
						<Select.Content>
							<Select.Item value="all" label={m['stockReport.type_all']()} />
							<Select.Item value="in" label={m['stockReport.type_in']()} />
							<Select.Item value="out" label={m['stockReport.type_out']()} />
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-2">
					<Label>{m['stockReport.product']()}</Label>
					<Select.Root type="single" bind:value={productId}>
						<Select.Trigger class="w-full">{productName(productId)}</Select.Trigger>
						<Select.Content class="max-h-72">
							<Select.Item value={NONE} label={m['stockReport.all_products']()} />
							{#each data.products.items as p (p.id)}
								<Select.Item value={p.id} label={p.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="flex gap-2">
					<Button type="submit">
						<SearchIcon class="mr-1 size-4" />
						{m['common.filter']()}
					</Button>
					<a href="/app/reports/stock"><Button type="button" variant="outline">{m['common.reset']()}</Button></a>
				</div>
			</form>
		</CardContent>
	</Card>

	<StockMovementsTable rows={data.movements.items} emptyText={m['stockReport.empty']()} />

	{#if data.movements.totalItems > 200}
		<p class="text-sm text-muted-foreground">{m['stockReport.truncated']({ n: data.movements.totalItems })}</p>
	{/if}
</div>
