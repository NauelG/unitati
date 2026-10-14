<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	/**
	 * The brand, as `docs/design/assets/brand` draws it. Height is the variant and width follows
	 * the artwork's own ratio, so a size never distorts the mark.
	 */
	export const logo = tv({
		base: 'block w-auto shrink-0 select-none',
		variants: {
			size: {
				sm: 'h-6',
				md: 'h-7',
				lg: 'h-10'
			}
		},
		defaultVariants: { size: 'md' }
	});

	export type LogoSize = NonNullable<VariantProps<typeof logo>['size']>;
	export type LogoVariant = 'mark' | 'lockup';
</script>

<script lang="ts">
	import lockup from '#lib/assets/brand/unitati-lockup.svg';
	import lockupInverse from '#lib/assets/brand/unitati-lockup-inverse.svg';
	import mark from '#lib/assets/brand/unitati-mark.svg';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** `lockup` is the mark plus the wordmark; `mark` is the symbol alone, for tight spaces. */
		variant?: LogoVariant;
		size?: LogoSize;
		class?: string;
	}

	let { variant = 'lockup', size, class: className }: Props = $props();

	const classes = $derived(logo({ size, class: className }));
</script>

<!--
	Dark mode (#90). Only the **lockup** has a second cut, and only because its
	wordmark is drawn in flat ink (`#0F1720`): on the `--surface-0` of the dark
	theme that word all but disappears. `unitati-lockup-inverse.svg` is the same
	artwork with the wordmark at `#FFFFFF`.

	The **mark** deliberately has none. It is three brand gradients and no ink at
	all, so it reads on either canvas unchanged. `unitati-mark-white.svg` exists
	in the handoff, but it is a flat white silhouette for monochrome placements
	(a mark sitting on a brand-coloured fill) — reaching for it here would throw
	the logo's colour away to solve a contrast problem the coloured mark does not
	have.

	Swapped by the `dark:` variant rather than by reading mode-watcher's `mode`
	in JS, for two reasons. The theme is already applied to `<html>` before the
	first paint, so CSS gets this right on the server and on a hard reload, where
	a JS-chosen `src` would render the ink wordmark and then swap it — a visible
	flash of the wrong logo, the very thing the pre-paint script exists to avoid.
	And the gallery flips a *subtree* with a `<div class="dark">` wrapper: `mode`
	is a single global, so it could not tell the two columns of that page apart,
	while a CSS variant resolves per element.

	Both files are therefore in the markup, one of them hidden. `alt` lives on
	the visible-in-light copy; the inverse is `aria-hidden` so a screen reader
	announces the brand once, not twice, whichever one is painted.
-->
{#if variant === 'mark'}
	<img src={mark} alt={m.app_name()} class={classes} />
{:else}
	<img src={lockup} alt={m.app_name()} class="{classes} dark:hidden" />
	<img src={lockupInverse} alt="" aria-hidden="true" class="{classes} hidden dark:block" />
{/if}
