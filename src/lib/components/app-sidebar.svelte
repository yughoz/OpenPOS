<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import HouseIcon from '@lucide/svelte/icons/house';
	import ShoppingCartIcon from '@lucide/svelte/icons/shopping-cart';
	import HandCoinsIcon from '@lucide/svelte/icons/hand-coins';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import UsersIcon from '@lucide/svelte/icons/users';
	import TruckIcon from '@lucide/svelte/icons/truck';
	import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
	import ArrowUpFromLineIcon from '@lucide/svelte/icons/arrow-up-from-line';
	import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3';
	import WarehouseIcon from '@lucide/svelte/icons/warehouse';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import StoreIcon from '@lucide/svelte/icons/store';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import * as m from '$lib/paraglide/messages.js';
	import { setLocale, getLocale } from '$lib/paraglide/runtime.js';
	import type { Component } from 'svelte';

	let { data } = $props<{
		data?: { user: { email: string; name: string; role?: string } | null } | undefined;
	}>();

	const isAdmin = $derived(data?.user?.role === 'admin');

	interface NavItem {
		title: () => string;
		url: string;
		icon: Component<any>;
		adminOnly?: boolean;
	}
	interface NavGroup {
		label: () => string;
		items: NavItem[];
	}

	const navGroups: NavGroup[] = [
		{
			label: () => m['nav.app'](),
			items: [{ title: () => m['nav.dashboard'](), url: '/app', icon: HouseIcon }]
		},
		{
			label: () => m['nav.transaction_list']().split(' ')[0],
			items: [
				{ title: () => m['nav.pos'](), url: '/app/pos', icon: ShoppingCartIcon },
				{ title: () => m['nav.transaction_list'](), url: '/app/transactions', icon: HistoryIcon },
				{ title: () => m['nav.debts'](), url: '/app/debts', icon: HandCoinsIcon }
			]
		},
		{
			label: () => 'Master Data',
			items: [
				{ title: () => m['nav.products'](), url: '/app/products', icon: PackageIcon },
				{ title: () => m['nav.product_categories'](), url: '/app/product-categories', icon: TagsIcon },
				{ title: () => m['nav.product_units'](), url: '/app/product-units', icon: RulerIcon },
				{ title: () => m['nav.customers'](), url: '/app/customers', icon: UsersIcon },
				{ title: () => m['nav.suppliers'](), url: '/app/suppliers', icon: TruckIcon }
			]
		},
		{
			label: () => 'Stok',
			items: [
				{ title: () => m['nav.stock_in'](), url: '/app/stock/in', icon: ArrowDownToLineIcon },
				{ title: () => m['nav.stock_out'](), url: '/app/stock/out', icon: ArrowUpFromLineIcon }
			]
		},
		{
			label: () => 'Laporan',
			items: [
				{ title: () => m['nav.sales_report'](), url: '/app/reports/sales', icon: BarChart3Icon },
				{ title: () => m['nav.stock_report'](), url: '/app/reports/stock', icon: WarehouseIcon }
			]
		},
		{
			label: () => 'Sistem',
			items: [
				{ title: () => m['nav.ai_chat'](), url: '/app/ai-chat', icon: SparklesIcon, adminOnly: true },
				{ title: () => m['nav.users'](), url: '/app/users', icon: UserCogIcon, adminOnly: true },
				{ title: () => m['nav.audit_log'](), url: '/app/audit', icon: ScrollTextIcon, adminOnly: true },
				{ title: () => m['nav.settings'](), url: '/app/settings', icon: SettingsIcon, adminOnly: true }
			]
		}
	];

	const visibleGroups = $derived(
		navGroups
			.map((group) => ({
				...group,
				items: group.items.filter((item) => !item.adminOnly || isAdmin)
			}))
			.filter((group) => group.items.length > 0)
	);

	let isDark = $state(false);

	$effect(() => {
		isDark = document.documentElement.classList.contains('dark');
	});

	function toggleTheme() {
		isDark = !isDark;
		document.documentElement.classList.toggle('dark', isDark);
		localStorage.setItem('theme', isDark ? 'dark' : 'light');
	}

	function toggleLocale() {
		setLocale(getLocale() === 'id' ? 'en' : 'id');
	}
</script>

<Sidebar.Root variant="inset" collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent={m['app.name']()}>
					{#snippet child({ props })}
						<a href="/app" {...props}>
							<div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<StoreIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<div class="flex items-center gap-1.5">
									<span class="truncate font-semibold">{m['app.name']()}</span>
									<span class="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">v{__APP_VERSION__}</span>
								</div>
								<span class="truncate text-xs">{m['app.tagline']()}</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{#each visibleGroups as group (group.label())}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label()}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.url)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									isActive={page.url.pathname === item.url || (item.url !== '/app' && page.url.pathname.startsWith(item.url))}
									tooltipContent={item.title()}
								>
									{#snippet child({ props })}
										<a href={item.url} {...props}>
											<item.icon />
											<span>{item.title()}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton onclick={toggleTheme} tooltipContent="Theme">
					{#if isDark}<SunIcon />{:else}<MoonIcon />{/if}
					<span>{isDark ? 'Light' : 'Dark'}</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton onclick={toggleLocale} tooltipContent="Language">
					<LanguagesIcon />
					<span>{getLocale() === 'id' ? 'Indonesia' : 'English'}</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			{#if data?.user}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={data.user.email}>
						{#snippet child({ props })}
							<a href="/profile" {...props}>
								<BadgeCheckIcon />
								<span class="truncate text-xs">{data.user.email}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<form method="POST" action="/logout" class="w-full">
						<Sidebar.MenuButton tooltipContent="Logout">
							{#snippet child({ props })}
								<button {...props} type="submit">
									<LogOutIcon />
									<span>Logout</span>
								</button>
							{/snippet}
						</Sidebar.MenuButton>
					</form>
				</Sidebar.MenuItem>
			{:else}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Login">
						{#snippet child({ props })}
							<a href="/login" {...props}>
								<StoreIcon />
								<span>Login</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		</Sidebar.Menu>
		<div class="px-2 py-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
			{m['app.name']()} — {m['app.tagline']()}
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
