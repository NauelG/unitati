<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';

	let empty = $state('');
	let filled = $state(
		'Hola, **gracias** por avisar.\n\n- Reinicia el equipo\n- Prueba con `ping 10.0.0.1`\n\n> Si sigue igual, abre un ticket.\n\nMás información en [la guía](https://example.com).'
	);
	let over = $state('x'.repeat(20_050));
</script>

<ComponentDocPage
	name="RichTextEditor"
	summary="Editor de texto enriquecido que guarda markdown, con barra de herramientas."
	role="Una superficie Tiptap con barra de herramientas (negrita, cursiva, listas, enlace, código, cita) cuyo valor es markdown. Escribe el markdown en un input oculto, así que un formulario HTML lo envía igual que haría con un textarea. Solo admite el formato que el sanitizador del servidor deja pasar (ADR 0030): sin títulos, tachado, tablas ni imágenes."
	whenToUse={[
		'Cualquier campo de texto largo que se muestre como prosa: comentarios y, más adelante, descripciones de proyecto y tarea.'
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
		}
	]}
	usage={`<RichTextEditor name="body" label="Respuesta" bind:value={body} />`}
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
	{/snippet}
</ComponentDocPage>
