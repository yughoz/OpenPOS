<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime } from '$lib/utils';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface UserRow {
		id: string;
		email: string;
		name: string;
		role: string;
		is_active: boolean;
		created: string;
	}

	let { data } = $props<{
		data: { rows: UserRow[]; meId: string };
	}>();

	let createOpen = $state(false);
	let cEmail = $state('');
	let cName = $state('');
	let cRole = $state<'admin' | 'kasir'>('kasir');
	let cPassword = $state('');

	let editing = $state<UserRow | null>(null);
	let eName = $state('');
	let eRole = $state<'admin' | 'kasir'>('kasir');
	let eActive = $state(true);

	let resetUser = $state<UserRow | null>(null);
	let rPassword = $state('');

	function roleBadge(role: string) {
		return role === 'admin'
			? 'rounded-full px-2 py-0.5 text-xs font-medium bg-primary/15 text-primary'
			: 'rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground';
	}

	const createEnhance = (): SubmitFunction => () => async ({ update, result }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['pos.fail']()));
		} else {
			toast.success(m['users.created_toast']());
			createOpen = false;
			cEmail = ''; cName = ''; cRole = 'kasir'; cPassword = '';
		}
	};

	const updateEnhance = () => () => async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['pos.fail']()));
		} else {
			toast.success(m['users.updated_toast']());
			editing = null;
		}
	};

	const resetEnhance = () => () => async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['users.reset_fail']()));
		} else {
			toast.success(m['users.reset_toast']({ password: (result.data as { tempPassword?: string } | undefined)?.tempPassword ?? '' }));
			resetUser = null;
			rPassword = '';
		}
	};

	type SubmitFunction = import('@sveltejs/kit').SubmitFunction;
</script>

<svelte:head>
	<title>{m['nav.users']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['nav.users']()}</h1>
			<p class="text-sm text-muted-foreground">{m['users.description']()}</p>
		</div>
		<Button onclick={() => (createOpen = true)}>
			<PlusIcon class="mr-1 size-4" />
			{m['users.add']()}
		</Button>
	</div>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m['common.name']()}</Table.Head>
					<Table.Head class="w-56">{m['users.col_email']()}</Table.Head>
					<Table.Head class="w-24">{m['users.col_role']()}</Table.Head>
					<Table.Head class="w-24">{m['users.col_status']()}</Table.Head>
					<Table.Head class="w-40">{m['users.col_created']()}</Table.Head>
					<Table.Head class="w-32 text-right">{m['common.actions']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.rows as u (u.id)}
					<Table.Row class={u.is_active ? '' : 'opacity-50'}>
						<Table.Cell>
							<div class="font-medium">{u.name || '—'}</div>
							{#if u.id === data.meId}<span class="text-xs text-muted-foreground">{m['users.you']()}</span>{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
						<Table.Cell><span class={roleBadge(u.role)}>{u.role}</span></Table.Cell>
						<Table.Cell>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {u.is_active ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/15 text-destructive'}">
								{u.is_active ? m['users.active']() : m['users.inactive']()}
							</span>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{formatDateTime(u.created)}</Table.Cell>
						<Table.Cell class="text-right">
							<div class="flex justify-end gap-1">
								<Button variant="ghost" size="icon" class="size-7" title={m['common.edit']()} onclick={() => { editing = u; eName = u.name; eRole = u.role as 'admin' | 'kasir'; eActive = u.is_active; }}>
									<PencilIcon class="size-3.5" />
								</Button>
								{#if u.id !== data.meId}
									<Button variant="ghost" size="icon" class="size-7" title={m['users.reset_title']()} onclick={() => { resetUser = u; rPassword = 'azkasir123'; }}>
										<KeyRoundIcon class="size-3.5" />
									</Button>
								{/if}
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={6} class="py-10 text-center text-muted-foreground">{m['users.empty']()}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<!-- Dialog: Tambah User -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m['users.add']()}</Dialog.Title>
			<Dialog.Description>{m['users.create_desc']()}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/create" use:enhance={createEnhance()}>
			<div class="grid gap-4 py-2">
				<div class="grid gap-2">
					<Label for="c-email">{m['users.email']()}</Label>
					<Input id="c-email" name="email" bind:value={cEmail} type="email" required placeholder="nama@toko.com" />
				</div>
				<div class="grid gap-2">
					<Label for="c-name">{m['common.name']()} *</Label>
					<Input id="c-name" name="name" bind:value={cName} required maxlength={200} />
				</div>
				<div class="grid gap-2">
					<Label>{m['users.role']()}</Label>
					<Select.Root type="single" bind:value={cRole}>
						<Select.Trigger class="w-full">{cRole === 'admin' ? m['users.role_admin']() : m['users.role_kasir']()}</Select.Trigger>
						<Select.Content>
							<Select.Item value="kasir" label={m['users.role_kasir']()} />
							<Select.Item value="admin" label={m['users.role_admin']()} />
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-2">
					<Label for="c-password">{m['users.temp_password']()}</Label>
					<Input id="c-password" name="password" bind:value={cPassword} type="text" required minlength={8} />
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>{m['common.cancel']()}</Button>
				<Button type="submit">{m['users.create_save']()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Dialog: Edit User -->
<Dialog.Root open={editing !== null} onOpenChange={(o) => (editing = o ? editing : null)}>
	{#if editing}
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m['users.edit_title']()}</Dialog.Title>
				<Dialog.Description>{editing.email}</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/update" use:enhance={updateEnhance()}>
				<input type="hidden" name="id" value={editing.id} />
				<div class="grid gap-4 py-2">
					<div class="grid gap-2">
						<Label for="e-name">{m['common.name']()} *</Label>
						<Input id="e-name" name="name" bind:value={eName} required maxlength={200} />
					</div>
					<div class="grid gap-2">
						<Label>{m['users.role']()}</Label>
						<Select.Root type="single" bind:value={eRole} disabled={editing.id === data.meId}>
							<Select.Trigger class="w-full">{eRole === 'admin' ? m['users.role_admin']() : m['users.role_kasir']()}</Select.Trigger>
							<Select.Content>
								<Select.Item value="kasir" label={m['users.role_kasir']()} />
								<Select.Item value="admin" label={m['users.role_admin']()} />
							</Select.Content>
						</Select.Root>
					</div>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" name="is_active" checked={eActive} onchange={(e) => (eActive = e.currentTarget.checked)} disabled={editing.id === data.meId} class="size-4" />
						{m['users.active_label']()}
					</label>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (editing = null)}>{m['common.cancel']()}</Button>
					<Button type="submit">{m['common.save']()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>

<!-- Dialog: Reset Password -->
<Dialog.Root open={resetUser !== null} onOpenChange={(o) => (resetUser = o ? resetUser : null)}>
	{#if resetUser}
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m['users.reset_title']()}</Dialog.Title>
				<Dialog.Description>{resetUser.name} ({resetUser.email})</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/resetPassword" use:enhance={resetEnhance()}>
				<input type="hidden" name="id" value={resetUser.id} />
				<div class="grid gap-4 py-2">
					<div class="grid gap-2">
						<Label for="r-password">{m['users.new_password']()}</Label>
						<Input id="r-password" name="password" bind:value={rPassword} type="text" required minlength={8} />
					</div>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (resetUser = null)}>{m['common.cancel']()}</Button>
					<Button type="submit">{m['users.reset']()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>
