<script lang="ts">
	import type { Snippet } from 'svelte';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
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

	/**
	 * The dark preview (#90): every component page can render its own demo on
	 * the dark canvas without leaving the page or changing the app's theme.
	 *
	 * Local state, deliberately not `setMode`. The audit this phase asks for is
	 * "does *this* component survive dark" — flipping the whole app would make
	 * that a sequence of two page loads, and it would also take the gallery's
	 * own chrome with it, which is not what is under inspection. A `.dark`
	 * wrapper around the demo region answers the question in place, with the
	 * light version still on screen in memory one click away.
	 *
	 * This is the second consumer that forces the `.dark` token block to be a
	 * class selector rather than `:root.dark` — the first is the token table.
	 */
	let darkPreview = $state(false);
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
		{#snippet actions()}
			<button
				type="button"
				class="ut-transition-fast flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--border-strong)] px-[var(--space-3)] py-1 text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
				onclick={() => (darkPreview = !darkPreview)}
				aria-pressed={darkPreview}
			>
				{#if darkPreview}
					<SunIcon class="size-[var(--size-icon-sm)]" aria-hidden="true" />
					Ver en claro
				{:else}
					<MoonIcon class="size-[var(--size-icon-sm)]" aria-hidden="true" />
					Ver en oscuro
				{/if}
			</button>
		{/snippet}

		<!--
			`--surface-0` is painted explicitly on the wrapper when the preview is
			dark. Without it the demo's own dark tokens would sit on the light
			panel behind them, and every component would look like it had a
			contrast bug it does not have.
		-->
		<div
			class={[
				'flex flex-col gap-[var(--space-5)] rounded-[var(--radius-md)]',
				darkPreview && 'dark bg-[var(--surface-0)] p-[var(--space-4)]'
			]}
		>
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
