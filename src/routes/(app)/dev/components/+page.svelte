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
	import Field from '#lib/components/unitati/Field.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import {
		BADGED_STATUS_KEYS,
		type AssetState,
		type Priority
	} from '#lib/components/unitati/status.js';
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
			'Cuatro variantes por tres tamaños, más deshabilitado y solo icono. La forma es de pastilla porque las terminaciones de la marca son redondas.',
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
				<span class="font-mono text-xs text-[var(--ink-muted)]">plain</span>
				<StatusBadge status="urgent" plain />
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
				<Avatar name="Ada Lovelace Byron" meta="Soporte · Técnico" />
			{/snippet}
			{@render row('con meta', oneWord)}
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
	</div>
{/if}
