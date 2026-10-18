<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';

	const input = field().input();

	let openCreate = $state(false);
	let openEdit = $state(false);
	let openPending = $state(false);

	let draftName = $state('Portátiles');
</script>

<ComponentDocPage
	name="Dialog"
	summary="Diálogo corto de una a tres campos (ADR 0020): crear o editar una entrada de catálogo."
	role="El shape 'dialog' de los tres workflows de formulario del issue #100: una tarea corta con una sola acción primaria — nueva categoría, editar modelo —, nunca una subtarea anidada (eso es una página completa) ni una edición de un registro ya abierto en su propio contexto (eso es Sheet). Compuesto directamente sobre los primitivos ui/dialog vendorizados, igual que ConfirmDialog compone ui/alert-dialog, así hereda la tipografía y el radio de la app en vez del chrome por defecto de shadcn. A diferencia de ConfirmDialog, no tiene footer ni botón de confirmar propios: children es el <form> entero, con su propia fila Guardar/Cancelar, porque un formulario de crear/editar ya sabe su propia etiqueta y su propio use:enhance."
	whenToUse={[
		'Crear o editar una entrada de catálogo: nueva categoría, nuevo fabricante, editar un modelo.',
		'Una a tres campos, una sola acción primaria, un único contenedor de scroll.'
	]}
	whenNotToUse={[
		'Editar un registro ya abierto en una lista o ficha: eso es un Sheet contextual.',
		'Un formulario con una subtarea propia (crear un modelo dentro de registrar un activo) o con attachments: eso es una página completa.',
		'Una confirmación destructiva: usa ConfirmDialog, que ya construye el botón de confirmar y el tono.'
	]}
	propsDoc={[
		{
			name: 'open',
			type: 'boolean',
			description: 'Lo controla el llamador, igual que ConfirmDialog.'
		},
		{
			name: 'onOpenChange',
			type: '(open: boolean) => void',
			description: 'Se llama al pedir cerrar (Escape, overlay) — nunca mientras pending es true.'
		},
		{ name: 'title', type: 'string', description: 'Cabecera del diálogo.' },
		{ name: 'description', type: 'string', description: 'Opcional: una frase bajo el título.' },
		{
			name: 'pending',
			type: 'boolean',
			default: 'false',
			description: 'Bloquea Escape y el overlay mientras el POST del formulario está en curso.'
		},
		{
			name: 'children',
			type: 'Snippet',
			description: 'El <form> entero: campos, errores y su propia fila Guardar/Cancelar.'
		}
	]}
	usage={`<Dialog
  open={dialogVisible}
  onOpenChange={(next) => { if (!next) closeDialog(); }}
  title={editing ? m.catalogue_edit_title({ name: editing.name }) : m.catalogue_new_model()}
>
  <form method="POST" action={editing ? '?/update' : '?/create'} use:enhance={...}>
    <input name="name" bind:value={draftName} required />
    <Button type="button" variant="ghost" onclick={closeDialog}>Cancelar</Button>
    <Button type="submit">Guardar</Button>
  </form>
</Dialog>`}
	referenceHref="https://www.shadcn-svelte.com/docs/components/dialog"
	referenceLabel="shadcn-svelte — Dialog"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Crear (sin description)
			</p>
			<Button size="sm" onclick={() => (openCreate = true)}>Nueva categoría</Button>
			<Dialog
				open={openCreate}
				onOpenChange={(next) => (openCreate = next)}
				title="Nueva categoría"
			>
				<form
					onsubmit={(event) => (event.preventDefault(), (openCreate = false))}
					class="space-y-3"
				>
					<label class="flex flex-col gap-1">
						<span class="text-label text-[var(--ink)]">Nombre</span>
						<input class={input} required />
					</label>
					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={() => (openCreate = false)}
							>Cancelar</Button
						>
						<Button type="submit" size="sm">Crear</Button>
					</div>
				</form>
			</Dialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Editar (prefilled, varios campos)
			</p>
			<Button variant="secondary" size="sm" onclick={() => (openEdit = true)}>Editar modelo</Button>
			<Dialog
				open={openEdit}
				onOpenChange={(next) => (openEdit = next)}
				title="Editar EliteBook 840"
				description="Cambia el nombre, el fabricante o la categoría de este modelo."
			>
				<form onsubmit={(event) => (event.preventDefault(), (openEdit = false))} class="space-y-3">
					<label class="flex flex-col gap-1">
						<span class="text-label text-[var(--ink)]">Nombre</span>
						<input class={input} bind:value={draftName} required />
					</label>
					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={() => (openEdit = false)}
							>Cancelar</Button
						>
						<Button type="submit" size="sm">Guardar</Button>
					</div>
				</form>
			</Dialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Pending (Escape/overlay bloqueados)
			</p>
			<Button size="sm" onclick={() => (openPending = true)}>Crear fabricante</Button>
			<Dialog
				open={openPending}
				onOpenChange={(next) => (openPending = next)}
				title="Nuevo fabricante"
				pending
			>
				<form class="space-y-3">
					<label class="flex flex-col gap-1">
						<span class="text-label text-[var(--ink)]">Nombre</span>
						<input class={input} disabled value="Guardando…" />
					</label>
					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" disabled>Cancelar</Button>
						<Button type="submit" size="sm" disabled>Guardando…</Button>
					</div>
				</form>
			</Dialog>
		</div>
	{/snippet}
	{#snippet notes()}
		<p class="text-sm text-[var(--ink)]">
			A diferencia de <code>ConfirmDialog</code>, este componente no construye ningún botón: todo el
			<code>&lt;form&gt;</code>, incluida su fila Guardar/Cancelar, vive en <code>children</code>
			— el caso de uso es un formulario real, no una pregunta sí/no. Las catálogos de modelos, fabricantes
			y categorías (#100, ADR 0020) lo usan tanto para crear como para editar, sustituyendo las filas
			con inputs siempre editables que tenían antes.
		</p>
	{/snippet}
</ComponentDocPage>
