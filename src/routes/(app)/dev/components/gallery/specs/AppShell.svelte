<script lang="ts">
	import HouseIcon from '@lucide/svelte/icons/house';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import UsersIcon from '@lucide/svelte/icons/users';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import AppShell, { type AppShellNavLink } from '#lib/components/unitati/AppShell.svelte';
	import EnvironmentBadge from '#lib/components/unitati/EnvironmentBadge.svelte';

	const tallLinks: AppShellNavLink[] = [
		{ href: '/', label: 'Inicio', icon: HouseIcon },
		{
			href: '/assets',
			label: 'Activos',
			icon: PackageIcon,
			section: 'modules',
			accent: 'var(--asset)',
			count: 128
		},
		{
			href: '/service-desk',
			label: 'Mesa de servicio',
			icon: TicketIcon,
			section: 'modules',
			accent: 'var(--desk)',
			count: 4
		},
		{
			href: '/projects',
			label: 'Proyectos',
			icon: FolderKanbanIcon,
			section: 'modules',
			accent: 'var(--project)'
		},
		{ href: '/directory', label: 'Directorio', icon: UsersIcon, section: 'directory', count: 32 }
	];

	const longNav: AppShellNavLink[] = Array.from({ length: 14 }, (_, index) => ({
		href: `/modulo-${index}`,
		label: `Un módulo con un nombre bastante largo ${index + 1}`,
		icon: LayoutGridIcon,
		section: index % 2 === 0 ? ('modules' as const) : undefined
	}));
</script>

<ComponentDocPage
	name="AppShell"
	summary="El marco de la app: sidebar y topbar fijos, scroll de main independiente."
	role="La rejilla del shell no se mueve cuando el contenido de main se desplaza (ADR 0015/0016): el sidebar y la topbar quedan fijos, y solo <main> tiene su propio scroll. Colapsar el sidebar es visual: el ancho real lo decide un atributo en <html>, fijado antes del primer paint."
	whenToUse={['Como la raíz de cada grupo de rutas autenticado: una sola instancia por layout.']}
	whenNotToUse={[
		'Dentro de una página individual: el shell es del layout, no de la página.',
		'Para el portal público de un requester si ese layout decide no llevar sidebar — revisa (portal)/+layout.svelte primero.'
	]}
	propsDoc={[
		{
			name: 'links',
			type: 'AppShellNavLink[]',
			description: '{ href, label, icon, section?, accent?, count? }.'
		},
		{
			name: 'showSearch',
			type: 'boolean',
			default: 'false',
			description: 'Oculto en producción, misma puerta que la galería (ADR 0013).'
		},
		{
			name: 'settings',
			type: 'Snippet',
			description: 'Reservado para una futura pantalla de ajustes.'
		},
		{
			name: 'topbarEnd',
			type: 'Snippet',
			description: 'El lado derecho de la topbar: insignia de entorno, usuario, salir.'
		}
	]}
	usage={`<AppShell {links} showSearch={!isProduction(APP_ENV)}>
  {#snippet topbarEnd()}
    <EnvironmentBadge environment={APP_ENV} />
  {/snippet}
  {children}
</AppShell>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0015-appshell-and-responsive-navigation.md"
	referenceLabel="ADR 0015 — AppShell y navegación responsiva"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Viewport alto, para ver que el scroll queda en main — y colapsada
			</p>
			<p class="mb-2 text-[13px] leading-[18px] text-[var(--ink-muted)]">
				Pulsa el botón de colapsar en la barra de marca, arriba a la izquierda, para ver el estado
				colapsado. No hay una especimen "colapsada" separada a propósito:
				<code class="font-mono">collapsed</code> no es una prop de este componente, es el atributo
				global <code class="font-mono">data-sidebar-collapsed</code> en
				<code class="font-mono">&lt;html&gt;</code> (ADR 0015) — colapsar aquí también colapsa la barra
				lateral real de esta misma página de la galería, por diseño.
			</p>
			<div
				class="h-[420px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={tallLinks}>
					{#snippet topbarEnd()}
						<EnvironmentBadge environment="development" />
					{/snippet}
					<div class="flex flex-col gap-4 p-4">
						{#each Array.from({ length: 20 }), index (index)}
							<div class="h-10 rounded-[var(--radius-md)] bg-[var(--surface-2)]"></div>
						{/each}
					</div>
				</AppShell>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Navegación larga (colapsa en móvil; el sidebar hace scroll propio)
			</p>
			<div
				class="h-[320px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={longNav}>
					<div class="p-4 text-sm text-[var(--ink-muted)]">Contenido de la página.</div>
				</AppShell>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
