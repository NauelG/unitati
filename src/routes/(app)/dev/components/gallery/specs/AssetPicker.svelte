<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import AssetPicker from '#lib/components/unitati/AssetPicker.svelte';
	import type { PickedAsset } from '#lib/components/unitati/asset-choice.js';

	let empty: PickedAsset[] = $state([]);
	let preselected: PickedAsset[] = $state([
		{ id: '1', assetTag: 'AST-0001', name: 'MacBook Pro 14"' },
		{ id: '2', assetTag: 'AST-0002', name: 'Monitor Dell 27"' }
	]);
</script>

<ComponentDocPage
	name="AssetPicker"
	summary="Selector múltiple de activos con búsqueda en vivo."
	role="Pregunta a un searchUrl mientras el usuario escribe, en vez de recibir una lista: el personal puede enfrentar miles de activos, y una lista acotada para aligerar la página escondería el activo que alguien busca sin decirlo. Los elegidos se muestran como chips, cada uno con un input oculto, para que el formulario los envíe como campos repetidos."
	whenToUse={[
		'Vincular uno o varios activos existentes a otro registro (un ticket, un proyecto).',
		'Cuando el universo de opciones es demasiado grande para un SelectField.'
	]}
	whenNotToUse={[
		'Elegir entre un puñado de valores fijos conocidos de antemano: usa SelectField.',
		'Mostrar activos ya vinculados sin permitir editarlos: usa RelatedRecords.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta del campo de búsqueda.' },
		{
			name: 'name',
			type: 'string',
			default: "'assetIds'",
			description: 'Nombre bajo el que se postean los inputs ocultos, uno por activo elegido.'
		},
		{
			name: 'searchUrl',
			type: 'string',
			description: 'Endpoint que responde ?q= con un array JSON de PickedAsset.'
		},
		{
			name: 'selected',
			type: 'PickedAsset[]',
			default: '[]',
			description: 'Bindable: los activos ya elegidos, mostrados como chips.'
		},
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' }
	]}
	usage={`<AssetPicker
  label="Activos afectados"
  searchUrl="/service-desk/new/assets"
  bind:selected={assetIds}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — selección de registros"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Vacío</p>
				<AssetPicker label="Activos" searchUrl="/dev/components/assets" bind:selected={empty} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Con selección previa
				</p>
				<AssetPicker
					label="Activos"
					searchUrl="/dev/components/assets"
					bind:selected={preselected}
				/>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
