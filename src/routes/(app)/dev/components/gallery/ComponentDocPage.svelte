<script lang="ts">
	import type { Snippet } from 'svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import type { PropDoc } from './manifest.js';

	interface Props {
		/** The component's own name, shown as the page title. */
		name: string;
		/** One line, repeated from the manifest so the two never drift. */
		summary: string;
		/** Its exact semantic role: navigation vs action, warning vs destructive, panel vs inset. */
		role: string;
		whenToUse: string[];
		whenNotToUse: string[];
		propsDoc: PropDoc[];
		/** A short, compilable snippet a reader can paste. */
		usage: string;
		referenceHref: string;
		referenceLabel: string;
		/** Live variants and states: focus/disabled/error/empty/long strings, as the component has them. */
		demo: Snippet;
		/** A rule transcribed from the design system that this component's demo makes visible. */
		notes?: Snippet;
	}

	let {
		name,
		summary: summaryText,
		role,
		whenToUse,
		whenNotToUse,
		propsDoc,
		usage,
		referenceHref,
		referenceLabel,
		demo,
		notes
	}: Props = $props();

	const headerCode = $derived(`unitati/${name}.svelte`);
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title={name} code={headerCode}>
		{#snippet summary()}
			{summaryText}
		{/snippet}
	</PageHeader>

	<WorkPanel heading="Qué es">
		<div class="flex flex-col gap-[var(--space-3)] text-sm leading-[22px] text-[var(--ink)]">
			<p>{role}</p>
			<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
				<div>
					<h3
						class="ut-muted mb-[var(--space-1)] text-xs font-semibold tracking-[0.04em] uppercase"
					>
						Usar cuando
					</h3>
					<ul class="m-0 flex list-disc flex-col gap-1 pl-[var(--space-4)]">
						{#each whenToUse as reason (reason)}
							<li>{reason}</li>
						{/each}
					</ul>
				</div>
				<div>
					<h3
						class="ut-muted mb-[var(--space-1)] text-xs font-semibold tracking-[0.04em] uppercase"
					>
						No usar cuando
					</h3>
					<ul class="m-0 flex list-disc flex-col gap-1 pl-[var(--space-4)]">
						{#each whenNotToUse as reason (reason)}
							<li>{reason}</li>
						{/each}
					</ul>
				</div>
			</div>
			<p class="text-[13px] text-[var(--ink-muted)]">
				Referencia:
				<a
					href={referenceHref}
					target="_blank"
					rel="noopener noreferrer"
					class="underline hover:no-underline">{referenceLabel}</a
				>
			</p>
		</div>
	</WorkPanel>

	<WorkPanel heading="Variantes y estados">
		<div class="flex flex-col gap-[var(--space-5)]">
			{@render demo()}
		</div>
	</WorkPanel>

	{#if notes}
		<WorkPanel heading="Notas">
			{@render notes()}
		</WorkPanel>
	{/if}

	<WorkPanel heading="Props">
		<div class="overflow-x-auto">
			<table class="ut-table w-full text-sm">
				<thead>
					<tr>
						<th class="px-[var(--space-3)] py-2 text-left">Nombre</th>
						<th class="px-[var(--space-3)] py-2 text-left">Tipo</th>
						<th class="px-[var(--space-3)] py-2 text-left">Por defecto</th>
						<th class="px-[var(--space-3)] py-2 text-left">Descripción</th>
					</tr>
				</thead>
				<tbody>
					{#each propsDoc as prop (prop.name)}
						<tr>
							<td class="px-[var(--space-3)] py-2 font-mono text-xs">{prop.name}</td>
							<td class="px-[var(--space-3)] py-2 font-mono text-xs text-[var(--ink-muted)]"
								>{prop.type}</td
							>
							<td class="px-[var(--space-3)] py-2 font-mono text-xs text-[var(--ink-muted)]"
								>{prop.default ?? '—'}</td
							>
							<td class="px-[var(--space-3)] py-2">{prop.description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</WorkPanel>

	<WorkPanel heading="Uso">
		<pre
			class="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-2)] p-[var(--space-3)] text-xs leading-[18px]"><code
				>{usage}</code
			></pre>
	</WorkPanel>
</div>
