<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import EditableText from '#lib/components/unitati/EditableText.svelte';

	let title = $state('Portátil de Ana');
	let code = $state('AST-0042');
	let failing = $state('Se devuelve al fallar');
	let readOnly = $state('Sin permiso');

	function mirror(set: (v: string) => void, get: () => string) {
		return (formData: FormData) => {
			const before = get();
			set(String(formData.get('value')));
			return () => set(before);
		};
	}
</script>

<ComponentDocPage
	name="EditableText"
	summary="Título o código que se edita en el sitio: Enter o salir guarda, Escape cancela."
	role="Texto corto de una cabecera que pasa a ser un campo al activarlo (ADR 0029). Enter o perder el foco guarda, Escape cancela. Se dibuja al tamaño del encabezado (level) y en monoespaciada para un código (mono). Un error de validación del servidor se muestra bajo el campo y lo mantiene abierto; cualquier otro fallo devuelve el valor y avisa."
	whenToUse={[
		'El título de un registro o su código, dentro de PageHeader.',
		'Un texto de una línea dentro de «Detalles» (lo usa EditableDetailRow kind="text").'
	]}
	whenNotToUse={[
		'Texto largo (descripciones): usa el editor de texto enriquecido con Guardar/Cancelar.',
		'Varios campos a la vez: usa un Sheet (ADR 0020).'
	]}
	propsDoc={[
		{ name: 'value', type: 'string', description: 'El valor actual; el espejo de la página.' },
		{ name: 'editable', type: 'boolean', description: 'Sin permiso: texto plano sin borde.' },
		{
			name: 'action / name',
			type: 'string',
			description: 'Acción del formulario y campo enviado.'
		},
		{
			name: 'optimistic',
			type: '(formData) => () => void',
			description: 'Escribe el espejo y devuelve el deshacer.'
		},
		{ name: 'label', type: 'string', description: 'Nombre accesible de la propiedad.' },
		{
			name: 'level',
			type: '1 | 2 | 3 | 4 | 5 | 6',
			description: 'Nivel del encabezado; sin él, un span en línea.'
		},
		{
			name: 'mono',
			type: 'boolean',
			default: 'false',
			description: 'Monoespaciada, para un código.'
		},
		{
			name: 'error',
			type: 'string',
			description: 'Mensaje de validación del servidor: se muestra bajo el campo y lo reabre.'
		},
		{ name: 'placeholder', type: 'string', description: 'Texto atenuado cuando está vacío.' }
	]}
	usage={`<EditableText
  level={1}
  value={project.name}
  label="Nombre"
  action="?/rename"
  name="value"
  editable={canManage}
  optimistic={applyName}
  error={form?.renameError}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0029-in-place-editing-on-record-pages.md"
	referenceLabel="ADR 0029 — edición en el sitio"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Encabezado (level 1)
				</p>
				<EditableText
					level={1}
					class="text-title-1"
					value={title}
					label="Título"
					action="?/save"
					name="value"
					editable
					optimistic={mirror(
						(v) => (title = v),
						() => title
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Código (mono)</p>
				<EditableText
					mono
					value={code}
					label="Código"
					action="?/save"
					name="value"
					editable
					optimistic={mirror(
						(v) => (code = v),
						() => code
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Error de validación (bajo el campo)
				</p>
				<EditableText
					mono
					value="AST-0001"
					label="Código"
					action="?/save"
					name="value"
					editable
					error="Ese código ya existe."
					optimistic={() => () => {}}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Falla (se devuelve y avisa)
				</p>
				<EditableText
					value={failing}
					label="Nombre"
					action="?/fail"
					name="value"
					editable
					optimistic={mirror(
						(v) => (failing = v),
						() => failing
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Solo lectura (sin permiso)
				</p>
				<EditableText
					value={readOnly}
					label="Nombre"
					action="?/save"
					name="value"
					editable={false}
					optimistic={() => () => {}}
				/>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
