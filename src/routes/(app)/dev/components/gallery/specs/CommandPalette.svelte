<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import CommandPalette from '#lib/components/unitati/CommandPalette.svelte';

	let open = $state(true);
</script>

<ComponentDocPage
	name="CommandPalette"
	summary="Paleta ⌘K: acciones permitidas y registros, sobre el primitivo Command vendorizado."
	role="El punto de entrada al bucle núcleo del técnico sin ratón (#88): abre con ⌘K/Ctrl+K o desde la entrada Buscar de la barra lateral. 'Acciones' sale del mismo vocabulario de permisos que la navegación y el keymap, así que un rol que no ve un enlace tampoco encuentra su atajo aquí. 'Registros' llama a /api/palette, el contrato interino hasta que la slice 7 (FTS) exista."
	whenToUse={[
		'Siempre disponible en (app): es la superficie de comandos de toda la app, no de una pantalla.'
	]}
	whenNotToUse={[
		'Para los verbos de una fila concreta de una tabla: esos viven en el keymap de la propia lista (a/e/l/s), no en la paleta.'
	]}
	propsDoc={[
		{
			name: 'permissions',
			type: 'readonly string[]',
			description: 'El vocabulario de permisos del visitante — filtra qué acciones aparecen.'
		},
		{
			name: 'personId',
			type: 'string | null',
			default: 'null',
			description: 'El registro de directorio del visitante, para "Asignar a mí".'
		},
		{
			name: 'open',
			type: 'boolean',
			default: 'false',
			description: 'Bindable; AppShell nunca la enlaza — la demo sí, para mostrarla abierta.'
		}
	]}
	usage={`<CommandPalette permissions={data.permissions} personId={data.user.personId} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — GlobalSearch, ut-kbd"
>
	{#snippet demo()}
		<div
			class="relative h-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]"
		>
			<CommandPalette
				bind:open
				permissions={[
					'assets.view',
					'assets.manage',
					'assets.checkout',
					'tickets.view',
					'tickets.create',
					'tickets.manage',
					'people.view'
				]}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
