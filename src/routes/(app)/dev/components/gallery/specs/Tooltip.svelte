<script lang="ts">
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Tooltip from '#lib/components/unitati/Tooltip.svelte';
</script>

<ComponentDocPage
	name="Tooltip"
	summary="Etiqueta flotante para controles de solo icono, en hover y foco."
	role="Sustituye al atributo title nativo, lento y sin estilo, en los iconos del raíl del sidebar. Envuelve el elemento del llamador: él pinta el botón o el enlace y recibe las props del disparador. El control sigue necesitando su aria-label; el tooltip es una ayuda visual."
	whenToUse={['Controles de solo icono cuyo nombre no es visible (el raíl del sidebar).']}
	whenNotToUse={[
		'Si la etiqueta ya está visible junto al icono: usa disabled.',
		'Para contenido interactivo o largo: usa un Popover.'
	]}
	propsDoc={[
		{ name: 'content', type: 'string', description: 'El texto del tooltip.' },
		{
			name: 'side',
			type: "'top' | 'right' | 'bottom' | 'left'",
			default: "'right'",
			description: 'Hacia dónde se abre.'
		},
		{
			name: 'disabled',
			type: 'boolean',
			default: 'false',
			description: 'Pinta el disparador sin tooltip.'
		},
		{
			name: 'child',
			type: 'Snippet<[{ props }]>',
			description: 'El elemento disparador; extiende props sobre él.'
		}
	]}
	usage={`<Tooltip content="Configuración">
  {#snippet child({ props })}
    <a {...props} href="/settings" aria-label="Configuración">…</a>
  {/snippet}
</Tooltip>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0015-appshell-and-responsive-navigation.md"
	referenceLabel="ADR 0015 — AppShell y navegación responsiva"
>
	{#snippet demo()}
		<div class="flex gap-[var(--space-6)] p-[var(--space-6)]">
			{#each ['right', 'top', 'bottom', 'left'] as const as side (side)}
				<Tooltip content={`Lado: ${side}`} {side}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label={`Configuración (${side})`}
							class="grid size-8 place-items-center rounded-[var(--radius-md)] hover:bg-[var(--surface-2)]"
						>
							<SettingsIcon class="size-4" aria-hidden="true" />
						</button>
					{/snippet}
				</Tooltip>
			{/each}
		</div>
	{/snippet}
</ComponentDocPage>
