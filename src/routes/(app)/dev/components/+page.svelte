<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import UsersIcon from '@lucide/svelte/icons/users';
	import HouseIcon from '@lucide/svelte/icons/house';
	import AppShell, { type AppShellNavLink } from '#lib/components/unitati/AppShell.svelte';
	import AssetPicker from '#lib/components/unitati/AssetPicker.svelte';
	import type { PickedAsset } from '#lib/components/unitati/asset-choice.js';
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
	import EnvironmentBadge from '#lib/components/unitati/EnvironmentBadge.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RecordRef from '#lib/components/unitati/RecordRef.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread from '#lib/components/unitati/TicketThread.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge, { badge } from '#lib/components/unitati/StatusBadge.svelte';
	import {
		BADGED_STATUS_KEYS,
		type AssetState,
		type Priority
	} from '#lib/components/unitati/status.js';
	import type { TimelineEntry } from '#lib/server/activity/index.js';
	import type { AssetTimelineItem, RelatedGroup } from '#lib/server/links/index.js';
	import type { ThreadItem } from '#lib/server/service-desk/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The ratchet from `components/unitati/README.md`: every variant and every
	 * state of every component in that folder, on one page. A component missing
	 * a case here is a component whose case nobody is looking at.
	 *
	 * Fixtures are invented on purpose — the gallery must render with no database
	 * and no network, or it stops being usable as a workbench.
	 *
	 * Nothing here guards itself: `+page.server.ts` answers 404 in production,
	 * so this component is never reached there. See ADR 0011.
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

	const appShellLinks: AppShellNavLink[] = [
		{ href: '#overview', label: 'Inicio', icon: HouseIcon },
		{
			href: '#assets',
			label: 'Inventario',
			icon: PackageIcon,
			section: 'modules',
			accent: 'var(--asset)',
			count: 1284
		},
		{
			href: '#service-desk',
			label: 'Soporte',
			icon: TicketIcon,
			section: 'modules',
			accent: 'var(--desk)',
			count: 37
		},
		{
			href: '#projects',
			label: 'Proyectos',
			icon: FolderKanbanIcon,
			section: 'modules',
			accent: 'var(--project)',
			count: 6
		},
		{
			href: '#directory',
			label: 'Personas',
			icon: UsersIcon,
			section: 'directory',
			count: 212
		}
	];

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

	let pickedNone = $state<PickedAsset[]>([]);
	let pickedTwo = $state<PickedAsset[]>([
		{ id: '5f0c0000-0000-4000-8000-000000000001', assetTag: 'AST-0001', name: 'MacBook Pro 14' },
		{
			id: '5f0c0000-0000-4000-8000-000000000002',
			assetTag: 'AST-0002',
			name: 'Impresora de planta'
		}
	]);
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

	/**
	 * A conversation with every kind of item: a reply with a file, an internal
	 * note, a system event, and a reply from the technician.
	 */
	const ticketRecord = (tag: string, title: string) => ({
		kind: 'ticket' as const,
		id: `ticket-${tag}`,
		tag,
		title,
		href: `#${tag}`
	});

	const affectedAssets: RelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				{
					ref: {
						kind: 'asset',
						id: 'asset-1',
						tag: 'AST-0001',
						title: 'MacBook Pro 14',
						href: '#AST-0001'
					},
					status: 'in_use',
					linkedAt: at(8, 9)
				}
			]
		}
	];

	const affectedSeveral: RelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				...affectedAssets[0].items,
				{
					ref: {
						kind: 'asset',
						id: 'asset-2',
						tag: 'AST-0002',
						title:
							'Impresora de planta con un nombre especialmente largo para comprobar el recorte',
						href: '#AST-0002'
					},
					status: 'in_repair',
					linkedAt: at(8, 10)
				}
			]
		}
	];

	const ticketsOnAsset: RelatedGroup[] = [
		{
			relation: 'affected_by',
			icon: 'ticket',
			items: [
				{
					ref: ticketRecord('TCK-0093', 'El portátil no despierta tras suspender'),
					status: 'in_progress',
					linkedAt: at(8, 9)
				},
				{
					ref: ticketRecord('TCK-0071', 'La batería se agota por la noche'),
					status: 'resolved',
					linkedAt: at(3, 9)
				}
			]
		}
	];

	const threadItems: ThreadItem[] = [
		{
			kind: 'comment',
			id: 'c1',
			authorPersonId: 'p1',
			authorName: 'Laura Serra',
			body: 'La impresora de la planta 2 no imprime desde esta mañana.\nAdjunto una captura del error.',
			visibility: 'public',
			createdAt: at(8, 9),
			attachments: [{ id: 'a1', filename: 'error.png', contentType: 'image/png', byteSize: 2048 }]
		},
		{
			kind: 'event',
			at: at(8, 10),
			entry: {
				id: 'e1',
				verb: 'ticket.status.changed',
				payload: { from: 'new', to: 'in_progress' },
				occurredAt: at(8, 10),
				actorPersonId: 'p2',
				actorName: 'Grace Hopper'
			}
		},
		{
			kind: 'event',
			at: at(8, 10),
			entry: {
				id: 'e2',
				verb: 'link.asset.added',
				payload: {
					assetId: '5f0c0000-0000-4000-8000-000000000002',
					assetTag: 'AST-0002',
					assetName: 'Impresora de planta'
				},
				occurredAt: at(8, 10),
				actorPersonId: 'p2',
				actorName: 'Grace Hopper'
			}
		},
		{
			kind: 'comment',
			id: 'c2',
			authorPersonId: 'p2',
			authorName: 'Grace Hopper',
			body: 'Parece el spooler otra vez. Reiniciar el servicio de impresión y avisar.',
			visibility: 'internal',
			createdAt: at(8, 11),
			attachments: []
		},
		{
			kind: 'comment',
			id: 'c3',
			authorPersonId: 'p2',
			authorName: 'Grace Hopper',
			body: 'Ya está arreglado: reinicié el servicio. Prueba y dime si sigue fallando.',
			visibility: 'public',
			createdAt: at(8, 12),
			attachments: []
		}
	];

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

	/** Past events and live relations on one rail: the ticket is dated by its link and shows today's status. */
	const timelineItems: AssetTimelineItem[] = [
		{
			kind: 'ticket',
			id: 'ticket-TCK-0093',
			at: at(8, 10),
			record: ticketRecord('TCK-0093', 'El portátil no despierta tras suspender'),
			status: 'in_progress'
		},
		...timelineEntries.map((entry): AssetTimelineItem => ({
			kind: 'activity',
			id: entry.id,
			at: entry.occurredAt,
			entry
		})),
		{
			kind: 'ticket',
			id: 'ticket-TCK-0071',
			at: at(1, 9),
			record: ticketRecord('TCK-0071', 'La batería se agota por la noche'),
			status: 'resolved'
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
	<!-- layout-ok: a prose line capped at reading measure, not a page container -->
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

<svelte:head>
	<title>Componentes · Unitati</title>
</svelte:head>

<PageLayout variant="index" class="pb-[var(--space-12)]">
	<PageHeader title="Componentes">
		{#snippet summary()}
			El banco de trabajo del sistema de diseño. Existe en todos los entornos salvo producción. Un
			componente que no aparece aquí no está terminado.
		{/snippet}
	</PageHeader>

	<div>
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

		{#snippet pickers()}
			<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
				<AssetPicker
					label="Equipos afectados"
					hint="Opcional. Pulsa en la caja para ver los primeros resultados."
					searchUrl="/dev/components/assets"
					bind:selected={pickedNone}
				/>
				<AssetPicker
					label="Equipos afectados"
					searchUrl="/dev/components/assets"
					bind:selected={pickedTwo}
				/>
			</div>
		{/snippet}
		{@render section(
			'AssetPicker',
			'Elige varios activos buscando por etiqueta o nombre. Lo elegido queda como chips, cada uno con un campo oculto `assetIds`; lo ya elegido no vuelve a ofrecerse. Pide los resultados a un endpoint al dejar de teclear, no recibe una lista: con miles de activos una lista truncada ocultaría el que se busca sin avisar. Izquierda, vacío; derecha, con dos elegidos.',
			pickers
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

		{#snippet refs()}
			<div class="space-y-[var(--space-3)]">
				{#snippet assetRef()}
					<RecordRef
						record={{
							kind: 'asset',
							tag: 'AST-0142',
							title: 'MacBook Pro 14 · Laura Serra',
							href: '#AST-0142'
						}}
					/>
				{/snippet}
				{#snippet ticketRef()}
					<RecordRef record={ticketRecord('TCK-1093', 'El portátil no despierta tras suspender')} />
				{/snippet}
				{#snippet truncated()}
					<RecordRef
						class="max-w-64"
						record={ticketRecord(
							'TCK-1093',
							'Un título larguísimo que tiene que recortarse con puntos suspensivos sin tocar la etiqueta'
						)}
					/>
				{/snippet}
				{@render row('asset', assetRef)}
				{@render row('ticket', ticketRef)}
				{@render row('título largo', truncated)}
			</div>
		{/snippet}
		{@render section(
			'RecordRef',
			'Referencia en línea a cualquier registro: icono, etiqueta en monoespaciada y título, teñida por dominio (activo en el color del activo, solicitud en el del servicio). La etiqueta nunca se recorta; el título sí.',
			refs
		)}

		{#snippet relateds()}
			<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">un equipo</p>
					<RelatedRecords groups={affectedAssets} />
				</div>
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">varios (plural), con desvincular</p>
					<RelatedRecords groups={affectedSeveral} unlinkAction="#" />
				</div>
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">pidiendo confirmación</p>
					<RelatedRecords groups={affectedSeveral} unlinkAction="#" confirming="asset-2" />
				</div>
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">tras un desvincular rechazado</p>
					<RelatedRecords
						groups={affectedAssets}
						unlinkAction="#"
						error="No se ha podido desvincular. Inténtalo de nuevo."
					/>
				</div>
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">solicitudes de un equipo</p>
					<RelatedRecords groups={ticketsOnAsset} />
				</div>
				<div class="space-y-[var(--space-2)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">vacío</p>
					<RelatedRecords groups={[]} />
				</div>
			</div>
		{/snippet}
		{@render section(
			'RelatedRecords',
			'El panel lateral de una ficha: los registros vinculados, agrupados por relación. Lee lo que devuelve `relatedTo` sin saber de qué tabla viene. El título del grupo se pluraliza («Equipo afectado» / «Equipos afectados»); los grupos vacíos no se dibujan. Con `unlinkAction` cada elemento ofrece desvincular, que pide confirmación en línea porque destruye contexto, y el contexto es el producto.',
			relateds
		)}

		{#snippet timelines()}
			<div class="max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<AssetTimeline items={timelineItems} />
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Un solo evento</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<AssetTimeline items={timelineItems.slice(1, 2)} />
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Vacío</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<AssetTimeline items={[]} />
			</div>
		{/snippet}
		{@render section(
			'AssetTimeline',
			'La historia de un activo, del más reciente al más antiguo, en una sola línea: lo que pasó (registro de actividad, con el hecho congelado en la entrada) y las solicitudes abiertas sobre él (relación viva, con el estado que tienen hoy). Una solicitud se fecha por cuándo se vinculó y nunca aparece dos veces.',
			timelines
		)}

		{#snippet threads()}
			<div class="max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<TicketThread items={threadItems} attachmentHref={(id) => `#${id}`} />
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">
				Vista del solicitante (sin nota interna)
			</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<TicketThread
					items={threadItems.filter(
						(item) => item.kind !== 'comment' || item.visibility === 'public'
					)}
					attachmentHref={(id) => `#${id}`}
				/>
			</div>

			<h3 class="mt-[var(--space-8)] text-sm font-semibold text-[var(--ink)]">Vacío</h3>
			<div class="mt-[var(--space-3)] max-w-xl">
				<!-- layout-ok: demo width, not a page container -->
				<TicketThread items={[]} attachmentHref={(id) => `#${id}`} />
			</div>
		{/snippet}
		{@render section(
			'TicketThread',
			'La conversación de una solicitud en un solo carril cronológico: respuestas con avatar, notas internas sobre fondo de aviso con su insignia, y los eventos del sistema como una línea atenuada. Un empleado nunca recibe una nota interna: no llega al navegador, no se oculta.',
			threads
		)}

		{#snippet composers()}
			{#snippet staff()}
				<div class="max-w-xl">
					<!-- layout-ok: demo width, not a page container -->
					<TicketComposer action="?/reply" allowInternal placeholder="Responde a Laura…" />
				</div>
			{/snippet}
			{@render row('personal (con nota interna)', staff)}

			{#snippet requester()}
				<div class="max-w-xl">
					<!-- layout-ok: demo width, not a page container -->
					<TicketComposer action="?/reply" />
				</div>
			{/snippet}
			{@render row('solicitante (sin nota interna)', requester)}

			{#snippet refused()}
				<div class="max-w-xl">
					<!-- layout-ok: demo width, not a page container -->
					<TicketComposer action="?/reply" allowInternal error="Un adjunto supera los 10 MB." />
				</div>
			{/snippet}
			{@render row('con error', refused)}
		{/snippet}
		{@render section(
			'TicketComposer',
			'El cuadro al final del hilo. El conmutador «Nota interna» solo existe para quien puede escribirlas; al activarlo el cuadro cambia a tono de aviso y el botón pasa a «Guardar nota». ⌘↵ (o Ctrl+↵) envía.',
			composers
		)}

		{#snippet plainBadges()}
			<span class={badge({ tone: 'warning', plain: true })}>Nota interna</span>
			<span class={badge({ tone: 'danger', plain: true })}>Fuera de plazo</span>
		{/snippet}
		{@render section(
			'Insignia sin punto',
			'Variante «plain» de la insignia: nombra un tipo de cosa (una nota interna), no un estado, así que no lleva punto.',
			plainBadges
		)}

		{#snippet ticketLayouts()}
			<PageLayout variant="record">
				<TicketDetailLayout
					ticketTag="TCK-0093"
					subject="La impresora de la planta 2 no imprime"
					status="in_progress"
					priority="high"
					provenance="Abierta por Laura Serra · 8 oct 2026, 09:15 · desde el portal"
				/>
				<TicketThread items={threadItems} attachmentHref={(id) => `#${id}`} />
				<TicketComposer action="?/reply" allowInternal />

				{#snippet side()}
					<section
						class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
					>
						<h2 class="text-sm font-semibold text-[var(--ink)]">Detalles</h2>
						<p class="mt-[var(--space-2)] text-sm text-[var(--ink-muted)]">
							Solicitante, asignación y cola. «Registros relacionados» llega con #9.
						</p>
					</section>
				{/snippet}
			</PageLayout>
		{/snippet}
		{@render section(
			'TicketDetailLayout',
			'Cabecera de registro (código, estado, prioridad, título, procedencia), la conversación a la izquierda y las tarjetas laterales a 340px. Por debajo de 1100px la columna lateral pasa bajo la cabecera y el hilo sigue primero. La prioridad «normal» no dibuja insignia.',
			ticketLayouts
		)}

		{#snippet shapeNote(label: string, note: string)}
			<p class="font-mono text-xs text-[var(--ink-muted)]">{label}</p>
			<p class="mt-1 text-[13px] leading-[18px] text-[var(--ink-muted)]">{note}</p>
		{/snippet}

		{#snippet recordSide()}
			<div class="h-16 rounded-[var(--radius-md)] bg-[var(--surface-2)]"></div>
		{/snippet}

		{#snippet pageLayouts()}
			<div class="flex flex-col gap-[var(--space-6)]">
				<div>
					{@render shapeNote(
						'index',
						'Fluido hasta el techo (--size-page-max), centrado más allá. Listas y tablas.'
					)}
					<div
						class="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
					>
						<PageLayout variant="index">
							<div class="h-16 rounded-[var(--radius-md)] bg-[var(--asset-soft)]"></div>
						</PageLayout>
					</div>
				</div>

				<div>
					{@render shapeNote(
						'record',
						'El mismo techo, más una columna lateral a 340px por encima de 1100px. Ficha de registro.'
					)}
					<div
						class="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
					>
						<PageLayout variant="record" side={recordSide}>
							<div class="h-16 rounded-[var(--radius-md)] bg-[var(--desk-soft)]"></div>
						</PageLayout>
					</div>
				</div>

				<div>
					<!-- layout-ok: this is prose documenting the fixed measure, not a container -->
					{@render shapeNote(
						'form',
						'max-w-2xl, mx-auto: una medida fija que nunca lee el techo. Formularios y prosa.'
					)}
					<div
						class="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
					>
						<PageLayout variant="form">
							<div class="h-16 rounded-[var(--radius-md)] bg-[var(--project-soft)]"></div>
						</PageLayout>
					</div>
				</div>
			</div>
		{/snippet}
		{@render section(
			'PageLayout',
			'El techo de ancho de página (ADR 0018): tres formas, nada de contenedor por página. `index` es fluido hasta el techo; `record` añade la columna lateral a 340px; `form` es una medida fija que no lo lee nunca.',
			pageLayouts
		)}

		{#snippet pageHeaders()}
			<PageHeader title="Activos" code="AST-0231">
				{#snippet summary()}Una línea, en ink-muted, bajo el título.{/snippet}
				{#snippet actions()}<Button size="sm">Registrar</Button>{/snippet}
			</PageHeader>
		{/snippet}
		{@render section(
			'PageHeader',
			'Código mono opcional sobre el título, el título, un resumen de una línea y acciones alineadas a la derecha. Ningún `PageLayout` dibuja su propio encabezado; es siempre este.',
			pageHeaders
		)}

		{#snippet logos()}
			{#snippet lockups()}
				<Logo variant="lockup" size="sm" />
				<Logo variant="lockup" size="md" />
				<Logo variant="lockup" size="lg" />
			{/snippet}
			{@render row('lockup', lockups)}

			{#snippet marks()}
				<Logo variant="mark" size="sm" />
				<Logo variant="mark" size="md" />
				<Logo variant="mark" size="lg" />
			{/snippet}
			{@render row('mark', marks)}
		{/snippet}
		{@render section(
			'Logo',
			'Símbolo con o sin palabra. La altura es la variante y el ancho sigue la proporción del dibujo, así que ningún tamaño lo deforma. El lockup va en el menú y en el acceso; el símbolo solo, donde no cabe la palabra.',
			logos
		)}

		{#snippet environments()}
			{#each ['development', 'staging', 'production'] as const as environment (environment)}
				{#snippet one()}
					<EnvironmentBadge {environment} />
					{#if environment === 'production'}
						<span class="text-sm text-[var(--ink-muted)]">(no renderiza nada)</span>
					{/if}
				{/snippet}
				{@render row(environment, one)}
			{/each}
		{/snippet}
		{@render section(
			'EnvironmentBadge',
			'Avisa de que no es producción. Un tono por entorno no productivo, para que una captura de desarrollo no se confunda con una de preproducción. En producción no dibuja nada.',
			environments
		)}

		{#snippet appShellSpecimen()}
			<!-- Fake counts: a static specimen, not wired to any domain query. -->
			<div
				class="relative isolate h-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)]"
			>
				<AppShell links={appShellLinks} showSearch>
					{#snippet topbarEnd()}
						<span class="text-sm text-[var(--ink)]">Ada Lovelace</span>
					{/snippet}
					<h1 class="font-display text-lg font-semibold text-[var(--ink)]">Soporte</h1>
					<p class="mt-1 text-sm text-[var(--ink-muted)]">
						37 abiertos · 4 esperando al usuario · 2 fuera de SLA
					</p>
				</AppShell>
			</div>
		{/snippet}
		{@render section(
			'AppShell',
			'El marco de cada página de (app): barra lateral y cabecera fijas, con su propio scroll independiente del documento. Buscar primero, luego MÓDULOS (con el punto de dominio y el contador por módulo) y DIRECTORIO. En menos de 768px pasa a un cajón; en escritorio se puede contraer a una regla de 64px con el botón junto al logo.',
			appShellSpecimen
		)}
	</div>
</PageLayout>
