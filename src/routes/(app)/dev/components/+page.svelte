<script lang="ts">
	import { dev } from '$app/env';
	import Plus from '@lucide/svelte/icons/plus';
	import Avatar from '#lib/components/unitati/Avatar.svelte';
	import Button, {
		type ButtonSize,
		type ButtonVariant
	} from '#lib/components/unitati/Button.svelte';
	import DataTable, {
		type DataTableColumn,
		type DataTableSort
	} from '#lib/components/unitati/DataTable.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import {
		BADGED_STATUS_KEYS,
		type AssetState,
		type Priority
	} from '#lib/components/unitati/status.js';
	import type { TimelineEntry } from '#lib/server/activity/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The ratchet from `components/unitati/README.md`: every variant and every
	 * state of every component in that folder, on one page. A component missing
	 * a case here is a component whose case nobody is looking at.
	 *
	 * Fixtures are invented on purpose — the gallery must render with no database
	 * and no network, or it stops being usable as a workbench.
	 *
	 * Everything below renders inside `{#if dev}`. Vite replaces `dev` with a
	 * literal, so a production build drops the whole branch: none of these
	 * fixtures and none of this copy reaches the client bundle. `+page.server.ts`
	 * is what makes the route itself 404.
	 */

	const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
	const sizes: ButtonSize[] = ['sm', 'md', 'lg'];

	/**
	 * An inline SVG, not a file: the gallery has to render with no network, and a
	 * portrait that 404s would be testing the wrong thing in the `imageUrl` rows.
	 */
	const PORTRAIT =
		'data:image/svg+xml;utf8,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
				'<rect width="80" height="80" fill="#1d5cf0"/>' +
				'<circle cx="40" cy="30" r="14" fill="#e8efff"/>' +
				'<path d="M12 80a28 28 0 0 1 56 0z" fill="#e8efff"/></svg>'
		);

	let fieldValue = $state('');
	let withError = $state('ada@');

	interface Asset {
		id: string;
		code: string;
		name: string;
		state: AssetState;
		priority: Priority;
		holder: string;
		value: number;
	}

	const assets: Asset[] = [
		{
			id: '1',
			code: 'ACT-0001',
			name: 'MacBook Pro 14"',
			state: 'in_use',
			priority: 'normal',
			holder: 'Ada Lovelace Byron',
			value: 2399
		},
		{
			id: '2',
			code: 'ACT-0002',
			name: 'Dell UltraSharp U2723QE',
			state: 'in_stock',
			priority: 'low',
			holder: 'Alan Turing Stoney',
			value: 589
		},
		{
			id: '3',
			code: 'ACT-0003',
			name: 'iPhone 15',
			state: 'in_repair',
			priority: 'urgent',
			holder: 'Grace Hopper Murray',
			value: 949
		},
		{
			id: '4',
			code: 'ACT-0004',
			name: 'Logitech MX Master 3S',
			state: 'retired',
			priority: 'high',
			holder: 'Edsger Dijkstra Kluyver',
			value: 109
		}
	];

	let selected = $state<string[]>(['2']);
	let sort = $state<DataTableSort>({ key: 'code', direction: 'asc' });

	let selectValue = $state('');
	let selectWithValue = $state('laptops');
	const selectOptions = [
		{ value: 'laptops', label: 'Portátiles' },
		{ value: 'monitors', label: 'Monitores' },
		{ value: 'phones', label: 'Teléfonos' }
	];

	/**
	 * One entry per verb, newest first, so the rail shows every dot and every
	 * sentence. The last two exercise the nullable ends of `location.changed`.
	 */
	const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour, 15));
	const timelineEntries: TimelineEntry[] = [
		{
			id: 't7',
			verb: 'note.added',
			payload: { text: 'Teclado sustituido por garantía.\nSe conserva el cargador original.' },
			occurredAt: at(8, 9),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		},
		{
			id: 't6',
			verb: 'location.changed',
			payload: {
				fromLocationId: 'l1',
				fromLocationName: 'Almacén',
				toLocationId: 'l2',
				toLocationName: 'Oficina de Girona'
			},
			occurredAt: at(7, 16),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		},
		{
			id: 't5',
			verb: 'location.changed',
			payload: {
				fromLocationId: null,
				fromLocationName: null,
				toLocationId: 'l1',
				toLocationName: 'Almacén'
			},
			occurredAt: at(6, 11),
			actorPersonId: null,
			actorName: null
		},
		{
			id: 't4',
			verb: 'state.changed',
			payload: { from: 'in_use', to: 'in_repair' },
			occurredAt: at(5, 10),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		},
		{
			id: 't3',
			verb: 'custody.returned',
			payload: { fromPersonId: 'p2', fromPersonName: 'Ada Lovelace' },
			occurredAt: at(4, 8),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		},
		{
			id: 't2',
			verb: 'custody.assigned',
			payload: { toPersonId: 'p2', toPersonName: 'Ada Lovelace' },
			occurredAt: at(2, 12),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		},
		{
			id: 't1',
			verb: 'asset.created',
			payload: { assetTag: 'AST-0142', name: 'MacBook Pró 14"' },
			occurredAt: at(1, 9),
			actorPersonId: 'p1',
			actorName: 'Grace Hopper'
		}
	];

	const columns: DataTableColumn<Asset>[] = [
		{ key: 'code', header: 'Código', sortable: true, cell: code },
		{ key: 'name', header: 'Nombre', sortable: true, cell: name },
		{ key: 'state', header: 'Estado', cell: state },
		{ key: 'priority', header: 'Prioridad', cell: priority },
		{ key: 'holder', header: 'Asignado a', cell: holder },
		{ key: 'value', header: 'Valor', align: 'end', cell: value }
	];
