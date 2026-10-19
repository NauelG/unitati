<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import UserMenu from '#lib/components/unitati/UserMenu.svelte';
	import { mode, userPrefersMode } from 'mode-watcher';
</script>

<ComponentDocPage
	name="UserMenu"
	summary="El botón de perfil de la topbar: identidad, tema y cerrar sesión en un menú."
	role="Reúne en un único control lo que antes eran cuatro en fila (tema, avatar, nombre y cerrar sesión). El disparador es el avatar con las iniciales; el menú muestra nombre y correo en una cabecera no interactiva, el tema como grupo de radio (claro, oscuro, sistema) y 'Cerrar sesión'. Cerrar sesión sigue siendo un POST real: un formulario oculto que el elemento del menú envía con requestSubmit()."
	whenToUse={[
		'Una vez por shell, en el extremo de la topbar: el shell de staff y el portal.',
		'Para añadir una acción de la persona (p. ej. cambiar contraseña): pasa el snippet items, una línea.'
	]}
	whenNotToUse={[
		'Como navegación: los enlaces del módulo viven en el sidebar o en la topbar del portal.',
		'Dos veces en la misma pantalla: el tema es un ajuste global.'
	]}
	propsDoc={[
		{ name: 'name', type: 'string', description: 'Nombre completo; origen de las iniciales.' },
		{ name: 'email', type: 'string', description: 'Correo, bajo el nombre en la cabecera.' },
		{
			name: 'signOutAction',
			type: 'string',
			default: "'/sign-out'",
			description: 'Destino del POST de cerrar sesión.'
		},
		{
			name: 'items',
			type: 'Snippet',
			description: 'Elementos extra, entre la cabecera y el tema (DropdownMenu.Item).'
		},
		{ name: 'class', type: 'string', description: 'Clases extra para el disparador.' }
	]}
	usage={`<UserMenu name={data.user.name} email={data.user.email} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — lenguaje visual"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-6)]">
			<div class="flex items-center gap-[var(--space-3)]">
				<UserMenu name="Ada Lovelace" email="ada@example.com" />
				<span class="text-small text-[var(--ink-muted)]">Ábrelo: cambia el tema de la app.</span>
			</div>

			<dl class="flex flex-col gap-1 font-mono text-xs">
				<div class="flex gap-[var(--space-2)]">
					<dt class="text-[var(--ink-muted)]">preferencia:</dt>
					<dd class="text-[var(--ink)]">{userPrefersMode.current}</dd>
				</div>
				<div class="flex gap-[var(--space-2)]">
					<dt class="text-[var(--ink-muted)]">resuelto:</dt>
					<dd class="text-[var(--ink)]">{mode.current ?? '—'}</dd>
				</div>
			</dl>
		</div>
	{/snippet}

	{#snippet notes()}
		<div class="flex flex-col gap-[var(--space-3)] text-sm text-[var(--ink)]">
			<p>
				El tema escribe la preferencia real en <code>localStorage</code>: es el único control de la
				galería que actúa sobre la app entera. <code>preferencia</code> es lo que la persona eligió
				(puede ser <code>system</code>) y <code>resuelto</code> es el tema que se pinta.
			</p>
			<p>
				Teclado: Enter abre el menú, las flechas se mueven, Escape cierra y devuelve el foco al
				avatar. Cerrar sesión en esta página enviaría un POST real a <code>/sign-out</code>.
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
