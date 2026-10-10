<script lang="ts">
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const implemented = $derived(data.rows.filter((row) => row.status === 'implemented'));
	const modifiedOrDeprecated = $derived(
		data.rows.filter((row) => row.status === 'modified' || row.status === 'deprecated')
	);
	const notYetBuilt = $derived(data.rows.filter((row) => row.status === 'not-yet-built'));
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Cobertura">
		{#snippet summary()}
			El vocabulario <code class="font-mono text-xs">ut-*</code> derivado de
			<code class="font-mono text-xs">docs/design/assets/css/components.css</code>, cruzado con el
			manifiesto de la galería. {implemented.length} de {data.rows.length} clases tienen un componente;
			el resto es markup de referencia que el handoff adelanta a su propia implementación.
		{/snippet}
	</PageHeader>

	<WorkPanel heading="Implementadas">
		<div class="overflow-x-auto">
			<table class="ut-table w-full text-sm">
				<thead>
					<tr>
						<th class="px-[var(--space-3)] py-2 text-left">Clase</th>
						<th class="px-[var(--space-3)] py-2 text-left">Componente</th>
					</tr>
				</thead>
				<tbody>
					{#each implemented as row (row.className)}
						<tr>
							<td class="px-[var(--space-3)] py-2 font-mono text-xs">.{row.className}</td>
							<td class="px-[var(--space-3)] py-2">
								{#if row.galleryHref}
									<a href={row.galleryHref} class="underline hover:no-underline"
										>{row.implementedBy}</a
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</WorkPanel>

	<WorkPanel heading="Modificadas o obsoletas (supersesión intencional)">
		{#if modifiedOrDeprecated.length === 0}
			<p class="text-sm text-[var(--ink-muted)]">
				Ninguna hoy. ADR 0019 cambió qué token lee una clase, no la clase en sí — cuando una clase
				quede realmente obsoleta o modificada respecto a la referencia, su fila aparece aquí con la
				razón documentada en lugar de borrarse en silencio.
			</p>
		{:else}
			<ul class="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
				{#each modifiedOrDeprecated as row (row.className)}
					<li class="text-sm">
						<span class="font-mono text-xs">.{row.className}</span> ·
						<span class="font-semibold">{row.status}</span> · {row.note}
					</li>
				{/each}
			</ul>
		{/if}
	</WorkPanel>

	<WorkPanel heading="Sin construir todavía">
		<p class="mb-[var(--space-3)] text-sm text-[var(--ink-muted)]">
			Markup de referencia que el handoff del diseño incluye antes de que exista su componente
			Svelte. No implica que una clase esté mal: el status aquí es honesto, no una lista negra.
		</p>
		<div class="flex flex-wrap gap-[var(--space-2)]">
			{#each notYetBuilt as row (row.className)}
				<span class="font-mono text-xs text-[var(--ink-muted)]">.{row.className}</span>
			{/each}
		</div>
	</WorkPanel>

	<WorkPanel heading="Guardia de regresión">
		<p class="text-sm text-[var(--ink-muted)]">
			<code class="font-mono text-xs"
				>src/routes/(app)/dev/components/gallery/gallery.guard.spec.ts</code
			>
			falla si un `unitati/*.svelte` nuevo no tiene entrada en el manifiesto ni una excepción documentada.
			Hoy: <StatusBadge status="in_use" />
			{data.manifestCount} componentes en el manifiesto, {data.exceptionCount} excepciones.
		</p>
	</WorkPanel>
</div>
