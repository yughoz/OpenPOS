<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';

	let { children, data } = $props();

	const routeTitles: Array<[string, () => string]> = [
		['/app/pos', () => m['nav.pos']()],
		['/app/transactions', () => m['nav.transaction_list']()],
		['/app/products', () => m['nav.products']()],
		['/app/product-categories', () => m['nav.product_categories']()],
		['/app/product-units', () => m['nav.product_units']()],
		['/app/customers', () => m['nav.customers']()],
		['/app/suppliers', () => m['nav.suppliers']()],
		['/app/stock/in', () => m['nav.stock_in']()],
		['/app/stock/out', () => m['nav.stock_out']()],
		['/app/reports/sales', () => m['nav.sales_report']()],
		['/app/reports/stock', () => m['nav.stock_report']()],
		['/app/ai-chat', () => m['nav.ai_chat']()],
		['/app/users', () => m['nav.users']()],
		['/app/audit', () => m['nav.audit_log']()],
		['/app/settings', () => m['nav.settings']()],
		['/app', () => m['nav.dashboard']()],
		['/profile', () => 'Profile']
	];

	const currentTitle = $derived.by(() => {
		const pathname = page.url.pathname;
		for (const [prefix, title] of routeTitles) {
			if (pathname === prefix || (prefix !== '/app' && pathname.startsWith(prefix))) {
				return title();
			}
		}
		return m['nav.home']();
	});
</script>

<Sidebar.Provider>
	<AppSidebar {data} />
	<!-- h-svh + overflow-hidden: tinggi rantai jadi definitif sehingga halaman
		app-like (mis. ai-chat) bisa pin input-nya di bawah; halaman biasa
		scroll di dalam area konten. md: kurangi tinggi margin inset (m-2). -->
	<Sidebar.Inset class="h-svh overflow-hidden md:h-[calc(100svh-1rem)]">
		<header
			class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						<Breadcrumb.Item class="hidden md:block">
							<Breadcrumb.Link href="/app">{m['app.name']()}</Breadcrumb.Link>
						</Breadcrumb.Item>
						<Breadcrumb.Separator class="hidden md:block" />
						<Breadcrumb.Item>
							<Breadcrumb.Page>{currentTitle}</Breadcrumb.Page>
						</Breadcrumb.Item>
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>
		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-4 md:p-6">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
