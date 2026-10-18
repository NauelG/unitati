<script lang="ts">
	import { flip } from 'svelte/animate';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { MOTION_BASE_MS, prefersReducedMotion, toViewTransitionName } from '#lib/motion.js';

	/**
	 * The motion constitution (#87), agreed in the issue and reproduced here
	 * verbatim: this page is the reviewable law, not a second description of
	 * it drifting from the real one.
	 */
	const CONSTITUTION = [
		'Motion only on state change — nothing loops, nothing idles (sanctioned exception: skeleton shimmer, phase 8).',
		'Budget: 120–160ms micro (hover, press, toggle), 200–240ms macro (navigation morph, panel entry). Nothing above 240ms, ever.',
		'Transform and opacity only — no layout-property animation (sanctioned exception: the constellation edge draw animates `stroke-dashoffset`, paint-only, #91).',
		'Springs for things that move, fades for things that appear.',
		'prefers-reduced-motion kills all non-essential motion globally — one layer, not per-component goodwill.',
		'Every animation explains a causal relation; if it explains nothing, delete it.'
	];

	const TOKENS = [
		{ name: 'motion-fast', value: '120ms', usage: 'Micro: hover, press, toggle.' },
		{
			name: 'motion-base',
			value: '160ms',
			usage: 'Default macro: content cross-fade, menu/sheet exit.'
		},
		{ name: 'motion-slow', value: '240ms', usage: 'Ceiling: the record morph (S1), panel entry.' }
	];

	const reducedMotion = $derived(prefersReducedMotion());

	// S1 demo: the same mechanism DataTable/PageHeader use for the real record
	// morph, replayed locally with `document.startViewTransition` so a
	// reviewer sees it without a real navigation. `view-transition-name` only
	// needs to match between the two states, not between two routes.
	const DEMO_TAG = toViewTransitionName('record', 'DEMO-01');
	let s1Expanded = $state(false);

	function toggleS1() {
		if (!document.startViewTransition || prefersReducedMotion()) {
			s1Expanded = !s1Expanded;
			return;
		}
		document.startViewTransition(() => {
			s1Expanded = !s1Expanded;
		});
	}

	// FLIP demo: a small reorderable list, `animate:flip` on each row.
	let flipItems = $state(['AST-0101', 'AST-0102', 'AST-0103', 'AST-0104']);
	function shuffleFlip() {
		flipItems = [...flipItems].sort(() => Math.random() - 0.5);
	}

	// StatusBadge pulse demo: cycling through tones proves the pulse is
	// change-driven, not mount-driven (it never fires on this snippet's own
	// first render).
	const PULSE_STATUSES = ['new', 'in_progress', 'resolved'] as const;
	let pulseIndex = $state(0);
	function cyclePulse() {
		pulseIndex = (pulseIndex + 1) % PULSE_STATUSES.length;
	}
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Motion">
		{#snippet summary()}
			La constitución de movimiento (#87): nada decorativo, nada por encima de 240ms, y
			<code class="font-mono text-xs">prefers-reduced-motion</code> apaga todo lo no esencial en una sola
			capa.
		{/snippet}
	</PageHeader>

	<WorkPanel heading="La constitución">
		<ol
			class="m-0 flex list-decimal flex-col gap-[var(--space-2)] pl-[var(--space-5)] text-sm text-[var(--ink)]"
		>
			{#each CONSTITUTION as rule (rule)}
				<li>{rule}</li>
			{/each}
		</ol>
	</WorkPanel>

	<WorkPanel heading="Tokens">
		<div class="grid gap-[var(--space-3)] sm:grid-cols-3">
			{#each TOKENS as token (token.name)}
				<div class="rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-4)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">--{token.name}</p>
					<p class="mt-1 text-sm font-semibold text-[var(--ink)]">{token.value}</p>
					<p class="mt-1 text-small text-[var(--ink-muted)]">{token.usage}</p>
					<div
						class="mt-[var(--space-3)] h-2 w-8 rounded-[var(--radius-full)] bg-[var(--brand)] transition-transform ease-[var(--ease-out)] group-hover:scale-x-150"
						style:transition-duration="var(--{token.name})"
					></div>
				</div>
			{/each}
		</div>
	</WorkPanel>

	<WorkPanel heading="prefers-reduced-motion">
		<p class="text-sm text-[var(--ink-muted)]">
			Leído en vivo con <code class="font-mono text-xs">matchMedia</code>. Para probarlo, activa
			"Reducir movimiento" en el sistema operativo (o simúlalo desde las DevTools: Rendering →
			Emulate CSS media feature prefers-reduced-motion) y recarga.
		</p>
		<p class="mt-[var(--space-2)] text-sm font-semibold text-[var(--ink)]">
			Estado actual: {reducedMotion ? 'reducido' : 'normal'}
		</p>
	</WorkPanel>

	<WorkPanel heading="S1 — el morph del registro">
		<p class="text-sm text-[var(--ink-muted)]">
			El mismo mecanismo que usan `DataTable` y `PageHeader` en una navegación real (<code
				class="font-mono text-xs">view-transition-name: {DEMO_TAG}</code
			>), repetido aquí dentro de la misma página con
			<code class="font-mono text-xs">document.startViewTransition</code>.
		</p>
		<div class="mt-[var(--space-3)] flex items-center gap-[var(--space-4)]">
			<Button onclick={toggleS1} size="sm">
				{s1Expanded ? 'Volver a la lista' : 'Abrir el registro'}
			</Button>
			{#if !s1Expanded}
				<span
					style:view-transition-name={DEMO_TAG}
					class="inline-block rounded-[var(--radius-sm)] bg-[var(--asset-soft)] px-[var(--space-2)] py-1 font-mono text-xs font-semibold text-[var(--asset)]"
				>
					DEMO-01
				</span>
			{:else}
				<span
					style:view-transition-name={DEMO_TAG}
					class="inline-block rounded-[var(--radius-md)] bg-[var(--asset-soft)] px-[var(--space-4)] py-[var(--space-2)] font-mono text-sm font-semibold text-[var(--asset)]"
				>
					DEMO-01
				</span>
			{/if}
		</div>
	</WorkPanel>

	<WorkPanel heading="Física de listas — animate:flip">
		<Button onclick={shuffleFlip} size="sm" variant="secondary">Reordenar</Button>
		<ul class="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
			{#each flipItems as tag (tag)}
				<li
					animate:flip={{ duration: MOTION_BASE_MS }}
					class="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-3)] py-[var(--space-2)] font-mono text-xs"
				>
					{tag}
				</li>
			{/each}
		</ul>
	</WorkPanel>

	<WorkPanel heading="StatusBadge — pulso de cambio">
		<p class="text-sm text-[var(--ink-muted)]">
			El pulso es `status` cambiando, nunca el montaje: la insignia no pulsa en la primera carga de
			esta página.
		</p>
		<div class="mt-[var(--space-3)] flex items-center gap-[var(--space-3)]">
			<StatusBadge status={PULSE_STATUSES[pulseIndex]} />
			<Button onclick={cyclePulse} size="sm" variant="secondary">Cambiar estado</Button>
		</div>
	</WorkPanel>
</div>
