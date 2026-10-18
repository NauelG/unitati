<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SegmentedControl from '#lib/components/unitati/SegmentedControl.svelte';

	let mode = $state('board');
</script>

<ComponentDocPage
	name="SegmentedControl"
	summary="Selector de un grupo de opciones en una píldora: enlaces (?view=) o botones."
	role=".ut-btn-group: una pista --surface-2 con la opción activa elevada a --surface-1. Con href en las opciones son enlaces (aria-current=page) para un conmutador que lee el servidor; sin href son botones (aria-pressed) que cambian estado local."
	whenToUse={[
		'Cambiar entre dos o tres vistas de los mismos datos: tablero / lista.',
		'Con href cuando la vista vive en la URL (?view=) y debe sobrevivir a una recarga.'
	]}
	whenNotToUse={[
		'Navegación entre secciones de la app: eso es SettingsNav o la navegación del shell.',
		'Muchas opciones o selección múltiple: usa un SelectField.'
	]}
	propsDoc={[
		{
			name: 'options',
			type: '{ id: string; label: string; href?: string }[]',
			description: 'href presente: la opción es un enlace.'
		},
		{ name: 'value', type: 'string', description: 'El id de la opción activa.' },
		{ name: 'onchange', type: '(id: string) => void', description: 'Se dispara al activar.' },
		{ name: 'aria-label', type: 'string', description: 'Nombre del grupo.' }
	]}
	usage={`<SegmentedControl
  aria-label="Vista"
  options={[{ id: 'board', label: 'Tablero', href: '?view=board' }, …]}
  value={view}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — .ut-btn-group"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Modo enlace (href)
			</p>
			<SegmentedControl
				aria-label="Vista"
				value="board"
				options={[
					{ id: 'board', label: 'Tablero', href: '#board' },
					{ id: 'list', label: 'Lista', href: '#list' }
				]}
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Modo botón (aria-pressed)
			</p>
			<SegmentedControl
				aria-label="Vista"
				value={mode}
				onchange={(id) => (mode = id)}
				options={[
					{ id: 'board', label: 'Tablero' },
					{ id: 'list', label: 'Lista' }
				]}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
