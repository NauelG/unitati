<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';

	let openPlain = $state(false);
	let openPending = $state(false);
	let openError = $state(false);
</script>

<ComponentDocPage
	name="ConfirmDialog"
	summary="Confirmación destructiva o de desvincular, sobre alert-dialog de shadcn-svelte."
	role="Lo que un confirm() del navegador no puede dar: tipografía y radio de la app, copy traducido, foco por defecto en Cancelar, Escape cancela y el foco vuelve al control que lo abrió. Nunca se cierra solo: el formulario POST real vive en el snippet action, que recibe el botón de confirmar ya construido (su etiqueta y tono los decide este componente, no cada llamador) — pending deshabilita Cancelar y Confirmar y bloquea Escape/overlay mientras esa petición está en curso, así una red lenta nunca deja al usuario sin saber si pasó algo ni permite un doble envío."
	whenToUse={[
		'Una acción destructiva o que rompe una relación: eliminar, desvincular.',
		'Cuando la consecuencia merece interrumpir — nombra el registro concreto en description, nunca un "¿estás seguro?" genérico.'
	]}
	whenNotToUse={[
		'Guardar, asignar o filtrar: ninguna interacción rutinaria necesita confirmación.',
		'Un aviso que no pide una decisión: usa Alert.',
		'Un éxito o fallo puntual de red sin decisión pendiente: eso es un toast (#89).'
	]}
	propsDoc={[
		{
			name: 'open',
			type: 'boolean',
			description: 'Lo controla el llamador, igual que Sheet.Root — no es bindable.'
		},
		{
			name: 'onOpenChange',
			type: '(open: boolean) => void',
			description: 'Se llama al pedir cerrar (Cancelar/Escape), nunca mientras pending es true.'
		},
		{ name: 'title', type: 'string', description: 'Cabecera del diálogo.' },
		{
			name: 'description',
			type: 'string',
			description: 'Nombra el registro concreto — nunca un texto genérico.'
		},
		{
			name: 'confirmLabel',
			type: 'string',
			description: 'Etiqueta del botón de confirmar; el componente lo construye por ti.'
		},
		{
			name: 'cancelLabel',
			type: 'string',
			default: 'Cancelar',
			description: 'Etiqueta del botón de cancelar.'
		},
		{
			name: 'danger',
			type: 'boolean',
			default: 'true',
			description: 'Pinta el botón de confirmar en tono destructivo.'
		},
		{
			name: 'pending',
			type: 'boolean',
			default: 'false',
			description: 'Deshabilita Cancelar y Confirmar; bloquea Escape y el overlay.'
		},
		{
			name: 'error',
			type: 'string | null',
			description:
				'Mostrado bajo la descripción tras un fallo del servidor; el diálogo se queda abierto.'
		},
		{
			name: 'action',
			type: 'Snippet<[Snippet]>',
			description:
				'El <form method="POST"> real, con los campos ocultos; recibe el botón de confirmar como parámetro para colocarlo dentro.'
		}
	]}
	usage={`<ConfirmDialog
  open={confirmingId === entry.id}
  onOpenChange={(next) => { if (!next) confirmingId = null; }}
  title={m.catalogue_delete_title({ name: entry.name })}
  description={m.catalogue_delete_ask()}
  confirmLabel={m.catalogue_delete()}
  pending={pendingId === entry.id}
>
  {#snippet action(confirm)}
    <form method="POST" action="?/delete" use:enhance={...}>
      <input type="hidden" name="id" value={entry.id} />
      {@render confirm()}
    </form>
  {/snippet}
</ConfirmDialog>`}
	referenceHref="https://www.shadcn-svelte.com/docs/components/alert-dialog"
	referenceLabel="shadcn-svelte — Alert Dialog"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Básico</p>
			<Button variant="danger" size="sm" onclick={() => (openPlain = true)}>
				Eliminar HP EliteBook
			</Button>
			<ConfirmDialog
				open={openPlain}
				onOpenChange={(next) => (openPlain = next)}
				title="Eliminar HP EliteBook"
				description="Esta acción no se puede deshacer."
				confirmLabel="Eliminar"
			>
				{#snippet action(confirm)}
					<form onsubmit={(event) => (event.preventDefault(), (openPlain = false))}>
						{@render confirm()}
					</form>
				{/snippet}
			</ConfirmDialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Pending (Cancelar/Escape bloqueados)
			</p>
			<Button variant="danger" size="sm" onclick={() => (openPending = true)}>
				Desvincular AST-0231
			</Button>
			<ConfirmDialog
				open={openPending}
				onOpenChange={(next) => (openPending = next)}
				title="Desvincular"
				description="¿Desvincular AST-0231? Se pierde el contexto de que esta solicitud trataba de este equipo."
				confirmLabel="Sí, desvincular"
				pending
			>
				{#snippet action(confirm)}
					<form>{@render confirm()}</form>
				{/snippet}
			</ConfirmDialog>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Fallo del servidor: se queda abierto
			</p>
			<Button variant="danger" size="sm" onclick={() => (openError = true)}>
				Eliminar categoría "Portátiles"
			</Button>
			<ConfirmDialog
				open={openError}
				onOpenChange={(next) => (openError = next)}
				title="Eliminar categoría &quot;Portátiles&quot;"
				description="Esta acción no se puede deshacer."
				confirmLabel="Eliminar"
				error="No se puede eliminar: hay modelos en esta categoría."
			>
				{#snippet action(confirm)}
					<form onsubmit={(event) => (event.preventDefault(), (openError = false))}>
						{@render confirm()}
					</form>
				{/snippet}
			</ConfirmDialog>
		</div>
	{/snippet}
	{#snippet notes()}
		<p class="text-sm text-[var(--ink)]">
			El diálogo es un <code>fixed</code> centrado con <code>max-w-[420px]</code>, por lo que a
			375px de ancho queda con margen a los lados (<code>w-[calc(100%-2*var(--space-4))]</code>) en
			vez de recortarse. El foco entra en Cancelar al abrir (no en el contenedor, que es el valor
			por defecto de bits-ui) y vuelve al control que lo abrió al cerrarse — pruébalo con teclado:
			Tab recorre Cancelar → Confirmar, Escape cancela salvo en el estado "pending".
		</p>
	{/snippet}
</ComponentDocPage>
