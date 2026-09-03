<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import SidebarShell from '$lib/components/sidebar-shell.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { page } from '$app/state';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>OpenPOS</title>
</svelte:head>

<Toaster richColors position="top-center" />

{#if page.url.pathname === '/login' || page.url.pathname.startsWith('/app/pos/receipt/')}
	<!-- login & halaman struk dirender tanpa shell (struk harus bersih untuk print) -->
	{@render children()}
{:else}
	<SidebarShell {data}>
		{@render children()}
	</SidebarShell>
{/if}
