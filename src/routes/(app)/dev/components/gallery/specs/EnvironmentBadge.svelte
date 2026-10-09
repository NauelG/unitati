<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import EnvironmentBadge from '#lib/components/unitati/EnvironmentBadge.svelte';
</script>

<ComponentDocPage
	name="EnvironmentBadge"
	summary="Indicador de entorno no-productivo; no renderiza nada en producción."
	role="Existe para decir 'esto no es lo real'; mostrarla en todas partes no diría nada. development y staging llevan tonos distintos — un desarrollador local y el host de staging compartido no deben confundirse en una captura de pantalla."
	whenToUse={[
		'En la topbar de la app, siempre con APP_ENV (ADR 0013), nunca con un valor inventado.',
		'En la pantalla de login, para que el estado del entorno sea visible antes de autenticar.'
	]}
	whenNotToUse={[
		'Para el estado de un ticket o de un activo: usa StatusBadge.',
		'Para forzar su aparición en producción: el componente se niega a pintarse ahí a propósito.'
	]}
	propsDoc={[
		{
			name: 'environment',
			type: "'development' | 'staging' | 'production'",
			description: 'APP_ENV. En production el componente no renderiza nada.'
		}
	]}
	usage={`<EnvironmentBadge environment={APP_ENV} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0013-app-env-and-the-non-production-surface.md"
	referenceLabel="ADR 0013 — APP_ENV y la superficie no-productiva"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-3)]">
			<EnvironmentBadge environment="development" />
			<EnvironmentBadge environment="staging" />
			<span class="text-sm text-[var(--ink-muted)]">
				<EnvironmentBadge environment="production" />(vacío, a propósito) — producción.
			</span>
		</div>
	{/snippet}
</ComponentDocPage>