</script>

{#snippet code(asset: Asset)}{asset.code}{/snippet}
{#snippet name(asset: Asset)}{asset.name}{/snippet}
{#snippet state(asset: Asset)}<StatusBadge status={asset.state} />{/snippet}
{#snippet priority(asset: Asset)}<StatusBadge status={asset.priority} />{/snippet}
{#snippet holder(asset: Asset)}<Avatar name={asset.holder} size="sm" />{/snippet}
{#snippet value(asset: Asset)}{asset.value.toLocaleString('es-ES')} €{/snippet}

{#snippet section(title: string, note: string, body: Snippet)}
	<section class="mt-[var(--space-12)] first:mt-0">
		<h2 class="font-display text-lg font-semibold text-[var(--ink)]">{title}</h2>
		<p class="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">{note}</p>
		<div class="mt-[var(--space-5)]">{@render body()}</div>
	</section>
{/snippet}

{#snippet row(label: string, body: Snippet)}
	<div class="flex flex-wrap items-center gap-[var(--space-3)] py-[var(--space-2)]">
		<span class="w-28 shrink-0 font-mono text-xs text-[var(--ink-muted)]">{label}</span>
		{@render body()}
	</div>
{/snippet}

<!-- Outside the block below: Svelte forbids `<svelte:head>` inside one. -->
<svelte:head>
	<title>Componentes · Unitati</title>
</svelte:head>

{#if dev}
	<div class="mx-auto max-w-5xl pb-[var(--space-12)]">
		<header>
			<h1 class="font-display text-2xl font-semibold text-[var(--ink)]">Componentes</h1>
			<p class="mt-2 max-w-2xl text-[var(--ink-muted)]">
				El banco de trabajo del sistema de diseño. Existe solo en desarrollo. Un componente que no
				aparece aquí no está terminado.
			</p>
		</header>

		{#snippet buttons()}
			{#snippet asLinks()}
				{#each variants as variant (variant)}
					<Button {variant} href="#gallery-link">Ir a la ficha</Button>
				{/each}
				<Button variant="secondary" size="sm" href="#gallery-link">
					<Plus class="size-4" aria-hidden="true" />
					Con icono
				</Button>
			{/snippet}
			{@render row('como enlace', asLinks)}
			{#each variants as variant (variant)}
				{#snippet sizeRow()}
					{#each sizes as size (size)}
						<Button {variant} {size}>Guardar</Button>
					{/each}
					<Button {variant} disabled>Deshabilitado</Button>
					<Button {variant} iconOnly aria-label="Añadir"><Plus class="size-4" /></Button>
				{/snippet}
				{@render row(variant, sizeRow)}
			{/each}
		{/snippet}
		{@render section(
			'Button',
			'Cuatro variantes por tres tamaños, más deshabilitado y solo icono. Con `href` el elemento es un enlace, no un botón: lleva a un sitio en vez de hacer algo. La forma es de pastilla porque las terminaciones de la marca son redondas.',
			buttons
		)}

		{#snippet fields()}
			<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
				<Field label="Nombre" placeholder="Ada Lovelace" bind:value={fieldValue} />
				<Field label="Correo" hint="Lo usaremos para avisos del sistema." value="ada@acme.test" />
				<Field
					label="Correo"
					bind:value={withError}
					error="Introduce una dirección de correo válida."
				/>
				<Field
					label="Identificador"
					value="ACT-0001"
					disabled
					hint="Se genera al crear el activo."
				/>
			</div>
		{/snippet}
		{@render section(
			'Field',
			'Etiqueta, control y una línea de ayuda que se convierte en el error. La presencia de `error` marca el campo como inválido: no puede parecer válido.',
			fields
		)}

		{#snippet badges()}
			<div class="flex flex-wrap gap-[var(--space-2)]">
				{#each BADGED_STATUS_KEYS as key (key)}
					<StatusBadge status={key} />
				{/each}
			</div>
			<div class="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-3)]">
				<span class="font-mono text-xs text-[var(--ink-muted)]">normal →</span>
				<StatusBadge status="normal" />
				<span class="text-sm text-[var(--ink-muted)]">(no renderiza nada)</span>
			</div>
		{/snippet}
		{@render section(
			'StatusBadge',
			'Recibe una clave de estado, nunca texto. La prioridad «normal» no dibuja insignia: una fila que grita «Normal» en cada línea enseña a dejar de mirar.',
			badges
		)}

		{#snippet avatars()}
			{#snippet sizesRow()}
				<Avatar name="Ada Lovelace Byron" size="sm" />
				<Avatar name="Ada Lovelace Byron" size="md" />
				<Avatar name="Ada Lovelace Byron" size="lg" />
			{/snippet}
			{@render row('22 / 28 / 40', sizesRow)}

			{#snippet oneWord()}
				<Avatar name="Prometheus" />
				<span class="text-sm text-[var(--ink-muted)]">un solo nombre → una inicial</span>
			{/snippet}
			{@render row('sin apellido', oneWord)}

			{#snippet withMeta()}
				<Avatar name="Ada Lovelace Byron" meta="Soporte · Técnico" />
				<Avatar name="Ada Lovelace Byron" meta="Soporte · Técnico" size="lg" />
			{/snippet}
			{@render row('con meta', withMeta)}

			{#snippet withImage()}
				<Avatar name="Ada Lovelace Byron" imageUrl={PORTRAIT} size="sm" />
				<Avatar name="Ada Lovelace Byron" imageUrl={PORTRAIT} />
				<Avatar name="Ada Lovelace Byron" imageUrl={PORTRAIT} size="lg" />
				<Avatar name="Ada Lovelace Byron" imageUrl={PORTRAIT} meta="Soporte · Técnico" />
			{/snippet}
			{@render row('con imagen', withImage)}

			{#snippet brokenImage()}
				<Avatar name="Ada Lovelace Byron" imageUrl="/does-not-exist.png" />
				<span class="text-sm text-[var(--ink-muted)]">
					imagen rota → el disco neutro queda detrás
				</span>
			{/snippet}
			{@render row('imagen rota', brokenImage)}
		{/snippet}
		{@render section(
			'Avatar',
			'Iniciales del nombre y del primer apellido. Superficies siempre neutras: el color significa un dominio o un estado, y una persona no es ninguno de los dos.',
			avatars
		)}

		{#snippet tables()}
			<DataTable
				{columns}
				rows={assets}
				rowKey={(asset) => asset.id}
				rowLabel={(asset) => asset.name}
				href={(asset) => `/assets/${asset.id}`}
				bind:selected
				bind:sort
				emptyMessage="Todavía no hay activos."
			/>

			<p class="mt-[var(--space-3)] text-sm text-[var(--ink-muted)]">
				Seleccionadas: <code class="font-mono">{JSON.stringify(selected)}</code> · orden:
				<code class="font-mono">{sort.key} {sort.direction}</code>. La tabla no reordena las filas:
				anuncia la intención y quien las pidió vuelve a pedirlas.
			</p>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">
				Compacta, sin enlace
			</h3>
			<div class="mt-[var(--space-3)]">
				<DataTable
					columns={columns.slice(0, 4)}
					rows={assets}
					rowKey={(asset) => asset.id}
					compact
					emptyMessage="Todavía no hay activos."
				/>
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Vacía</h3>
			{#snippet createAsset()}
				<Button size="sm">Registrar un activo</Button>
			{/snippet}
			<div class="mt-[var(--space-3)]">
				<DataTable
					{columns}
					rows={[]}
					rowKey={(asset: Asset) => asset.id}
					emptyMessage="Todavía no hay activos registrados."
					emptyAction={createAsset}
				/>
			</div>
		{/snippet}
		{@render section(
			'DataTable',
			'Primera columna el código en monoespaciada, segunda el título en negrita. Selección, orden y enlace de fila son opcionales. Sin filas dibuja el estado vacío con una frase y su acción, no una rejilla vacía.',
			tables
		)}

		{#snippet selects()}
			<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
				<SelectField
					label="Categoría"
					placeholder="Elige una categoría"
					options={selectOptions}
					bind:value={selectValue}
				/>
				<SelectField label="Categoría" options={selectOptions} bind:value={selectWithValue} />
				<SelectField
					label="Ubicación"
					options={selectOptions}
					value=""
					placeholder="Sin ubicación"
					hint="Opcional: la ubicación propia del activo."
				/>
				<SelectField
					label="Modelo"
					placeholder="Elige un modelo"
					options={selectOptions}
					value=""
					error="Elige un modelo."
				/>
				<SelectField label="Estado" options={selectOptions} value="monitors" disabled />
			</div>
		{/snippet}
		{@render section(
			'SelectField',
			'La misma etiqueta, ayuda y error que Field. Con `placeholder` hay una opción vacía seleccionable (lo que envía una columna anulable para «ninguno»); sin él, el valor siempre tiene respuesta.',
			selects
		)}

		{#snippet pagers()}
			<div class="space-y-[var(--space-5)]">
				<Pager page={1} pageCount={8} perPage={25} total={200} href={(page) => `?page=${page}`} />
				<Pager page={4} pageCount={8} perPage={25} total={200} href={(page) => `?page=${page}`} />
				<Pager page={8} pageCount={8} perPage={25} total={200} href={(page) => `?page=${page}`} />
				<Pager page={1} pageCount={1} perPage={25} total={7} href={(page) => `?page=${page}`} />
				<Pager page={1} pageCount={1} perPage={25} total={0} href={(page) => `?page=${page}`} />
			</div>
		{/snippet}
		{@render section(
			'Pager',
			'Primera página, intermedia, última, una sola y vacía. Son enlaces: una página es una URL, así que sobrevive a recargar y al botón de atrás. Quien lo usa decide la URL y conserva su propia cadena de consulta.',
			pagers
		)}

		{#snippet timelines()}
			<div class="max-w-xl">
				<AssetTimeline entries={timelineEntries} />
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Un solo evento</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<AssetTimeline entries={timelineEntries.slice(-1)} />
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Vacío</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<AssetTimeline entries={[]} />
			</div>
		{/snippet}
		{@render section(
			'AssetTimeline',
			'La historia de un activo, del más reciente al más antiguo: una entrada por verbo. Lee solo del registro de actividad; la persona que actuó se resuelve en vivo y el hecho (a quién se asignó) viene congelado en la entrada.',
			timelines
		)}
	</div>
{/if}
