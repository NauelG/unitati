<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';

	let empty = $state('');
	let filled = $state(
		'Hola, **gracias** por avisar.\n\n- Reinicia el equipo\n- Prueba con `ping 10.0.0.1`\n\n> Si sigue igual, abre un ticket.\n\nMás información en [la guía](https://example.com).'
	);
	let over = $state('x'.repeat(20_050));
	let page = $state(
		[
			'Cómo conectarse a la VPN desde casa.',
			'',
			'## Antes de empezar',
			'',
			'Necesitas el portátil de la empresa y tu usuario.',
			'',
			'### Clientes por sistema',
			'',
			'| Sistema | Cliente |',
			'| --- | --- |',
			'| Windows | GlobalProtect |',
			'| macOS | GlobalProtect |',
			'',
			'---',
			'',
			'Si falla, mira [Restablecer la contraseña](/knowledge/DOC-0007).'
		].join('\n')
	);

	/** Stands in for `GET /knowledge/pages/pick` in the gallery. */
	const samplePages = [
		{ tag: 'DOC-0007', title: 'Restablecer la contraseña', hint: 'DOC-0007 · Ayuda' },
		{ tag: 'DOC-0012', title: 'VPN en casa', hint: 'DOC-0012 · Ayuda' },
		{ tag: 'DOC-0031', title: 'Alta de un empleado', hint: 'DOC-0031 · Interno · Borrador' }
	];
	const pageSource = async (query: string) =>
		samplePages.filter((sample) => sample.title.toLowerCase().includes(query.toLowerCase()));
</script>

<ComponentDocPage
	name="RichTextEditor"
	summary="Editor de texto enriquecido que guarda markdown, con barra de herramientas."
	role="Una superficie Tiptap con barra de herramientas (negrita, cursiva, listas, enlace, código, cita) cuyo valor es markdown. Escribe el markdown en un input oculto, así que un formulario HTML lo envía igual que haría con un textarea. Solo admite el formato que el sanitizador del servidor deja pasar para su perfil (ADR 0030): el perfil comment no tiene títulos, tachado, tablas ni imágenes; el perfil document (páginas de la base de conocimiento) añade títulos h2–h4, tablas, línea separadora y un selector de páginas ([[), y quita las menciones."
	whenToUse={[
		'Cualquier campo de texto largo que se muestre como prosa: comentarios y descripciones (perfil comment).',
		'El cuerpo de una página de la base de conocimiento (perfil document), que el servidor renderiza con renderMarkdown(body, "document").'
	]}
	whenNotToUse={[
		'Notas cortas y operativas (activos, ubicaciones): son texto plano, usa TextAreaField.',
		'Para mostrar markdown ya guardado: renderízalo en el servidor con renderMarkdown, nunca con este componente.'
	]}
	propsDoc={[
		{ name: 'name', type: 'string', description: 'Nombre del input oculto que lleva el markdown.' },
		{
			name: 'value',
			type: 'string',
			default: "''",
			description: 'El markdown; enlazable. Reasignarlo desde fuera reinicia el editor.'
		},
		{ name: 'label', type: 'string', description: 'Nombre accesible de la superficie (oculto).' },
		{ name: 'placeholder', type: 'string', description: 'Texto cuando el editor está vacío.' },
		{
			name: 'maxLength',
			type: 'number',
			default: '20000',
			description: 'Límite de caracteres de markdown; el contador aparece al superar el 90 %.'
		},
		{ name: 'disabled', type: 'boolean', default: 'false', description: 'Desactiva la edición.' },
		{
			name: 'onsubmitshortcut',
			type: '() => void',
			description: 'Se llama con ⌘↵ / Ctrl+↵.'
		},
		{
			name: 'mentionSource',
			type: '(query: string) => Promise<MentionOption[]>',
			description: 'A quién ofrece @ (solo en el perfil comment). Sin ella, @ es texto.'
		},
		{
			name: 'profile',
			type: "'comment' | 'document'",
			default: "'comment'",
			description:
				'Qué puede contener el texto; el servidor lo renderiza con el mismo perfil. document crece con el contenido en lugar de hacer scroll.'
		},
		{
			name: 'pageSource',
			type: '(query: string) => Promise<PageOption[]>',
			description:
				'Las páginas que ofrece el selector del perfil document ([[ y su botón). Sin ella no hay selector. En la app: fetchPages("/knowledge/pages/pick", q).'
		}
	]}
	usage={`<RichTextEditor name="body" label="Respuesta" bind:value={body} />
<RichTextEditor name="body" label="Contenido" profile="document" bind:value={body} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0030-rich-text-as-markdown.md"
	referenceLabel="ADR 0030 — texto enriquecido como markdown"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Vacío</p>
			<RichTextEditor
				name="empty"
				label="Vacío"
				placeholder="Escribe tu respuesta…"
				bind:value={empty}
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con contenido</p>
			<RichTextEditor name="filled" label="Con contenido" bind:value={filled} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Por encima del límite
			</p>
			<RichTextEditor name="over" label="Por encima del límite" bind:value={over} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Perfil document (páginas)
			</p>
			<RichTextEditor
				name="page"
				label="Contenido de la página"
				placeholder="Escribe la página. Usa [[ para enlazar otra."
				profile="document"
				maxLength={200_000}
				{pageSource}
				bind:value={page}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
