<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import PageTree from '#lib/components/unitati/PageTree.svelte';
	import type { PageTreeEntry } from '#lib/components/unitati/page-tree.js';

	const entry = (
		id: string,
		parentId: string | null,
		position: number,
		title: string,
		status: PageTreeEntry['status'] = 'published'
	): PageTreeEntry => ({
		id,
		tag: `DOC-${id.padStart(4, '0')}`,
		title,
		parentId,
		position,
		status
	});

	const entries: PageTreeEntry[] = [
		entry('1', null, 1, 'Acceso a la red'),
		entry('2', '1', 1, 'Wi-Fi corporativa'),
		entry('3', '1', 2, 'VPN', 'draft'),
		entry('4', null, 2, 'Impresoras'),
		entry('5', null, 3, 'Material antiguo', 'archived')
	];

	let last = $state('Ninguna acción todavía.');
</script>

<ComponentDocPage
	name="PageTree"
	summary="El árbol de páginas de un espacio: desplegable, con insignias de estado y reordenable con teclado o arrastre."
	role="Un árbol WAI-ARIA de enlaces, uno por página, anidados por página superior. Una sola parada de tabulador: las flechas se mueven dentro (↑↓ entre filas, → despliega o entra, ← pliega o sube). Editable, Alt + ↑↓ cambia el orden entre hermanas, Alt + → anida bajo la hermana anterior y Alt + ← sube un nivel; arrastrar sobre el cuarto superior o inferior de una fila coloca antes o después, sobre el centro anida. El componente no escribe nada: avisa con onreorder / onmove y la pantalla llama al dominio, que decide (ciclos, borradores)."
	whenToUse={[
		'Navegar un espacio de la base de conocimiento, en su portada y junto a una página abierta.'
	]}
	whenNotToUse={[
		'Para listas planas ordenables: usa una tabla. Para mover una página a otro espacio, el diálogo «Mover…»: el árbol solo opera dentro de un espacio.'
	]}
	propsDoc={[
		{
			name: 'entries',
			type: 'PageTreeEntry[]',
			description: 'Las páginas del espacio, ordenadas por (padre, posición).'
		},
		{
			name: 'currentId',
			type: 'string',
			default: 'undefined',
			description: 'La página abierta: resaltada, y el árbol se abre hasta ella.'
		},
		{ name: 'label', type: 'string', description: 'Nombre accesible del árbol.' },
		{ name: 'href', type: '(entry) => string', description: 'Destino del enlace de cada página.' },
		{
			name: 'editable',
			type: 'boolean',
			default: 'false',
			description: 'Activa Alt + flechas y el arrastre.'
		},
		{
			name: 'expandAll',
			type: 'boolean',
			default: 'false',
			description: 'Abre todas las ramas al empezar.'
		},
		{
			name: 'onreorder',
			type: '(id, placement) => void',
			default: 'undefined',
			description: 'La página va antes o después de una hermana.'
		},
		{
			name: 'onmove',
			type: '(id, parentId, placement?) => void',
			default: 'undefined',
			description: 'La página cambia de página superior.'
		}
	]}
	usage={`<PageTree {entries} currentId={page.id} label="Páginas de Ayuda" href={(e) => '/knowledge/' + e.tag} editable onreorder={reorder} onmove={move} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0031-knowledge-base-spaces-page-tree-and-revisions.md"
	referenceLabel="ADR 0031 — espacios, árbol de páginas y revisiones"
>
	{#snippet demo()}
		<div class="flex flex-col gap-[var(--space-4)]">
			<div
				class="max-w-[360px] rounded-[var(--radius-lg)] border border-[var(--border)] p-[var(--space-3)]"
			>
				<PageTree
					{entries}
					currentId="2"
					label="Páginas de Ayuda"
					href={() => '#'}
					editable
					expandAll
					onreorder={(id, placement) => (last = `reorder ${id} ${JSON.stringify(placement)}`)}
					onmove={(id, parentId, placement) =>
						(last = `move ${id} → ${parentId ?? 'raíz'} ${JSON.stringify(placement ?? {})}`)}
				/>
			</div>
			<p class="text-sm text-[var(--ink-muted)]" aria-live="polite">{last}</p>
			<div
				class="max-w-[360px] rounded-[var(--radius-lg)] border border-[var(--border)] p-[var(--space-3)]"
			>
				<PageTree {entries} label="Solo lectura" href={() => '#'} />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
