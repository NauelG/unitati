<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
</script>

<ComponentDocPage
	name="Logo"
	summary="Marca de la app: símbolo solo o símbolo + logotipo."
	role="La altura es la variante y el ancho sigue la proporción propia del arte, así un tamaño nunca distorsiona la marca. lockup es el símbolo más el logotipo; mark es el símbolo solo, para espacios reducidos (la topbar en móvil, el sidebar colapsado)."
	whenToUse={[
		'La marca de la app en el sidebar (lockup expandido, mark colapsado) y en la topbar móvil (mark).',
		'Las pantallas de login/configuración, donde el espacio permite el lockup completo.'
	]}
	whenNotToUse={[
		'Como icono decorativo genérico: la marca tiene un único significado, que es ser la marca.'
	]}
	propsDoc={[
		{
			name: 'variant',
			type: "'mark' | 'lockup'",
			default: "'lockup'",
			description: 'lockup es el símbolo + logotipo; mark es el símbolo solo.'
		},
		{
			name: 'size',
			type: "'sm' | 'md' | 'lg'",
			description: 'Controla la altura; el ancho sigue la proporción del arte.'
		}
	]}
	usage={`<Logo variant="lockup" size="sm" />
<Logo variant="mark" size="sm" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — marca"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Lockup</p>
			<div class="flex flex-wrap items-center gap-[var(--space-5)]">
				<Logo variant="lockup" size="sm" />
				<Logo variant="lockup" size="md" />
				<Logo variant="lockup" size="lg" />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Mark</p>
			<div class="flex flex-wrap items-center gap-[var(--space-5)]">
				<Logo variant="mark" size="sm" />
				<Logo variant="mark" size="md" />
				<Logo variant="mark" size="lg" />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
