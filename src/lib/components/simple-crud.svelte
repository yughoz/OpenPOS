<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages.js';

	interface Column {
		key: string;
		label: string;
		class?: string;
	}
	interface Field {
		name: string;
		label: string;
		type?: 'text' | 'textarea';
		required?: boolean;
		placeholder?: string;
		maxlength?: number;
	}

	let {
		entity,
		title,
		description = '',
		items,
		columns,
		fields,
		deleteLabelKey = 'name',
		q = '',
		page = 1,
		totalPages = 1,
		totalItems = 0
	}: {
		entity: string;
		title: string;
		description?: string;
		items: Array<Record<string, unknown>>;
		columns: Column[];
		fields: Field[];
		deleteLabelKey?: string;
		q?: string;
		page?: number;
		totalPages?: number;
		totalItems?: number;
	} = $props();

	let createOpen = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);
	let editValues = $state<Record<string, string>>({});

	function openCreate() {
		editing = null;
		editValues = {};
		createOpen = true;
	}

	function openEdit(row: Record<string, unknown>) {
		editing = row;
		editValues = Object.fromEntries(fields.map((f) => [f.name, String(row[f.name] ?? '')]));
	}

	function handleResult(close: () => void, successMsg: string) {
		return () =>
			async ({
				update,
				result
			}: {
				update: () => Promise<void>;
				result: { type: string; data?: unknown };
			}) => {
				await update();
				if (result.type === 'success') {
					toast.success(successMsg);
					close();
				} else if (result.type === 'failure') {
					toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
				}
			};
	}

	const deleteEnhance = () =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'success') {
				toast.success(m['crud.deleted']({ entity }));
			} else if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.delete_error']()));
			}
		};

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (q) params.set('q', q);
		params.set('page', String(p));
		goto(`?${params.toString()}`);
	}
</script>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
		{#if description}
			<p class="max-w-2xl text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<form method="GET" class="relative w-full max-w-xs">
			<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input name="q" value={q} placeholder={m['crud.search']({ entity: entity.toLowerCase() })} class="pl-8" />
		</form>
		<Button onclick={openCreate}>
			<PlusIcon class="mr-1 size-4" />
			{m['common.add']()}
		</Button>
	</div>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-10">#</Table.Head>
					{#each columns as col (col.key)}
						<Table.Head class={col.class}>{col.label}</Table.Head>
					{/each}
					<Table.Head class="w-24 text-right">{m['common.actions']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each items as row, i (row.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground">{(page - 1) * 20 + i + 1}</Table.Cell>
						{#each columns as col (col.key)}
							<Table.Cell class={col.class}>{row[col.key] ?? ''}</Table.Cell>
						{/each}
						<Table.Cell class="text-right">
							<div class="flex justify-end gap-1">
								<Button variant="ghost" size="icon" class="size-7" onclick={() => openEdit(row)} title={m['common.edit']()}>
									<PencilIcon class="size-3.5" />
								</Button>
								<form
									method="POST"
									action="?/delete"
									use:enhance={deleteEnhance}
									onsubmit={(e) => {
										const label = String(row[deleteLabelKey] ?? row.id);
										if (!confirm(m['crud.delete_confirm']({ label }))) e.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={row.id} />
									<Button variant="ghost" size="icon" class="size-7 text-destructive" type="submit" title={m['common.delete']()}>
										<Trash2Icon class="size-3.5" />
									</Button>
								</form>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length + 2} class="py-10 text-center text-muted-foreground">
							{q ? m['crud.no_match']({ entity: entity.toLowerCase(), q }) : m['crud.empty']({ entity: entity.toLowerCase() })}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if totalPages > 1}
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span>{m['crud.count']({ n: totalItems })}</span>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" class="size-8" disabled={page <= 1} onclick={() => goToPage(page - 1)}>
					<ChevronLeftIcon class="size-4" />
				</Button>
				<span>{page} / {totalPages}</span>
				<Button variant="outline" size="icon" class="size-8" disabled={page >= totalPages} onclick={() => goToPage(page + 1)}>
					<ChevronRightIcon class="size-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Dialog: Tambah -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m['crud.create_title']({ entity })}</Dialog.Title>
		</Dialog.Header>
		<form method="POST" action="?/create" use:enhance={handleResult(() => (createOpen = false), m['crud.created']({ entity }))}>
			<div class="grid gap-4 py-2">
				{#each fields as field (field.name)}
					<div class="grid gap-2">
						<Label for="create-{field.name}">{field.label}{field.required ? ' *' : ''}</Label>
						{#if field.type === 'textarea'}
							<textarea
								id="create-{field.name}"
								name={field.name}
								class="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
								placeholder={field.placeholder}
								maxlength={field.maxlength}
							></textarea>
						{:else}
							<Input
								id="create-{field.name}"
								name={field.name}
								placeholder={field.placeholder}
								maxlength={field.maxlength}
								required={field.required}
							/>
						{/if}
					</div>
				{/each}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>{m['common.cancel']()}</Button>
				<Button type="submit">{m['common.save']()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Dialog: Edit -->
<Dialog.Root open={editing !== null} onOpenChange={(o) => (editing = o ? editing : null)}>
	{#if editing}
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m['crud.edit_title']({ entity })}</Dialog.Title>
			</Dialog.Header>
			<form method="POST" action="?/update" use:enhance={handleResult(() => (editing = null), m['crud.updated']({ entity }))}>
				<input type="hidden" name="id" value={editing.id} />
				<div class="grid gap-4 py-2">
					{#each fields as field (field.name)}
						<div class="grid gap-2">
							<Label for="edit-{field.name}">{field.label}{field.required ? ' *' : ''}</Label>
							{#if field.type === 'textarea'}
								<textarea
									id="edit-{field.name}"
									name={field.name}
									class="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
									placeholder={field.placeholder}
									maxlength={field.maxlength}
								>{editValues[field.name] ?? ''}</textarea>
							{:else}
								<Input
									id="edit-{field.name}"
									name={field.name}
									value={editValues[field.name] ?? ''}
									placeholder={field.placeholder}
									maxlength={field.maxlength}
									required={field.required}
								/>
							{/if}
						</div>
					{/each}
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (editing = null)}>{m['common.cancel']()}</Button>
					<Button type="submit">{m['common.save']()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>
