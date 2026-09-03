<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime } from '$lib/utils';

	interface AuditRow {
		id: string;
		created: string;
		action: string;
		collection: string;
		record_id: string;
		userName: string;
		old: Record<string, unknown> | null;
		new: Record<string, unknown> | null;
	}

	let { data } = $props<{
		data: {
			items: AuditRow[];
			totalItems: number;
			totalPages: number;
			page: number;
			filters: { from: string; to: string; action: string; collection: string; user: string };
			actions: string[];
			collections: string[];
			users: Array<{ id: string; name: string }>;
		};
	}>();

	const NONE = '__none__';
	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let action = $state(data.filters.action || NONE);
	let collection = $state(data.filters.collection || NONE);
	let user = $state(data.filters.user || NONE);

	function optionLabel(list: Array<{ id: string; name: string }>, value: string, emptyLabel: string): string {
		if (value === NONE || !value) return emptyLabel;
		return list.find((x) => x.id === value)?.name ?? emptyLabel;
	}

	// aksi & modul adalah kode teknis (create, checkout, transactions, …) — tampilkan apa adanya
	function actionBadge(actionCode: string): string {
		if (actionCode === 'create' || actionCode === 'checkout' || actionCode === 'pay-debt') {
			return 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400';
		}
		if (actionCode === 'update' || actionCode === 'reset-password') {
			return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
		}
		if (actionCode === 'delete' || actionCode === 'void-transaction' || actionCode === 'void-cart') {
			return 'bg-destructive/15 text-destructive';
		}
		return 'bg-secondary text-secondary-foreground';
	}

	function jsonPretty(v: Record<string, unknown> | null): string {
		if (!v || Object.keys(v).length === 0) return '';
		return JSON.stringify(v, null, 2);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (data.filters.from) params.set('from', data.filters.from);
		if (data.filters.to) params.set('to', data.filters.to);
		if (data.filters.action) params.set('action', data.filters.action);
		if (data.filters.collection) params.set('collection', data.filters.collection);
		if (data.filters.user) params.set('user', data.filters.user);
		params.set('page', String(p));
		goto(`?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>{m['audit.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['audit.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['audit.description']()}</p>
	</div>

	<Card>
		<CardContent class="pt-4">
			<form method="GET" class="grid items-end gap-4 md:grid-cols-3 xl:grid-cols-6">
				<div class="grid gap-2">
					<Label for="from">{m['common.from_date']()}</Label>
					<Input id="from" name="from" type="date" bind:value={from} />
				</div>
				<div class="grid gap-2">
					<Label for="to">{m['common.to_date']()}</Label>
					<Input id="to" name="to" type="date" bind:value={to} />
				</div>
				<input type="hidden" name="action" value={action === NONE ? '' : action} />
				<div class="grid gap-2">
					<Label>{m['audit.action']()}</Label>
					<Select.Root type="single" bind:value={action}>
						<Select.Trigger class="w-full">{action === NONE ? m['audit.all_actions']() : action}</Select.Trigger>
						<Select.Content class="max-h-64">
							<Select.Item value={NONE} label={m['audit.all_actions']()} />
							{#each data.actions as a (a)}
								<Select.Item value={a} label={a} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<input type="hidden" name="collection" value={collection === NONE ? '' : collection} />
				<div class="grid gap-2">
					<Label>{m['audit.collection']()}</Label>
					<Select.Root type="single" bind:value={collection}>
						<Select.Trigger class="w-full">{collection === NONE ? m['audit.all_collections']() : collection}</Select.Trigger>
						<Select.Content class="max-h-64">
							<Select.Item value={NONE} label={m['audit.all_collections']()} />
							{#each data.collections as c (c)}
								<Select.Item value={c} label={c} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<input type="hidden" name="user" value={user === NONE ? '' : user} />
				<div class="grid gap-2">
					<Label>{m['audit.user']()}</Label>
					<Select.Root type="single" bind:value={user}>
						<Select.Trigger class="w-full">{optionLabel(data.users, user, m['audit.all_users']())}</Select.Trigger>
						<Select.Content class="max-h-64">
							<Select.Item value={NONE} label={m['audit.all_users']()} />
							{#each data.users as u (u.id)}
								<Select.Item value={u.id} label={u.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="flex gap-2">
					<Button type="submit">
						<SearchIcon class="mr-1 size-4" />
						{m['common.filter']()}
					</Button>
					<a href="/app/audit"><Button type="button" variant="outline">{m['common.reset']()}</Button></a>
				</div>
			</form>
		</CardContent>
	</Card>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-40">{m['audit.col_time']()}</Table.Head>
					<Table.Head class="w-32">{m['audit.col_user']()}</Table.Head>
					<Table.Head class="w-36">{m['audit.col_action']()}</Table.Head>
					<Table.Head class="w-32">{m['audit.col_module']()}</Table.Head>
					<Table.Head>{m['audit.col_record']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.items as row (row.id)}
					<Table.Row>
						<Table.Cell class="whitespace-nowrap text-muted-foreground">{formatDateTime(row.created)}</Table.Cell>
						<Table.Cell>{row.userName}</Table.Cell>
						<Table.Cell>
							<span class="rounded-full px-2 py-0.5 font-mono text-xs font-medium {actionBadge(row.action)}">{row.action}</span>
						</Table.Cell>
						<Table.Cell class="font-mono text-xs text-muted-foreground">{row.collection}</Table.Cell>
						<Table.Cell>
							<details class="min-w-40">
								<summary class="cursor-pointer font-mono text-xs text-muted-foreground">{row.record_id || '—'}</summary>
								{#if jsonPretty(row.old) || jsonPretty(row.new)}
									<div class="mt-2 grid gap-2 lg:grid-cols-2">
										{#if jsonPretty(row.old)}
											<div>
												<p class="mb-1 text-xs font-medium text-muted-foreground">{m['audit.old_data']()}</p>
												<pre class="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs">{jsonPretty(row.old)}</pre>
											</div>
										{/if}
										{#if jsonPretty(row.new)}
											<div>
												<p class="mb-1 text-xs font-medium text-muted-foreground">{m['audit.new_data']()}</p>
												<pre class="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs">{jsonPretty(row.new)}</pre>
											</div>
										{/if}
									</div>
								{:else}
									<p class="mt-1 text-xs text-muted-foreground">{m['audit.no_detail']()}</p>
								{/if}
							</details>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={5} class="py-10 text-center text-muted-foreground">{m['audit.empty']()}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<span>{m['audit.entries']({ n: data.totalItems })}</span>
		{#if data.totalPages > 1}
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" class="size-8" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>
					<ChevronLeftIcon class="size-4" />
				</Button>
				<span>{data.page} / {data.totalPages}</span>
				<Button
					variant="outline"
					size="icon"
					class="size-8"
					disabled={data.page >= data.totalPages}
					onclick={() => goToPage(data.page + 1)}
				>
					<ChevronRightIcon class="size-4" />
				</Button>
			</div>
		{/if}
	</div>
</div>
