<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';

	const brand = { productName: 'Acme Desk', customised: true };

	// Tiny inline art, so the gallery needs no upload: `urls` stands in for `/brand/<slot>?v=…`.
	const swatch = (fill: string, width = 120) =>
		`data:image/svg+xml,${encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 32"><rect width="${width}" height="32" rx="6" fill="${fill}"/></svg>`
		)}`;

	const uploaded = {
		...brand,
		urls: { lockup: swatch('#1d5cf0', 120), mark: swatch('#1d5cf0', 32) }
	};
	const uploadedDark = {
		...brand,
		urls: { lockup: swatch('#1d5cf0', 120), lockup_dark: swatch('#9db8ff', 120) }
	};
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
		},
		{
			name: 'brand',
			type: "{ productName: string; customised: boolean; assets?: BrandView['assets'] }",
			default: 'la marca de la página',
			description:
				'Con customised, el arte de Unitati nunca aparece: el lockup pasa a ser el nombre en texto y el mark, una inicial sobre el color de marca. Con logos subidos, el lockup usa el suyo (y el lockup_dark en tema oscuro, si existe) y el mark usa el símbolo.'
		}
	]}
	usage={`<Logo variant="lockup" size="sm" />
<Logo variant="mark" size="sm" />
<Logo brand={{ productName: 'Acme Desk', customised: true }} />`}
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
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Personalizada, sin logos subidos
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-5)]">
				<Logo variant="lockup" size="sm" {brand} />
				<Logo variant="lockup" size="md" {brand} />
				<Logo variant="lockup" size="lg" {brand} />
				<Logo variant="mark" size="sm" {brand} />
				<Logo variant="mark" size="md" {brand} />
				<Logo variant="mark" size="lg" {brand} />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Personalizada, lockup + mark subidos
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-5)]">
				<Logo variant="lockup" size="md" brand={uploaded} />
				<Logo variant="mark" size="md" brand={uploaded} />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Personalizada, lockup + lockup_dark subidos (claro y oscuro)
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-5)]">
				<div class="rounded-[var(--radius-md)] p-[var(--space-3)]">
					<Logo variant="lockup" size="md" brand={uploadedDark} />
				</div>
				<div class="dark rounded-[var(--radius-md)] bg-[var(--surface-0)] p-[var(--space-3)]">
					<Logo variant="lockup" size="md" brand={uploadedDark} />
				</div>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
