<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import BarChart from '$lib/components/bar-chart.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRupiah } from '$lib/utils';

	let { data } = $props<{
		data: {
			user: { name: string; role: string };
			summary: {
				salesToday: number;
				txCountToday: number;
				lowStockCount: number;
				lowStockItems: Array<{ id: string; name: string; stock: number; min_stock: number }>;
			};
			salesByDay: Array<{ label: string; value: number }>;
			topProducts: Array<{ name: string; qty: number }>;
			today: string;
		};
	}>();
</script>

<svelte:head>
	<title>{m['nav.dashboard']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">
			{m['nav.dashboard']()}
		</h1>
		<p class="text-sm text-muted-foreground">
			{m['dashboard.welcome']({ name: data.user.name })}
			<span class="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{data.user.role}</span>
			<span class="ml-2 text-muted-foreground/70">{data.today}</span>
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader>
				<CardDescription>{m['dashboard.sales_today']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums">{formatRupiah(data.summary.salesToday)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['dashboard.tx_today']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums">{data.summary.txCountToday}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['dashboard.low_stock']()}</CardDescription>
				<CardTitle class="text-2xl tabular-nums {data.summary.lowStockCount > 0 ? 'text-destructive' : ''}">
					{data.summary.lowStockCount}
				</CardTitle>
			</CardHeader>
		</Card>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle>{m['dashboard.chart_title']()}</CardTitle>
				<CardDescription>{m['dashboard.chart_desc']()}</CardDescription>
			</CardHeader>
			<CardContent>
				<BarChart data={data.salesByDay} />
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>{m['dashboard.top_title']()}</CardTitle>
				<CardDescription>{m['dashboard.top_desc']()}</CardDescription>
			</CardHeader>
			<CardContent>
				{#if data.topProducts.length === 0}
					<p class="py-6 text-center text-sm text-muted-foreground">{m['dashboard.top_empty']()}</p>
				{:else}
					<div class="rounded-lg border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>{m['salesReport.col_product']()}</Table.Head>
									<Table.Head class="w-24 text-right">{m['dashboard.col_sold']()}</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.topProducts as p, i (p.name)}
									<Table.Row>
										<Table.Cell class="font-medium">
											<span class="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
											{p.name}
										</Table.Cell>
										<Table.Cell class="text-right font-semibold tabular-nums">{p.qty}</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{m['dashboard.low_title']()}</CardTitle>
			<CardDescription>{m['dashboard.low_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			{#if data.summary.lowStockItems.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">{m['dashboard.low_empty']()}</p>
			{:else}
				<div class="rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m['salesReport.col_product']()}</Table.Head>
								<Table.Head class="w-24 text-right">{m['dashboard.col_stock']()}</Table.Head>
								<Table.Head class="w-24 text-right">{m['dashboard.col_min']()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.summary.lowStockItems as p (p.id)}
								<Table.Row>
									<Table.Cell class="font-medium">{p.name}</Table.Cell>
									<Table.Cell class="text-right font-semibold tabular-nums text-destructive">{p.stock}</Table.Cell>
									<Table.Cell class="text-right tabular-nums text-muted-foreground">{p.min_stock}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
