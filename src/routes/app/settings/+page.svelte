<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime } from '$lib/utils';

	interface BackupInfo {
		name: string;
		size: number;
		modified: string;
	}

	let { data } = $props<{
		data: {
			fields: Array<{ key: string; max?: number }>;
			values: Record<string, string>;
			backups: BackupInfo[];
		};
	}>();

	const LABELS: Record<string, string> = {
		store_name: m['settings.store_name'](),
		store_description: m['settings.store_description'](),
		store_phone: m['settings.store_phone'](),
		currency_symbol: m['settings.currency_symbol'](),
		prefix_nota: m['settings.prefix_nota'](),
		prefix_barcode: m['settings.prefix_barcode'](),
		receipt_size: m['settings.receipt_size'](),
		receipt_footer: m['settings.receipt_footer']()
	};
	const PLACEHOLDERS: Record<string, string> = {
		store_name: m['settings.ph_store_name'](),
		store_description: m['settings.ph_store_description'](),
		store_phone: m['settings.ph_store_phone'](),
		currency_symbol: m['settings.ph_currency_symbol'](),
		prefix_nota: m['settings.ph_prefix_nota'](),
		prefix_barcode: m['settings.ph_prefix_barcode'](),
		receipt_footer: m['settings.ph_receipt_footer']()
	};

	// nilai form lokal agar select ukuran struk bisa dua arah; default 80 bila belum pernah diset
	let vals = $state<Record<string, string>>({ ...data.values, receipt_size: data.values.receipt_size || '80' });

	// backup
	let restoreName = $state('');
	let restoreConfirm = $state('');
	let uploadConfirm = $state('');
	let uploading = $state(false);

	// restore dari file upload: dikirim via fetch langsung ke endpoint khusus
	// (bebas body size limit form action), lalu dipaksa login ulang
	async function restoreUploadSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (uploading) return;
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		uploading = true;
		try {
			const res = await fetch('/app/settings/restore-upload', { method: 'POST', body: fd });
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) {
				toast.error(String(data.error ?? 'Gagal memulihkan backup.'));
			} else {
				toast.success(m['settings.backup_restored_toast']());
				await goto('/login');
			}
		} catch {
			toast.error('Gagal mengunggah backup.');
		} finally {
			uploading = false;
		}
	}

	const saveEnhance = (): SubmitFunction => () => async ({ update, result }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
		} else {
			toast.success(m['settings.saved_toast']());
		}
	};

	const backupEnhance = (): SubmitFunction => () => async ({ update, result }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { backup_error?: string } | undefined)?.backup_error ?? m['common.save_error']()));
		} else if (result.type === 'success') {
			const d = (result.data ?? {}) as { backup_created?: boolean; backup_deleted?: boolean };
			if (d.backup_created) toast.success(m['settings.backup_created_toast']());
			if (d.backup_deleted) toast.success(m['settings.backup_deleted_toast']());
		}
	};

	// setelah restore, token login lama invalid — paksa login ulang, jangan invalidateAll
	const restoreEnhance = (): SubmitFunction => () => async ({ result }) => {
		if (result.type === 'failure') {
			toast.error(String((result.data as { backup_error?: string } | undefined)?.backup_error ?? 'Gagal.'));
		} else {
			toast.success(m['settings.backup_restored_toast']());
			await goto('/login');
		}
	};

	function formatSize(bytes: number): string {
		const mb = bytes / 1048576;
		if (mb >= 1) return `${mb.toFixed(1)} MB`;
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
</script>

<svelte:head>
	<title>{m['nav.settings']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full max-w-2xl flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['nav.settings']()}</h1>
		<p class="text-sm text-muted-foreground">{m['settings.description']()}</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{m['settings.card_title']()}</CardTitle>
			<CardDescription>{m['settings.card_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/save" use:enhance={saveEnhance()} class="grid gap-4">
				{#each data.fields as f (f.key)}
					<div class="grid gap-2">
						<Label for={f.key}>{LABELS[f.key] ?? f.key}</Label>
						{#if f.key === 'receipt_size'}
							<input type="hidden" name="receipt_size" value={vals.receipt_size || '80'} />
							<Select.Root type="single" bind:value={vals.receipt_size}>
								<Select.Trigger class="w-full">{vals.receipt_size === '58' ? m['settings.size_58']() : m['settings.size_80']()}</Select.Trigger>
								<Select.Content>
									<Select.Item value="80" label={m['settings.size_80']()} />
									<Select.Item value="58" label={m['settings.size_58']()} />
								</Select.Content>
							</Select.Root>
						{:else}
							<Input id={f.key} name={f.key} bind:value={vals[f.key]} maxlength={f.max} placeholder={PLACEHOLDERS[f.key]} />
						{/if}
						{#if f.key === 'prefix_nota'}
							<p class="text-xs text-muted-foreground">{m['settings.nota_hint']({ prefix: vals.prefix_nota || 'POS' })}</p>
						{:else if f.key === 'prefix_barcode'}
							<p class="text-xs text-muted-foreground">{m['settings.barcode_hint']({ prefix: vals.prefix_barcode || '777' })}</p>
						{/if}
					</div>
				{/each}
				<div class="pt-1">
					<Button type="submit">{m['settings.save']()}</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>{m['settings.backup_title']()}</CardTitle>
			<CardDescription>{m['settings.backup_desc']()}</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-6">
			<!-- buat backup -->
			<form method="POST" action="?/create_backup" use:enhance={backupEnhance()} class="flex flex-wrap items-end gap-2">
				<div class="grid min-w-48 flex-1 gap-2">
					<Label for="backup_name">{m['settings.backup_create']()}</Label>
					<Input id="backup_name" name="name" maxlength={60} placeholder={m['settings.backup_name_ph']()} />
				</div>
				<Button type="submit" variant="secondary">{m['settings.backup_create']()}</Button>
			</form>

			<!-- daftar backup -->
			{#if data.backups.length === 0}
				<p class="text-sm text-muted-foreground">{m['settings.backup_empty']()}</p>
			{:else}
				<div class="rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m['settings.backup_file']()}</Table.Head>
								<Table.Head class="w-24 text-right">MB</Table.Head>
								<Table.Head class="w-44">{m['settings.backup_modified']()}</Table.Head>
								<Table.Head class="w-40 text-right">{m['common.actions']()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.backups as b (b.name)}
								<Table.Row>
									<Table.Cell class="break-all font-mono text-xs">{b.name}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{formatSize(b.size)}</Table.Cell>
									<Table.Cell class="whitespace-nowrap text-muted-foreground">{formatDateTime(b.modified)}</Table.Cell>
									<Table.Cell>
										<div class="flex justify-end gap-1">
											<a href={`/app/settings/backup/${encodeURIComponent(b.name)}`} title={m['settings.backup_download']()}>
												<Button variant="ghost" size="sm">{m['settings.backup_download']()}</Button>
											</a>
											<form
												method="POST"
												action="?/delete_backup"
												use:enhance={backupEnhance()}
												onsubmit={(e) => {
													if (!confirm(m['settings.backup_delete_confirm']({ name: b.name }))) e.preventDefault();
												}}
											>
												<input type="hidden" name="name" value={b.name} />
												<Button variant="ghost" size="sm" class="text-destructive">{m['common.delete']()}</Button>
											</form>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}

			<!-- restore -->
			{#if data.backups.length > 0}
				<div class="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
					<p class="text-sm">{m['settings.backup_restore_desc']()}</p>
					<form method="POST" action="?/restore_backup" use:enhance={restoreEnhance()} class="grid gap-3">
						<!-- bits-ui Select bukan native select — nilai dibawa via hidden input -->
						<input type="hidden" name="name" value={restoreName} />
						<div class="grid gap-2">
							<Label>{m['settings.backup_title']()}</Label>
							<Select.Root type="single" bind:value={restoreName}>
								<Select.Trigger class="w-full">{restoreName || m['settings.backup_name_ph']()}</Select.Trigger>
								<Select.Content class="max-h-64">
									{#each data.backups as b (b.name)}
										<Select.Item value={b.name} label={b.name} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="grid gap-2">
							<Label for="restore_confirm">{m['settings.backup_restore_confirm_ph']()}</Label>
							<Input id="restore_confirm" name="confirm" bind:value={restoreConfirm} autocomplete="off" />
						</div>
					<div>
						<Button type="submit" variant="destructive" disabled={!restoreName || restoreConfirm.trim() !== 'RESTORE'}>
							{m['settings.backup_restore']()}
						</Button>
					</div>
				</form>

				<!-- restore dari file upload -->
				<div class="grid gap-2 border-t border-destructive/20 pt-3">
					<Label for="restore_file">{m['settings.backup_upload_desc']()}</Label>
					<form
						class="grid gap-3"
						onsubmit={restoreUploadSubmit}
					>
						<Input id="restore_file" name="file" type="file" accept=".zip,application/zip" required />
						<Input
							name="confirm"
							bind:value={uploadConfirm}
							placeholder={m['settings.backup_restore_confirm_ph']()}
							autocomplete="off"
						/>
						<div>
							<Button type="submit" variant="destructive" disabled={uploading || uploadConfirm.trim() !== 'RESTORE'}>
								{m['settings.backup_restore']()}
							</Button>
						</div>
					</form>
				</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
