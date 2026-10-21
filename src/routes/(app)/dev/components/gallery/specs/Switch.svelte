<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Switch from '#lib/components/unitati/Switch.svelte';

	let on = $state(true);
	let off = $state(false);
</script>

<ComponentDocPage
	name="Switch"
	summary="Interruptor de encendido y apagado, con role=switch."
	role="Un ajuste que se aplica al instante, sin botón de guardar. Es un `<button role=&quot;switch&quot;>`: puede ser el botón de envío de un formulario de un solo campo, así que funciona sin JavaScript. Su estado lo dice `aria-checked` y la posición del tirador, no solo el color."
	whenToUse={[
		'Una preferencia que se activa o desactiva y surte efecto en el acto (preferencias de notificaciones).',
		'Una fila de tabla con un interruptor por columna, cada uno en su propio formulario.'
	]}
	whenNotToUse={[
		'Una opción que solo cuenta al pulsar «Guardar»: usa una casilla dentro del formulario.',
		'Elegir entre más de dos valores: usa SegmentedControl o SelectField.'
	]}
	propsDoc={[
		{
			name: 'checked',
			type: 'boolean',
			description:
				'El estado actual. El componente no lo cambia por sí mismo: lo gobierna quien lo usa.'
		},
		{
			name: 'label',
			type: 'string',
			description: 'El nombre accesible. El interruptor no tiene texto visible propio.'
		},
		{
			name: 'type',
			type: "'button' | 'submit'",
			default: "'button'",
			description: 'Con "submit" envía el formulario que lo contiene.'
		},
		{
			name: 'disabled',
			type: 'boolean',
			description: 'Atributo nativo del <button>, propagado por el spread de rest.'
		}
	]}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0040-transactional-notifications.md"
	referenceLabel="ADR 0040 — las preferencias de notificaciones son su primer uso"
	usage={`<form method="POST" action="?/set" use:enhance>
	<input type="hidden" name="enabled" value={String(!checked)} />
	<Switch type="submit" {checked} label="Por correo" />
</form>`}
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-6)]">
			<Switch checked={on} label="Activado" onclick={() => (on = !on)} />
			<Switch checked={off} label="Desactivado" onclick={() => (off = !off)} />
			<Switch checked={true} label="Bloqueado y activado" disabled />
		</div>
	{/snippet}
</ComponentDocPage>
