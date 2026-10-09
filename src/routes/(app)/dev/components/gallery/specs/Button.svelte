<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
</script>

<ComponentDocPage
	name="Button"
	summary="Control interactivo primario; renderiza un `<a>` cuando recibe `href`."
	role="Un control que hace algo es un `<button>`; uno que va a algún lugar es un `<a>` con la misma apariencia. `variant` nombra una intención (primaria, secundaria, silenciosa, destructiva), nunca un color suelto."
	whenToUse={[
		'La acción principal de una pantalla o de un formulario (variant="primary").',
		'Una acción secundaria junto a la primaria (variant="secondary" o "ghost").',
		'Una acción irreversible o destructiva (variant="danger"), nunca "primary".',
		'Un enlace con apariencia de control, pasando href en vez de un onclick.'
	]}
	whenNotToUse={[
		'Para navegar sin cambiar de página real — usa un enlace de texto, no un Button.',
		'Para una acción silenciosa de confirmación destructiva sin diálogo: RelatedRecords ya muestra el patrón correcto (ghost para pedir, danger para confirmar).'
	]}
	propsDoc={[
		{
			name: 'variant',
			type: "'primary' | 'secondary' | 'ghost' | 'danger'",
			default: "'primary'",
			description: 'La intención del control. Nunca un color suelto: cada valor ya decide su color.'
		},
		{
			name: 'size',
			type: "'sm' | 'md' | 'lg'",
			default: "'md'",
			description: 'Altura y tipografía; coincide con --size-control-{sm,md,lg}.'
		},
		{
			name: 'iconOnly',
			type: 'boolean',
			default: 'false',
			description: 'Botón cuadrado para una etiqueta que es solo un icono. Necesita aria-label.'
		},
		{
			name: 'href',
			type: 'string',
			description:
				'Si está presente, renderiza un <a> en vez de un <button> con la misma apariencia.'
		},
		{
			name: 'disabled',
			type: 'boolean',
			description: 'Atributo nativo del <button>, propagado por el spread de rest.'
		}
	]}
	usage={`<Button variant="primary" size="md" onclick={save}>Guardar</Button>
<Button variant="danger" size="sm" onclick={remove}>Eliminar</Button>
<Button href="/assets/new">Registrar activo</Button>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — radio de 8px para botones, inputs y selects"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Variantes</p>
			<div class="flex flex-wrap items-center gap-[var(--space-3)]">
				<Button variant="primary">Primario</Button>
				<Button variant="secondary">Secundario</Button>
				<Button variant="ghost">Silencioso</Button>
				<Button variant="danger">Destructivo</Button>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Tamaños</p>
			<div class="flex flex-wrap items-center gap-[var(--space-3)]">
				<Button size="sm">Pequeño</Button>
				<Button size="md">Mediano</Button>
				<Button size="lg">Grande</Button>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Deshabilitado y solo-icono
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-3)]">
				<Button disabled>No disponible</Button>
				<Button iconOnly aria-label="Buscar">⌘</Button>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Como enlace</p>
			<Button href="/dev/components">Ir a la galería</Button>
		</div>
	{/snippet}
</ComponentDocPage>
