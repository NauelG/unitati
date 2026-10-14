<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';

	const roles = [
		{ value: 'admin', label: 'Administrador' },
		{ value: 'agent', label: 'Agente' },
		{ value: 'requester', label: 'Solicitante' },
		{ value: 'viewer', label: 'Observador' }
	];

	let localValue: string | null = $state(null);
	let remoteValue: string | null = $state(null);
	let remoteFailedValue: string | null = $state(null);
	let clearedValue: string | null = $state('admin');
	let manyValues: string[] = $state(['agent', 'viewer']);
</script>

<ComponentDocPage
	name="SearchSelectField"
	summary="Combobox buscable de una sola opción, para listas largas o remotas."
	role="Para un conjunto fijo pequeño, filtra en el cliente; para una lista que puede tener miles de filas (personas, modelos de activo), pregunta a un searchUrl mientras el usuario escribe, igual que AssetPicker pero para una sola selección en vez de varias. El valor elegido se postea bajo name mediante un input oculto, igual que un <select>."
	whenToUse={[
		'Elegir una opción entre una lista larga que no cabe cómoda en un SelectField.',
		'Buscar un registro remoto (persona, modelo) sin descargar el universo completo al navegador.'
	]}
	whenNotToUse={[
		'Un puñado de opciones fijas conocidas (estado, prioridad): usa SelectField, es más simple y más rápido.',
		'Elegir varios activos buscando en remoto: usa AssetPicker.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{ name: 'name', type: 'string', description: 'Nombre bajo el que se envía el formulario.' },
		{
			name: 'options',
			type: 'SelectOption[]',
			description: 'Lista fija, filtrada en el cliente. Omítela a favor de searchUrl.'
		},
		{
			name: 'searchUrl',
			type: 'string',
			description: 'Endpoint que responde ?q= con un array JSON de { value, label }.'
		},
		{
			name: 'selectedLabel',
			type: 'string',
			description:
				'La etiqueta de la opción remota ya elegida, conocida antes de buscar (editar un registro).'
		},
		{ name: 'value', type: 'string | null', description: 'Bindable. null limpia la selección.' },
		{ name: 'error', type: 'string', description: 'Igual que en Field: presencia marca inválido.' },
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' },
		{ name: 'required', type: 'boolean', description: 'Marca el campo obligatorio en el envío.' },
		{
			name: 'multiple',
			type: 'boolean',
			default: 'false',
			description:
				'Varias selecciones: se guardan en values (bindable) y se envían como campos name repetidos. El popover queda abierto entre selecciones.'
		},
		{
			name: 'values',
			type: 'string[]',
			default: '[]',
			description: 'Bindable. Solo con multiple.'
		},
		{
			name: 'selectedLabels',
			type: 'Record<string, string>',
			description: 'Etiquetas de valores remotos ya elegidos, conocidas antes de buscar.'
		},
		{
			name: 'clearable',
			type: 'boolean',
			default: '!required',
			description: 'Muestra un botón para limpiar la selección.'
		}
	]}
	usage={`<SearchSelectField
  label="Responsable"
  name="custodianPersonId"
  searchUrl="/people/search"
  selectedLabel={initialLabel}
  bind:value={custodianId}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-field"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Local (sin resultados aún)
				</p>
				<SearchSelectField label="Rol" options={roles} bind:value={localValue} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Remoto, vacío</p>
				<SearchSelectField
					label="Persona"
					searchUrl="/dev/components/people"
					bind:value={remoteValue}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Remoto, con selección previa
				</p>
				<SearchSelectField
					label="Persona"
					searchUrl="/dev/components/people"
					selectedLabel="Clara Roig"
					bind:value={remoteFailedValue}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Limpiable / obligatorio
				</p>
				<SearchSelectField label="Rol" options={roles} bind:value={clearedValue} required />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Múltiple (multiple)
				</p>
				<SearchSelectField label="Roles" options={roles} multiple bind:values={manyValues} />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
