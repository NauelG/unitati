<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';

	const input = field().input();

	let openBasic = $state(false);
	let openPending = $state(false);
</script>

<ComponentDocPage
	name="Sheet"
	summary="Edición contextual de un registro ya abierto (ADR 0020), sobre Sheet de shadcn-svelte."
	role="El shape 'sheet' de los tres workflows de formulario del issue #100: editar un registro que la visita ya tenía abierto — en su ficha o en una fila de lista — sin navegar fuera de esa página. Compuesto sobre Sheet.Root/Sheet.Content de ui/sheet, igual que el cajón móvil de AppShell (ADR 0011), en vez de sus primitivos bits-ui directamente. Ancho ~760px en escritorio ancho, completo en móvil. Como Dialog, no construye su propio pie: children es el <form> entero. A diferencia de Dialog, el llamador es quien decide si un cierre (Escape, overlay, botón de cerrar) se ejecuta o se convierte en una pregunta de ConfirmDialog cuando el formulario está sucio — Sheet solo bloquea el cierre mientras pending."
	whenToUse={[
		'Editar un activo, ticket o fila ya visible en una ficha o lista, sin perder ese contexto.',
		'La ruta canónica (p. ej. /assets/[tag]/edit) sigue existiendo para navegación directa, recarga y envío sin JS; el Sheet es progressive enhancement sobre la misma validación y la misma action.'
	]}
	whenNotToUse={[
		'Crear una entrada de catálogo nueva de una a tres campos: eso es Dialog.',
		'Un formulario con su propia subtarea (crear un modelo al registrar un activo) o con attachments: eso es una página completa.'
	]}
	propsDoc={[
		{ name: 'open', type: 'boolean', description: 'Lo controla el llamador, igual que Dialog.' },
		{
			name: 'onOpenChange',
			type: '(open: boolean) => void',
			description:
				'Se llama al pedir cerrar. El llamador decide: si el formulario está sucio, abre un ConfirmDialog en vez de cerrar.'
		},
		{
			name: 'title',
			type: 'string',
			description: 'Cabecera fija, no se desplaza con el contenido.'
		},
		{ name: 'description', type: 'string', description: 'Opcional: una frase bajo el título.' },
		{
			name: 'pending',
			type: 'boolean',
			default: 'false',
			description: 'Bloquea Escape, el overlay y el botón de cerrar mientras el POST está en curso.'
		},
		{
			name: 'children',
			type: 'Snippet',
			description:
				'El <form> entero. Para un pie de acciones siempre visible, el propio <form> usa flex h-full min-h-0 flex-col con sus campos en flex-1 overflow-y-auto y la fila de botones en shrink-0.'
		}
	]}
	usage={`<Sheet
  open={editOpen}
  onOpenChange={requestClose}
  pending={$editSubmitting}
  title={m.asset_edit_title({ tag: asset.assetTag })}
>
  <form method="POST" action="/assets/{tag}/edit" use:editEnhance class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto">
      <AssetFields bind:values={$editValues} errors={$editErrors} {modelOptions} tagRequired />
    </div>
    <div class="shrink-0 border-t pt-4">
      <Button type="submit">Guardar</Button>
      <Button type="button" variant="ghost" onclick={() => requestClose(false)}>Cancelar</Button>
    </div>
  </form>
</Sheet>`}
	referenceHref="https://www.shadcn-svelte.com/docs/components/sheet"
	referenceLabel="shadcn-svelte — Sheet"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Básico (cabecera fija, pie de acciones)
			</p>
			<Button size="sm" onclick={() => (openBasic = true)}>Editar AST-0231</Button>
			<Sheet
				open={openBasic}
				onOpenChange={(next) => (openBasic = next)}
				title="Editar AST-0231"
				description="Correcciones: lo que cambia de estado, de manos o de sitio se registra desde la ficha."
			>
				<form
					onsubmit={(event) => (event.preventDefault(), (openBasic = false))}
					class="flex h-full min-h-0 flex-col"
				>
					<div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
						<label class="flex flex-col gap-1">
							<span class="text-[13px] font-medium text-[var(--ink)]">Nombre</span>
							<input class={input} value="HP EliteBook 840" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-[13px] font-medium text-[var(--ink)]">Nº de serie</span>
							<input class={input} value="5CG1234ABC" />
						</label>
					</div>
					<div class="mt-4 flex shrink-0 gap-2 border-t border-[var(--border)] pt-4">
						<Button type="submit" size="sm">Guardar</Button>
						<Button type="button" variant="ghost" size="sm" onclick={() => (openBasic = false)}
							>Cancelar</Button
						>
					</div>
				</form>
			</Sheet>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Pending (cierre bloqueado)
			</p>
			<Button variant="secondary" size="sm" onclick={() => (openPending = true)}
				>Guardando AST-0099…</Button
			>
			<Sheet
				open={openPending}
				onOpenChange={(next) => (openPending = next)}
				title="Editar AST-0099"
				pending
			>
				<form class="flex h-full min-h-0 flex-col">
					<div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
						<label class="flex flex-col gap-1">
							<span class="text-[13px] font-medium text-[var(--ink)]">Nombre</span>
							<input class={input} disabled value="Guardando…" />
						</label>
					</div>
					<div class="mt-4 flex shrink-0 gap-2 border-t border-[var(--border)] pt-4">
						<Button type="submit" size="sm" disabled>Guardando…</Button>
						<Button type="button" variant="ghost" size="sm" disabled>Cancelar</Button>
					</div>
				</form>
			</Sheet>
		</div>
	{/snippet}
	{#snippet notes()}
		<p class="text-sm leading-[22px] text-[var(--ink)]">
			<code>/assets/[tag]</code> conecta esto con un `ConfirmDialog` de "¿descartar cambios?" cuando
			`superForm`'s <code>tainted</code> store marca algún campo sucio en el momento de cerrar — Escape,
			overlay y el botón Cancelar pasan todos por la misma comprobación en vez de cada uno repetirla.
		</p>
	{/snippet}
</ComponentDocPage>
