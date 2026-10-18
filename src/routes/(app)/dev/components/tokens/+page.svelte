<script lang="ts">
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	interface SupportRow {
		id: string;
		tag: string;
		name: string;
	}

	const oneRowSupportList: SupportRow[] = [{ id: '1', tag: 'AST-0231', name: 'MacBook Pro 14"' }];
	const columns: DataTableColumn<SupportRow>[] = [
		{ key: 'tag', header: 'Código', cell: tagCell },
		{ key: 'name', header: 'Nombre', cell: nameCell }
	];

	const longReport =
		'El portátil no enciende desde ayer por la tarde. Lo he dejado cargando toda la noche con el cargador original y el piloto no se ilumina en ningún momento. He probado también con otro cable y otro enchufe, sin cambios. No se oye ningún ventilador ni se nota calor en la carcasa. Antes de que ocurriera, el equipo venía funcionando con lentitud desde la última actualización.';
</script>

{#snippet tagCell(row: SupportRow)}{row.tag}{/snippet}
{#snippet nameCell(row: SupportRow)}{row.name}{/snippet}

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Tokens">
		{#snippet summary()}
			El lenguaje visual (ADR 0019), leído directamente de
			<code class="font-mono text-xs">docs/design/assets/tokens.json</code> en cada carga: esta página
			no repite los valores, los muestra.
		{/snippet}
	</PageHeader>

	<WorkPanel heading="Superficies y contraste">
		<div class="grid gap-[var(--space-3)] sm:grid-cols-3">
			<div
				class="rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-4)]"
				style:background="var(--surface-0)"
			>
				<p class="text-xs font-semibold text-[var(--ink)]">surface-0 · lienzo</p>
				<p class="mt-1 text-small text-[var(--ink-muted)]">Fondo del shell de la app.</p>
			</div>
			<div
				class="rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-4)]"
				style:background="var(--surface-1)"
			>
				<p class="text-xs font-semibold text-[var(--ink)]">surface-1 · panel</p>
				<p class="mt-1 text-small text-[var(--ink-muted)]">Área de trabajo primaria y WorkPanel.</p>
			</div>
			<div
				class="rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-4)]"
				style:background="var(--surface-2)"
			>
				<p class="text-xs font-semibold text-[var(--ink)]">surface-2 · secundaria</p>
				<p class="mt-1 text-small text-[var(--ink-muted)]">
					Cabecera de tabla, fila activa del sidebar.
				</p>
			</div>
		</div>
		<!--
			Both themes at once (#90). The dark swatch carries `class="dark"`
			itself, which is why the token block in `app.css` is written as `.dark`
			rather than `:root.dark`: custom properties declared by a rule matching
			an element are visible to that element's own `var()`, so one class on
			one `<span>` re-resolves every token inside it.

			Rendered live rather than printed from `token.value.dark`, and the
			difference matters — a swatch showing the hex from `tokens.json` would
			stay green while the stylesheet had drifted away from the handoff. This
			column shows what the CSS actually does, so the two columns are a test
			of `app.css`, not a second copy of the JSON.
		-->
		<div class="mt-[var(--space-4)] overflow-x-auto">
			<table class="ut-table w-full text-sm">
				<thead>
					<tr>
						<th class="px-[var(--space-3)] py-2 text-left">Token</th>
						<th class="px-[var(--space-3)] py-2 text-left">Claro</th>
						<th class="px-[var(--space-3)] py-2 text-left">Oscuro</th>
						<th class="px-[var(--space-3)] py-2 text-left">Uso</th>
					</tr>
				</thead>
				<tbody>
					{#each data.colorTokens as token (token.name)}
						<tr>
							<td class="px-[var(--space-3)] py-2 font-mono text-xs">--{token.name}</td>
							<td class="px-[var(--space-3)] py-2">
								<span
									class="inline-block size-4 rounded-[var(--radius-sm)] border border-[var(--border)] align-middle"
									style:background="var(--{token.name})"
									title={token.value.light}
								></span>
							</td>
							<td class="px-[var(--space-3)] py-2">
								<span
									class="dark inline-block size-4 rounded-[var(--radius-sm)] border border-[var(--border)] align-middle"
									style:background="var(--{token.name})"
									title={token.value.dark}
								></span>
							</td>
							<td class="px-[var(--space-3)] py-2 text-[var(--ink-muted)]">{token.usage}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</WorkPanel>

	<WorkPanel heading="Escalera tipográfica">
		<div class="flex flex-col gap-[var(--space-5)]">
			{#each data.typeGroups as group (group.name)}
				<div>
					<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
						{group.name} · font-{group.family}
					</p>
					<div class="flex flex-col gap-[var(--space-3)]">
						{#each group.styles as style (style.name)}
							<div class="border-b border-[var(--border)] pb-[var(--space-2)] last:border-0">
								<p
									style:font-family="var(--font-{group.family})"
									style:font-size={style.fontSize}
									style:line-height={style.lineHeight}
									style:font-weight={style.fontWeight}
									style:letter-spacing={style.letterSpacing}
									class="text-[var(--ink)]"
								>
									{style.sample}
								</p>
								<p class="mt-1 text-xs text-[var(--ink-muted)]">
									<span class="font-mono"
										>{style.name === 'body-strong'
											? 'text-body font-medium'
											: `text-${style.name}`}</span
									>
									· {style.fontSize}/{style.lineHeight}
									·
									{style.usage}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{/each}
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					body-lg con texto largo (especimen de bajo contraste de datos)
				</p>
				<p class="max-w-2xl text-body-lg text-[var(--ink)]">
					<!-- layout-ok: medida de prosa, no un contenedor de página -->
					{longReport}
				</p>
			</div>
		</div>
	</WorkPanel>

	<WorkPanel heading="Espaciado">
		<div class="flex flex-wrap items-end gap-[var(--space-4)]">
			{#each data.spacingTokens as token (token.name)}
				<div class="flex flex-col items-center gap-1">
					<div
						class="bg-[var(--brand-soft)]"
						style:width={token.value}
						style:height={token.value}
					></div>
					<p class="font-mono text-xs text-[var(--ink-muted)]">--{token.name}</p>
				</div>
			{/each}
		</div>
	</WorkPanel>

	<WorkPanel heading="Radios: controles de 8px, paneles de 12px, pill completo">
		<div class="grid gap-[var(--space-4)] sm:grid-cols-3">
			<div
				class="flex h-[var(--size-control-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--action)] text-sm font-semibold text-[var(--on-action)]"
			>
				radius-md · 8px — botones, inputs, selects
			</div>
			<div
				class="flex h-[var(--size-control-md)] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] text-sm"
			>
				radius-lg · 12px — paneles, tarjetas
			</div>
			<div
				class="flex h-[var(--size-control-md)] items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] text-sm text-[var(--brand)]"
			>
				radius-full — insignias, avatares
			</div>
		</div>
	</WorkPanel>

	<WorkPanel heading="Elevación">
		<div class="grid gap-[var(--space-5)] sm:grid-cols-3">
			{#each data.shadowTokens as token (token.name)}
				<div
					class="rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-[var(--space-4)] text-sm"
					style:box-shadow="var(--{token.name})"
				>
					<p class="font-mono text-xs text-[var(--ink-muted)]">--{token.name}</p>
					<p class="mt-1 text-[var(--ink-muted)]">{token.usage}</p>
				</div>
			{/each}
		</div>
	</WorkPanel>

	<WorkPanel heading="Tamaños de control">
		<!-- layout-ok: ancho fijo de la barra de la especimen, no un contenedor de página -->
		<div class="flex flex-col gap-[var(--space-3)]">
			{#each data.sizeTokens as token (token.name)}
				<div class="flex items-center gap-[var(--space-3)]">
					<p class="w-40 shrink-0 font-mono text-xs text-[var(--ink-muted)]">--{token.name}</p>
					<div
						class="max-w-40 rounded-[var(--radius-md)] bg-[var(--surface-2)]"
						style:width="var(--{token.name})"
						style:height={token.name.startsWith('size-icon') ? `var(--${token.name})` : '24px'}
					></div>
					<p class="font-mono text-xs text-[var(--ink-muted)]">{token.value}</p>
				</div>
			{/each}
		</div>
	</WorkPanel>

	<WorkPanel heading="Especimen de bajos datos: lista de soporte de una fila">
		<DataTable
			{columns}
			rows={oneRowSupportList}
			rowKey={(row) => row.id}
			emptyMessage="Sin activos relacionados."
		/>
	</WorkPanel>
</div>
