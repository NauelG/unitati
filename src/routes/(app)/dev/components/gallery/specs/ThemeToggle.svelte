<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import ThemeToggle from '#lib/components/unitati/ThemeToggle.svelte';
	import { mode, userPrefersMode } from 'mode-watcher';
	import { THEME_MODES } from '#lib/theme.js';
</script>

<ComponentDocPage
	name="ThemeToggle"
	summary="Claro / Oscuro / Sistema, como grupo de radio en un menú desplegable."
	role="El selector de tema del área de usuario. Tres opciones explícitas y no un interruptor de dos estados: con un interruptor no hay vuelta a 'seguir al sistema' una vez que se ha tocado, y seguir al sistema es justamente el valor por defecto que pide la decisión D9. El icono del disparador muestra la opción que la persona eligió — no la que se está pintando — porque alguien en 'Sistema' de noche debe ver el monitor, que es la respuesta que dio."
	whenToUse={[
		'Una vez por shell, en el área de usuario: el shell de staff y el portal.',
		'Cuando hace falta ofrecer el tema como preferencia persistente de la persona.'
	]}
	whenNotToUse={[
		'Como selector de temas de marca: D7 dice que la estructura es producto; claro/oscuro/sistema no es un tema configurable por organización.',
		'Dos veces en la misma pantalla: es un ajuste global, y dos controles del mismo ajuste invitan a preguntarse en qué se diferencian.'
	]}
	propsDoc={[
		{
			name: 'class',
			type: 'string',
			description: 'Clases extra para el disparador. No admite nada más: no tiene estado propio.'
		}
	]}
	usage={`<!-- En el topbar del shell, junto al avatar y cerrar sesión -->
<ThemeToggle />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — lenguaje visual"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-6)]">
			<div class="flex items-center gap-[var(--space-3)]">
				<ThemeToggle />
				<span class="text-[13px] text-[var(--ink-muted)]">Ábrelo: cambia el tema de la app.</span>
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
				<div class="flex gap-[var(--space-2)]">
					<dt class="text-[var(--ink-muted)]">opciones:</dt>
					<dd class="text-[var(--ink)]">{THEME_MODES.join(' · ')}</dd>
				</div>
			</dl>
		</div>
	{/snippet}

	{#snippet notes()}
		<div class="flex flex-col gap-[var(--space-3)] text-sm leading-[22px] text-[var(--ink)]">
			<p>
				<strong>Este es el único componente de la galería que actúa sobre la app entera.</strong> El
				botón "Ver en oscuro" de arriba envuelve la demo en un
				<code>.dark</code> y no toca nada más; este control escribe la preferencia real en
				<code>localStorage</code>. Los dos valores de la derecha muestran la diferencia que importa:
				<code>preferencia</code> es lo que la persona eligió (puede ser <code>system</code>) y
				<code>resuelto</code> es el tema que se está pintando.
			</p>
			<p>
				Sin destello al cargar: <code>ModeWatcher</code>, montado en el
				<code>+layout.svelte</code> raíz, no renderiza ningún elemento — toda su salida es un
				<code>&lt;script&gt;</code> en línea y síncrono en el <code>&lt;head&gt;</code> que pone
				<code>.dark</code> en <code>&lt;html&gt;</code> antes del primer pintado. El mismo truco, y
				el mismo motivo, que el script previo al pintado de <code>app.html</code> para el sidebar contraído
				(ADR 0015).
			</p>
			<p>
				Es un <code>RadioGroup</code> y no tres elementos sueltos porque son tres valores de un
				mismo ajuste: bits-ui le da al grupo <code>role="radiogroup"</code> y a cada fila
				<code>role="menuitemradio"</code> con <code>aria-checked</code>, así que un lector de
				pantalla anuncia cuál está activo en vez de leer tres órdenes que suenan igual.
			</p>
			<p>
				Cambiar de tema no se anima. <code>disableTransitions</code> se queda en su valor por
				defecto: sin él, el cambio ejecutaría de golpe cada <code>transition-colors</code> de la app y
				repintaría la página como un barrido de color de 120ms. Un cambio de tema es un cambio de contexto,
				no una animación (constitución de movimiento, #87).
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
