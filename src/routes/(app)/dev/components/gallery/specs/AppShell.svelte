<script lang="ts">
	import HouseIcon from '@lucide/svelte/icons/house';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import UsersIcon from '@lucide/svelte/icons/users';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import AppShell from '#lib/components/unitati/AppShell.svelte';
	import type { AppShellNavLink } from '#lib/components/unitati/app-shell-nav.js';
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

	/**
	 * Navigation groups (#122). Ids are prefixed per specimen: the open/closed
	 * state of a group is stored by id, and these shells share one page.
	 */
	const projectsGroup = (id: string): AppShellNavLink[] => [
		{ href: '/', label: 'Inicio', icon: HouseIcon },
		{
			id,
			label: 'Proyectos',
			icon: FolderKanbanIcon,
			section: 'modules',
			accent: 'var(--project)',
			children: [
				{ href: '/demo/proyectos', label: 'Proyectos', icon: FolderKanbanIcon, count: 6 },
				{ href: '/demo/tareas', label: 'Tareas', icon: ListChecksIcon, count: 41 }
			]
		},
		{
			href: '/assets',
			label: 'Activos',
			icon: PackageIcon,
			section: 'modules',
			accent: 'var(--asset)',
			count: 128
		}
	];

	/** Two children, but the viewer may only see one: the group renders as a flat row. */
	const oneVisibleChild: AppShellNavLink[] = [
		{ href: '/', label: 'Inicio', icon: HouseIcon },
		{
			id: 'demo-flat',
			label: 'Proyectos',
			icon: FolderKanbanIcon,
			section: 'modules',
			accent: 'var(--project)',
			children: [
				{ href: '/demo/proyectos', label: 'Proyectos', icon: FolderKanbanIcon, count: 6 },
				{
					href: '/demo/tareas',
					label: 'Tareas',
					icon: ListChecksIcon,
					count: 41,
					permission: 'tasks.view'
				}
			]
		}
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
			description:
				'Hoja { href, label, icon, section?, accent?, count?, permission? } o grupo { id, label, icon, section?, accent?, children }. Un grupo no tiene href, count ni permission propios.'
		},
		{
			name: 'permissions',
			type: 'readonly string[]',
			default: '[]',
			description:
				'Los permisos del usuario: cada hoja (y cada hijo) con permission se oculta si no tiene ninguno; un grupo sin hijos visibles desaparece y uno con un solo hijo visible se pinta como fila plana.'
		},
		{
			name: 'currentPath',
			type: 'string',
			default: 'page.url.pathname',
			description:
				'La ruta que cuenta como actual. Solo la usa la galería, para mostrar un grupo abierto por su hijo activo sin navegar.'
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
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Grupo plegable — la fila padre solo despliega (Enter/Espacio), nunca navega; el estado
				sobrevive a una recarga
			</p>
			<div
				class="h-[320px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={projectsGroup('demo-toggle')} currentPath="/">
					<div class="p-4 text-sm text-[var(--ink-muted)]">Contenido de la página.</div>
				</AppShell>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Grupo abierto por la ruta activa — la ruta actual es una de sus hijas, así que se abre sin
				importar el estado guardado
			</p>
			<div
				class="h-[320px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={projectsGroup('demo-active')} currentPath="/demo/tareas/7">
					<div class="p-4 text-sm text-[var(--ink-muted)]">Contenido de la página.</div>
				</AppShell>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Grupo con un solo hijo visible — se pinta como fila plana con el href y el contador del hijo
				(sin chevron, sin clic extra)
			</p>
			<div
				class="h-[240px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={oneVisibleChild} permissions={[]} currentPath="/">
					<div class="p-4 text-sm text-[var(--ink-muted)]">Contenido de la página.</div>
				</AppShell>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Raíl con popover — colapsa el sidebar con el botón de la barra de marca: el icono del grupo
				abre un popover con sus hijos (Enter/Espacio abre, flechas se mueven, Escape cierra y
				devuelve el foco al icono)
			</p>
			<div
				class="h-[320px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)]"
			>
				<AppShell links={projectsGroup('demo-rail')} currentPath="/demo/proyectos">
					<div class="p-4 text-sm text-[var(--ink-muted)]">Contenido de la página.</div>
				</AppShell>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
