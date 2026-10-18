<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';

	let openDialog = $state(false);
	let openSheet = $state(false);
</script>

<ComponentDocPage
	name="CloseButton"
	summary="El botón de cerrar de un overlay, con nombre accesible en español."
	role="Dialog.Content y Sheet.Content vendorizados pintan su propio botón con un 'Close' sr-only en inglés, y ui/ no se edita (ADR 0011); la UI es es-ES (ADR 0008). Por eso cada overlay de unitati pasa showCloseButton={false} y renderiza este botón dentro de su contenido. Conserva el data-slot del primitivo (dialog-close / sheet-close), así que la regla de foco de app.css le sigue aplicando."
	whenToUse={[
		'Dentro del contenido de un overlay propio que use Dialog.Root o Sheet.Root directamente (como hacen Dialog, Sheet, KeymapOverlay y el cajón de AppShell).'
	]}
	whenNotToUse={[
		'Fuera de un Dialog.Root o Sheet.Root: Close necesita el contexto del primitivo.',
		'Un overlay hecho con Dialog o Sheet de unitati: ya lo incluyen.'
	]}
	propsDoc={[
		{
			name: 'kind',
			type: "'dialog' | 'sheet'",
			description: 'Qué primitivo cierra; debe ser descendiente de su Root.'
		},
		{
			name: 'class',
			type: 'string',
			description: 'Posición, p. ej. absolute top-2 right-2.'
		}
	]}
	usage={`<Dialog.Content showCloseButton={false}>
	…
	<CloseButton kind="dialog" class="absolute top-2 right-2" />
</Dialog.Content>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0011-component-layers-and-the-gallery.md"
	referenceLabel="ADR 0011 — capas de componentes y galería"
>
	{#snippet demo()}
		<div class="flex flex-wrap gap-[var(--space-3)]">
			<Button size="sm" variant="secondary" onclick={() => (openDialog = true)}>
				Abrir diálogo
			</Button>
			<Button size="sm" variant="secondary" onclick={() => (openSheet = true)}>Abrir panel</Button>
		</div>
		<Dialog
			open={openDialog}
			onOpenChange={(next) => (openDialog = next)}
			title="Cierre en el diálogo"
			description="La X arriba a la derecha es el CloseButton; su nombre accesible es «Cerrar»."
		>
			<Button size="sm" variant="ghost" onclick={() => (openDialog = false)}>Cancelar</Button>
		</Dialog>
		<Sheet
			open={openSheet}
			onOpenChange={(next) => (openSheet = next)}
			title="Cierre en el panel"
			description="Misma pieza con kind=sheet."
		>
			<Button size="sm" variant="ghost" onclick={() => (openSheet = false)}>Cancelar</Button>
		</Sheet>
	{/snippet}
</ComponentDocPage>
