<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';

	let openDialog = $state(false);
	let openSheet = $state(false);
</script>

<ComponentDocPage
	name="FormActions"
	summary="La fila de acciones de un formulario en Dialog o Sheet: secundaria primero, primaria última, a la derecha."
	role="El formulario sigue siendo dueño de su fila (ADR 0020: sólo él conoce su etiqueta de envío y su use:enhance); este componente es el layout que compone en vez de escribirlo a mano. Convención: [Cancelar][Guardar], alineado a la derecha, con una regla encima."
	whenToUse={[
		'El pie de cualquier formulario dentro de un Dialog o un Sheet.',
		'sticky cuando el cuerpo del Sheet hace scroll y la fila debe quedarse pegada abajo.'
	]}
	whenNotToUse={[
		'Un formulario de página completa con un único botón de envío: no necesita regla ni orden.',
		'Una confirmación destructiva: ConfirmDialog construye su propio pie.'
	]}
	propsDoc={[
		{
			name: 'sticky',
			type: 'boolean',
			default: 'false',
			description: 'Pegada abajo con fondo, para cuerpos de Sheet con scroll.'
		},
		{ name: 'children', type: 'Snippet', description: 'Los botones, en el orden de la convención.' }
	]}
	usage={`<FormActions>
  <Button type="button" variant="ghost" onclick={close}>Cancelar</Button>
  <Button type="submit">Guardar</Button>
</FormActions>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0020-form-workflow-shapes.md"
	referenceLabel="ADR 0020 — el formulario es dueño de su fila de acciones"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">En un Dialog</p>
			<Button size="sm" onclick={() => (openDialog = true)}>Nueva tarea</Button>
			<Dialog
				open={openDialog}
				onOpenChange={(next) => (openDialog = next)}
				title="Nueva tarea"
				description="Una tarea en este proyecto."
			>
				<form
					class="space-y-[var(--space-4)]"
					onsubmit={(event) => (event.preventDefault(), (openDialog = false))}
				>
					<Field label="Título" name="title" />
					<FormActions>
						<Button type="button" variant="ghost" onclick={() => (openDialog = false)}>
							Cancelar
						</Button>
						<Button type="submit">Crear</Button>
					</FormActions>
				</form>
			</Dialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				En un Sheet (sticky)
			</p>
			<Button size="sm" onclick={() => (openSheet = true)}>Editar</Button>
			<Sheet
				open={openSheet}
				onOpenChange={(next) => (openSheet = next)}
				title="Editar proyecto"
				description="Cambia lo que haga falta."
			>
				<form
					class="space-y-[var(--space-4)]"
					onsubmit={(event) => (event.preventDefault(), (openSheet = false))}
				>
					<Field label="Nombre" name="name" value="Migración" />
					<FormActions sticky>
						<Button type="button" variant="ghost" onclick={() => (openSheet = false)}>
							Cancelar
						</Button>
						<Button type="submit">Guardar</Button>
					</FormActions>
				</form>
			</Sheet>
		</div>
	{/snippet}
</ComponentDocPage>
