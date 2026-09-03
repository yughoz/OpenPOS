<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import UserIcon from '@lucide/svelte/icons/user';
	import LockIcon from '@lucide/svelte/icons/lock';
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages.js';

	let { data, form } = $props<{ data: { user: { id: string; email: string; name: string } }; form?: { success?: boolean; error?: string } }>();
</script>

<svelte:head>
	<title>{m['profile.info_title']()} — OpenPOS</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">{m['profile.info_title']()}</h1>
		<p class="mt-1 text-sm text-muted-foreground">{m['profile.description']()}</p>
	</div>

	{#if form?.success}
		<div class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
			<CheckIcon class="size-4" />
			{m['profile.saved']()}
		</div>
	{/if}
	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2 text-lg"><UserIcon class="size-4" /> {m['profile.info_title']()}</CardTitle>
			<CardDescription>{m['profile.info_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" class="space-y-4">
				<div class="space-y-2">
					<Label for="name">{m['common.name']()}</Label>
					<Input id="name" name="name" type="text" value={data.user.name} placeholder={m['profile.name_placeholder']()} />
				</div>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" value={data.user.email} placeholder="kamu@email.com" />
					<p class="text-xs text-muted-foreground">{m['profile.email_note']()}</p>
				</div>

				<Separator class="my-4" />

				<div class="space-y-2">
					<Label for="newPassword">{m['profile.new_password']()}</Label>
					<Input id="newPassword" name="newPassword" type="password" placeholder={m['profile.new_password_ph']()} autocomplete="new-password" />
				</div>
				<div class="space-y-2">
					<Label for="currentPassword">{m['profile.current_password']()}</Label>
					<Input id="currentPassword" name="currentPassword" type="password" placeholder={m['profile.current_password_ph']()} autocomplete="current-password" />
					<p class="text-xs text-muted-foreground">{m['profile.current_password_note']()}</p>
				</div>

				<Button type="submit" class="w-full">
					<CheckIcon class="mr-2 size-4" /> {m['profile.save']()}
				</Button>
			</form>
		</CardContent>
	</Card>

	<div class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
		<LockIcon class="size-3" />
		{m['users.col_email']()}: <code class="rounded bg-muted px-1 py-0.5">{data.user.email}</code>
		<span class="mx-1">·</span>
		ID: <code class="rounded bg-muted px-1 py-0.5">{data.user.id}</code>
	</div>
</div>
