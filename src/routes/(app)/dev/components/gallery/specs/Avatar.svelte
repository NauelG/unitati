<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Avatar from '#lib/components/unitati/Avatar.svelte';
</script>

<ComponentDocPage
	name="Avatar"
	summary="Disco de identidad de una persona, opcionalmente con nombre/meta o imagen."
	role="Tres formas según las props presentes: solo disco (iniciales o imagen), o disco + nombre + meta cuando llega meta. Sin variante de tono a propósito: el color en este sistema significa un dominio o un estado, nunca una persona."
	whenToUse={[
		'Identificar a la persona autora de un comentario o evento (TicketThread).',
		'Mostrar nombre y un segundo dato (rol, departamento) junto al disco: pasa meta.'
	]}
	whenNotToUse={[
		'Para dar un tono o significado a una persona por su color: este componente no tiene esa variante.',
		'Para representar un registro del dominio (activo, ticket): usa RecordRef.'
	]}
	propsDoc={[
		{
			name: 'name',
			type: 'string',
			description: 'Nombre completo; también la fuente de las iniciales.'
		},
		{
			name: 'meta',
			type: 'string',
			description: 'Segunda línea (rol, departamento). Su presencia activa la composición persona.'
		},
		{
			name: 'imageUrl',
			type: 'string',
			description: 'Si está, se muestra en vez de las iniciales.'
		},
		{
			name: 'size',
			type: "'sm' | 'md' | 'lg'",
			default: "'md'",
			description: 'Diámetro del disco.'
		}
	]}
	usage={`<Avatar name={author.name} />
<Avatar name={author.name} meta={author.role} size="lg" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-avatar / .ut-person"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Tamaños</p>
			<div class="flex flex-wrap items-center gap-[var(--space-4)]">
				<Avatar name="Ada Lovelace" size="sm" />
				<Avatar name="Ada Lovelace" size="md" />
				<Avatar name="Ada Lovelace" size="lg" />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Nombre de una sola palabra
			</p>
			<Avatar name="Ada" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con meta</p>
			<Avatar name="Ada Lovelace" meta="Soporte técnico" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con imagen</p>
			<Avatar name="Ada Lovelace" imageUrl="https://i.pravatar.cc/80?img=5" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Imagen rota (fallback a iniciales)
			</p>
			<Avatar name="Ada Lovelace" imageUrl="https://example.invalid/no-existe.png" />
		</div>
	{/snippet}
</ComponentDocPage>
