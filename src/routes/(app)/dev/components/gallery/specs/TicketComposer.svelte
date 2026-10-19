<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';

	function sample(name: string, size: number) {
		const file = new File(['x'], name);
		Object.defineProperty(file, 'size', { value: size });
		return file;
	}
</script>

<ComponentDocPage
	name="TicketComposer"
	summary="Caja de respuesta/nota interna al final de un hilo, con envío por ⌘↵."
	role="Una caja con el editor de texto enriquecido (RichTextEditor, markdown) arriba y una barra abajo: el toggle de nota interna, adjuntar y el botón de enviar con su atajo. allowInternal ausente oculta el toggle del todo — el personal nunca ve esa opción ante un requester."
	whenToUse={['Al final de un TicketThread, para responder o añadir una nota interna.']}
	whenNotToUse={[
		'Para cualquier otro formulario de texto libre: este componente es específico de la conversación de un ticket.'
	]}
	propsDoc={[
		{ name: 'action', type: 'string', description: 'El form action, p. ej. "?/reply".' },
		{
			name: 'allowInternal',
			type: 'boolean',
			default: 'false',
			description: 'Si el viewer puede escribir notas internas; los empleados nunca ven el toggle.'
		},
		{
			name: 'error',
			type: 'string',
			description: 'Mostrado bajo la caja cuando el último envío fue rechazado.'
		},
		{
			name: 'placeholder',
			type: 'string',
			description: 'Sustituye el placeholder por defecto (público/interno).'
		},
		{
			name: 'initialFiles / initialDragging / initialAttachmentError',
			type: 'File[] / boolean / string',
			description:
				'Solo para la galería: muestran los chips, el estado de arrastre y el mensaje de adjuntos.'
		}
	]}
	usage={`<TicketComposer action="?/reply" allowInternal={isStaff} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — compositor del hilo"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Personal (con toggle de nota interna)
			</p>
			<TicketComposer action="#" allowInternal />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Portal (sin toggle)
			</p>
			<TicketComposer action="#" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con error</p>
			<TicketComposer action="#" error="No se pudo enviar: el ticket ya está cerrado." />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Sin archivos</p>
			<TicketComposer action="#" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Con dos archivos
			</p>
			<TicketComposer
				action="#"
				initialFiles={[sample('informe.pdf', 245760), sample('captura.png', 1572864)]}
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Arrastrando archivos
			</p>
			<TicketComposer action="#" initialDragging />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Con error de adjuntos
			</p>
			<TicketComposer
				action="#"
				initialFiles={[sample('informe.pdf', 245760)]}
				initialAttachmentError="video.mov supera el máximo de 10 MB por archivo."
			/>
		</div>
	{/snippet}
</ComponentDocPage>
