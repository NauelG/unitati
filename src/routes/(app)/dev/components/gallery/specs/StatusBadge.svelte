<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { BADGED_STATUS_KEYS, STATE_GROUP_KEYS } from '#lib/components/unitati/status.js';
</script>

<ComponentDocPage
	name="StatusBadge"
	summary="Insignia de estado, derivada de una clave de dominio, nunca de texto libre."
	role="Recibe una StatusKey, nunca un texto a mostrar: status.ts resuelve el tono y la etiqueta, así un texto como 'En curso' falla npm run check en vez de renderizar una insignia sin traducir. normal (prioridad por defecto) no renderiza nada a propósito: una fila que grita 'Normal' en cada línea enseña a dejar de mirar."
	whenToUse={[
		'Mostrar el estado de un ticket, la prioridad o el estado de un activo en una tabla o ficha.',
		'Siempre con una clave del dominio (status.ts / domain/status.ts), nunca con una cadena suelta.'
	]}
	whenNotToUse={[
		'Para marcar un entorno no-productivo: usa EnvironmentBadge, que resuelve su propio tono.',
		'Para nombrar un tipo de cosa sin estado (p. ej. "Portátil"): usa la variante plain del propio tv() badge, no este componente.'
	]}
	propsDoc={[
		{
			name: 'status',
			type: 'BadgeKey',
			description:
				'Unión de tipos en tiempo de compilación: TicketStatus | Priority | AssetState | StateGroup.'
		}
	]}
	usage={`<StatusBadge status={ticket.status} />
<StatusBadge status={ticket.priority} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — insignias de estado en pill completo"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Todas las claves con insignia
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-2)]">
				{#each BADGED_STATUS_KEYS as key (key)}
					<StatusBadge status={key} />
				{/each}
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Grupos de estado de proyecto
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-2)]">
				{#each STATE_GROUP_KEYS as group (group)}
					<StatusBadge status={group} />
				{/each}
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				"normal" no renderiza nada
			</p>
			<p class="text-sm text-[var(--ink-muted)]">
				<StatusBadge status="normal" />(vacío, a propósito) — prioridad por defecto.
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
