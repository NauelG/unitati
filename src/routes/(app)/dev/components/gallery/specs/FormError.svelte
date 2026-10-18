<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';

	let openConfirm = $state(false);
	let openSheet = $state(false);
	const none: string | undefined = undefined;
</script>

<ComponentDocPage
	name="FormError"
	summary="La línea de error de un formulario: lo que dice el servidor cuando rechaza el envío."
	role="Un <p role=alert> con el color de peligro. Sin hijos de texto no pinta nada, así que se escribe <FormError> con el mensaje, sin condicional. El error de un campo concreto sigue siendo cosa de Field."
	whenToUse={[
		'El rechazo del servidor bajo un formulario, dentro de un ConfirmDialog o de un Sheet.',
		'Con id, cuando un control apunta a él con aria-describedby.'
	]}
	whenNotToUse={[
		'El error de un solo campo: usa el error de Field, que ya marca el borde.',
		'Un aviso que no es un fallo (éxito, información): usa Alert o un toast.'
	]}
	propsDoc={[
		{ name: 'children', type: 'Snippet', description: 'El mensaje. Vacío, no se ve.' },
		{ name: 'id', type: 'string', description: 'Para aria-describedby.' }
	]}
	usage={`<FormError>{form?.message}</FormError>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — color de peligro"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Bajo un formulario
			</p>
			<form
				class="w-full space-y-[var(--space-3)] sm:w-96"
				onsubmit={(event) => event.preventDefault()}
			>
				<Field label="Nombre" name="name" value="Portátiles" />
				<FormError>Ya existe una categoría con ese nombre.</FormError>
				<FormActions>
					<Button type="button" variant="ghost">Cancelar</Button>
					<Button type="submit">Guardar</Button>
				</FormActions>
			</form>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Sin mensaje: no pinta nada
			</p>
			<FormError>{none}</FormError>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Dentro de un ConfirmDialog
			</p>
			<Button variant="danger" size="sm" onclick={() => (openConfirm = true)}>Eliminar</Button>
			<ConfirmDialog
				open={openConfirm}
				onOpenChange={(next) => (openConfirm = next)}
				title="Eliminar categoría"
				description="Esta acción no se puede deshacer."
				confirmLabel="Eliminar"
				error="La categoría tiene modelos asociados."
			>
				{#snippet action(confirm)}
					<form onsubmit={(event) => (event.preventDefault(), (openConfirm = false))}>
						{@render confirm()}
					</form>
				{/snippet}
			</ConfirmDialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Dentro de un Sheet
			</p>
			<Button size="sm" onclick={() => (openSheet = true)}>Editar</Button>
			<Sheet
				open={openSheet}
				onOpenChange={(next) => (openSheet = next)}
				title="Editar proyecto"
				description="Cambia el nombre o la fecha."
			>
				<form class="space-y-[var(--space-4)]" onsubmit={(event) => event.preventDefault()}>
					<Field label="Nombre" name="name" value="Migración" />
					<FormError>No se pudo guardar. Inténtalo de nuevo.</FormError>
					<FormActions>
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
