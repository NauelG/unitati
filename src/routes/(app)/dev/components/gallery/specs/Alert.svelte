<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
</script>

<ComponentDocPage
	name="Alert"
	summary="Feedback persistente que se queda en contexto: error de formulario, aviso operativo, nota permanente."
	role="Nunca un color de dominio (--brand/--desk/--project) para una señal de éxito o error: info usa la misma superficie neutra que un badge neutral, no --brand. danger anuncia con role=&quot;alert&quot;/aria-live=&quot;assertive&quot; (una validación interrumpe); info/success/warning usan role=&quot;status&quot;/polite (un aviso que se queda no interrumpe). Un toast transitorio (éxito/fallo puntual) es un componente aparte (#89); este nunca lo sustituye."
	whenToUse={[
		'Un error de formulario a nivel de formulario (no de campo): arriba del formulario, tone="danger".',
		'Un aviso operativo persistente: "este activo está en préstamo", tone="warning" o "info".',
		'Una confirmación de que algo persistente ha quedado así (no un éxito puntual de red): tone="success".'
	]}
	whenNotToUse={[
		'Un error de un campo concreto: Field/SelectField ya lo asocian con aria-describedby; duplicarlo aquí lo anuncia dos veces.',
		'Un éxito o fallo transitorio de una acción de red: eso es un toast (#89), no este componente.',
		'Una confirmación destructiva o de desvincular: usa ConfirmDialog, nunca un Alert con botones de sí/no.'
	]}
	propsDoc={[
		{
			name: 'tone',
			type: "'info' | 'success' | 'warning' | 'danger'",
			default: "'info'",
			description: 'Decide color, icono y el role/aria-live de anuncio.'
		},
		{
			name: 'title',
			type: 'string',
			description: 'Opcional: una cabecera corta sobre la descripción.'
		},
		{ name: 'children', type: 'Snippet', description: 'La descripción. Requerido.' },
		{
			name: 'actions',
			type: 'Snippet',
			default: '—',
			description:
				'Una fila de acciones bajo la descripción (reintentar, deshacer, ir al registro).'
		},
		{
			name: 'dismissible',
			type: 'boolean',
			default: 'false',
			description:
				'Solo un alert descartable lleva botón de cerrar; uno sin él nunca desaparece por su cuenta.'
		},
		{
			name: 'onDismiss',
			type: '() => void',
			description: 'Llamado al pulsar cerrar, cuando dismissible es true.'
		}
	]}
	usage={`<Alert tone="danger">{form.message}</Alert>

<Alert tone="warning" title="Activo en préstamo">
  Este equipo está asignado a otra persona desde hace 40 días.
</Alert>`}
	referenceHref="https://www.shadcn-svelte.com/docs/components/alert"
	referenceLabel="shadcn-svelte — Alert"
>
	{#snippet demo()}
		<div class="flex flex-col gap-[var(--space-3)]">
			<p class="ut-muted mb-1 text-xs font-semibold tracking-[0.04em] uppercase">
				Los cuatro tonos
			</p>
			<Alert tone="info" title="Nota">Esta categoría todavía no tiene modelos asociados.</Alert>
			<Alert tone="success" title="Guardado">Los cambios se han aplicado a 12 activos.</Alert>
			<Alert tone="warning" title="En préstamo"
				>Este equipo lleva 40 días fuera de su ubicación habitual.</Alert
			>
			<Alert tone="danger" title="No se pudo guardar"
				>Revisa los campos marcados e inténtalo de nuevo.</Alert
			>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con acciones</p>
			<Alert tone="warning" title="Sesión a punto de caducar">
				<!-- eslint-disable-next-line svelte/no-useless-children-snippet -- prettier always makes this explicit once a sibling `actions` snippet exists -->
				{#snippet children()}Guarda tus cambios antes de que termine la sesión.{/snippet}
				{#snippet actions()}
					<Button variant="secondary" size="sm">Renovar sesión</Button>
				{/snippet}
			</Alert>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Descartable</p>
			<Alert tone="info" dismissible>Puedes cerrar este aviso; no vuelve a aparecer solo.</Alert>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Mensaje largo</p>
			<Alert tone="danger" title="No se pudo eliminar">
				La categoría "Portátiles" no se puede eliminar porque usan. Reasigna esos modelos a otra
				categoría antes de intentarlo de nuevo.
			</Alert>
		</div>
	{/snippet}
</ComponentDocPage>
