<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SettingsNav from '#lib/components/unitati/SettingsNav.svelte';

	const groups = [
		{
			label: 'Proyectos',
			items: [{ href: '/settings/projects/states', label: 'Estados de proyecto' }]
		},
		{
			label: 'Activos',
			items: [
				{ href: '/settings/assets/categories', label: 'Categorías' },
				{ href: '/settings/assets/manufacturers', label: 'Fabricantes' }
			]
		}
	];
</script>

<ComponentDocPage
	name="SettingsNav"
	summary="La navegación secundaria del área de Configuración: un encabezado por módulo y, debajo, sus catálogos."
	role="Se construye desde el registro de secciones (src/lib/settings/sections.ts) ya filtrado por los permisos de quien mira, nunca a mano: una sección que el usuario no puede gestionar no llega aquí. Por debajo de md es una tira compacta que desplaza en horizontal; desde md es una lista lateral de 224px. Es el mismo marcado en ambos casos, sin &lt;select&gt; nativo. Configuración no es un grupo de la barra lateral: tres niveles no caben en el rail de iconos, así que su navegación vive dentro de su propio layout."
	whenToUse={[
		'El layout de /settings, junto al contenido de cada catálogo.',
		'Cualquier otra área con secciones hermanas que no caben como hijos de la barra lateral.'
	]}
	whenNotToUse={[
		'La navegación principal entre módulos: eso es AppShell.',
		'Pestañas dentro de una ficha de registro: aquí cada elemento es una ruta propia.'
	]}
	propsDoc={[
		{
			name: 'groups',
			type: 'SettingsNavGroup[]',
			description:
				'{ label, items: { href, label }[] } por módulo visible, en el orden del registro.'
		},
		{
			name: 'currentPath',
			type: 'string',
			default: 'page.url.pathname',
			description:
				'La ruta que cuenta como actual; la galería pasa una para mostrar la fila activa.'
		}
	]}
	usage={`<SettingsNav
  groups={[
    {
      label: 'Proyectos',
      items: [{ href: '/settings/projects/states', label: 'Estados de proyecto' }]
    }
  ]}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0015-appshell-and-responsive-navigation.md"
	referenceLabel="ADR 0015 — el área de Configuración"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Con la primera sección activa
			</p>
			<SettingsNav {groups} currentPath="/settings/projects/states" />
		</div>
	{/snippet}
</ComponentDocPage>
