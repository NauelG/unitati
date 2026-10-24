<script lang="ts">
	import { scale } from 'svelte/transition';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import RollingNumber from '#lib/components/unitati/RollingNumber.svelte';
	import RollingText from '#lib/components/unitati/RollingText.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { springIn } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { countToken, rollingSummary } from '#lib/rolling.js';
	import type { AssetRelatedGroup } from '#lib/server/links/index.js';

	/**
	 * The signature moments (#91), each with the one causal relation it
	 * explains. A moment that cannot fill this column is decoration, and the
	 * motion constitution (rule 6) says to delete it.
	 */
	const RATIONALE = [
		{
			moment: 'S1 — el morph del registro (#87)',
			explains: 'Esta fila de la lista es esta cabecera: la etiqueta viaja de una a otra.'
		},
		{
			moment: 'S2 — la cabecera viva',
			explains:
				'Lo que acabas de hacer cambió estos números: asignar un activo baja «sin asignar»; resolver una solicitud baja las abiertas.'
		},
		{
			moment: 'S2 — el pulso único',
			explains:
				'Esta solicitud es nueva en la lista y urgente. Una vez, nunca en la carga inicial, nunca en bucle.'
		},
		{
			moment: 'S2 — el check del onboarding',
			explains: 'Este paso acaba de quedar hecho, y el progreso avanza con él.'
		},
		{
			moment: 'S3 — la constelación (decisión D8: go)',
			explains:
				'Este registro está conectado a estos otros: las relaciones son el producto, y aquí se ven.'
		}
	];

	let total = $state(12);
	let unassigned = $state(3);
	function assign() {
		unassigned = Math.max(0, unassigned - 1);
	}

	let arrived = $state(false);
	let pulseRun = $state(0);
	function injectUrgent() {
		pulseRun += 1;
		arrived = false;
		requestAnimationFrame(() => (arrived = true));
	}

	let done = $state(2);
	const STEPS = 4;

	const linkedAt = new Date('2026-01-01T10:00:00Z');
	function tickets(count: number): AssetRelatedGroup[] {
		return [
			{
				relation: 'affected_by',
				icon: 'ticket',
				items: Array.from({ length: count }, (_, i) => {
					const tag = `TCK-${String(i + 12).padStart(4, '0')}`;
					return {
						linkedAt,
						ref: {
							kind: 'ticket' as const,
							id: String(i),
							tag,
							title: `Solicitud ${i}`,
							href: '#'
						},
						status: (['new', 'in_progress', 'resolved'] as const)[i % 3]
					};
				})
			}
		];
	}
	let linked = $state(4);
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Signature">
		{#snippet summary()}
			Los momentos que hacen reconocible el producto (#91): ninguno decora, cada uno explica una
			relación causal, y todos caben en los 240ms de la constitución de movimiento.
		{/snippet}
	</PageHeader>

	<WorkPanel heading="Qué explica cada momento">
		<dl class="m-0 grid gap-[var(--space-3)] text-sm">
			{#each RATIONALE as row (row.moment)}
				<div>
					<dt class="font-semibold text-[var(--ink)]">{row.moment}</dt>
					<dd class="m-0 text-[var(--ink-muted)]">{row.explains}</dd>
				</div>
			{/each}
		</dl>
	</WorkPanel>

	<WorkPanel heading="S2 — el recuento que rueda">
		<div class="flex flex-wrap items-center gap-[var(--space-4)]">
			<p class="m-0 text-[var(--ink-muted)]">
				<RollingText
					{...rollingSummary([
						[total, m.assets_summary_total_one, m.assets_summary_total_other],
						[unassigned, m.assets_summary_unassigned_one, m.assets_summary_unassigned_other]
					])}
				/>
			</p>
			<Button size="sm" variant="secondary" onclick={assign}>Asignar un activo</Button>
		</div>
		<p class="mt-[var(--space-2)] text-xs text-[var(--ink-muted)]">
			El total no se mueve: la custodia cambia «sin asignar», no cuántos activos hay.
		</p>
	</WorkPanel>

	<WorkPanel heading="S2 — el pulso único">
		<div class="flex flex-wrap items-center gap-[var(--space-4)]">
			{#key pulseRun}
				<StatusBadge status="urgent" arrived={pulseRun > 0 && arrived} />
			{/key}
			<Button size="sm" variant="secondary" onclick={injectUrgent}>Llega una urgente</Button>
		</div>
		<p class="mt-[var(--space-2)] text-xs text-[var(--ink-muted)]">
			Al cargar la página no pulsa. Cada pulsación del botón es una llegada: una vez, 160ms.
		</p>
	</WorkPanel>

	<WorkPanel heading="S2 — el check del onboarding">
		<div class="flex flex-wrap items-center gap-[var(--space-4)]">
			<ol class="m-0 flex list-none gap-[var(--space-2)] p-0">
				{#each Array.from({ length: STEPS }, (_, i) => i) as step (step)}
					<li class="size-5 text-[var(--ink-muted)]">
						{#if step < done}
							<span class="block text-[var(--success)]" in:scale={springIn()}>
								<CircleCheck class="size-5" aria-hidden="true" />
							</span>
						{:else}
							<span class="block size-5 rounded-full border-2 border-current"></span>
						{/if}
					</li>
				{/each}
			</ol>
			<span class="text-xs text-[var(--ink-muted)]">
				<RollingText
					text={m.overview_checklist_progress({ done: countToken(0), total: countToken(1) })}
					counts={[done, STEPS]}
				/>
			</span>
			<Button size="sm" variant="secondary" onclick={() => (done = Math.min(STEPS, done + 1))}>
				Completar un paso
			</Button>
			<Button size="sm" variant="ghost" onclick={() => (done = 0)}>Reiniciar</Button>
		</div>
	</WorkPanel>

	<WorkPanel heading="S2 — un número suelto">
		<span class="font-sans text-[28px] font-semibold text-[var(--ink)]">
			<RollingNumber value={total} />
		</span>
		<Button size="sm" variant="secondary" class="ml-[var(--space-4)]" onclick={() => (total += 1)}>
			+1
		</Button>
	</WorkPanel>

	<WorkPanel heading="S3 — la constelación">
		<div class="mb-[var(--space-3)] flex gap-[var(--space-2)]">
			{#each [0, 1, 3, 8, 11] as count (count)}
				<Button
					size="sm"
					variant={linked === count ? 'primary' : 'secondary'}
					onclick={() => (linked = count)}
				>
					{count}
				</Button>
			{/each}
		</div>
		{#key linked}
			<RelationConstellation
				centre={{ kind: 'asset', tag: 'AST-0231' }}
				groups={linked === 0 ? [] : tickets(linked)}
			/>
		{/key}
		{#if linked === 0}
			<p class="text-sm text-[var(--ink-muted)]">
				Sin vínculos no se pinta nada: la lista ya lo dice.
			</p>
		{/if}
	</WorkPanel>
</div>
