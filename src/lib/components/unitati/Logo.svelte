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

	/**
	 * The text stand-ins for the artwork once the brand is customised. Their size
	 * follows the `logo` variant so a swap never moves the layout: a wordmark's
	 * type matches the lockup's height, a monogram is the mark's own square.
	 */
	const wordmark = tv({
		base: 'block max-w-full truncate font-display font-semibold text-[var(--ink)] select-none',
		variants: { size: { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' } },
		defaultVariants: { size: 'md' }
	});

	const monogram = tv({
		base: [
			'inline-flex shrink-0 items-center justify-center select-none',
			'rounded-[var(--radius-sm)] bg-[var(--brand)] font-display font-semibold text-[var(--on-brand)]'
		],
		variants: { size: { sm: 'size-6 text-sm', md: 'size-7 text-base', lg: 'size-10 text-xl' } },
		defaultVariants: { size: 'md' }
	});

	export type LogoSize = NonNullable<VariantProps<typeof logo>['size']>;
	export type LogoVariant = 'mark' | 'lockup';
</script>

<script lang="ts">
	import lockup from '#lib/assets/brand/unitati-lockup.svg';
	import lockupInverse from '#lib/assets/brand/unitati-lockup-inverse.svg';
	import mark from '#lib/assets/brand/unitati-mark.svg';
	import { brandAssetUrl, currentBrand } from '#lib/brand.svelte.js';
	import { monogramLetter, type BrandView } from '#lib/domain/brand.js';

	interface Props {
		/** `lockup` is the mark plus the wordmark; `mark` is the symbol alone, for tight spaces. */
		variant?: LogoVariant;
		size?: LogoSize;
		class?: string;
		/** Defaults to the page's brand; passed explicitly by the gallery and the component tests. */
		brand?: Pick<BrandView, 'productName' | 'customised'> &
			Partial<Pick<BrandView, 'assets'>> & {
				/** Replaces an uploaded image's URL: lets the gallery show art with no upload behind it. */
				urls?: Partial<Record<'lockup' | 'lockup_dark' | 'mark', string>>;
			};
	}

	let { variant = 'lockup', size, class: className, brand = currentBrand() }: Props = $props();

	const classes = $derived(logo({ size, class: className }));
	/** Uploaded art is the customer's own, so it is contained rather than sized by the viewBox. */
	const artClasses = $derived(`${classes} max-w-full object-contain object-left`);

	const assetUrl = (slot: 'lockup' | 'lockup_dark' | 'mark') =>
		brand.urls?.[slot] ?? brandAssetUrl(slot, { assets: brand.assets ?? {} });

	/** Where the lockup comes from in each theme; `null` is the text wordmark. */
	const lockupLight = $derived(assetUrl('lockup'));
	const lockupDark = $derived(assetUrl('lockup_dark') ?? lockupLight);
	const markSrc = $derived(assetUrl('mark'));
</script>

<!--
	The golden rule (ADR 0026): once the brand is customised, Unitati's art never
	shows. A customised brand with nothing uploaded falls back to **HTML text**, not
	a generated image: it costs no request, needs no font loading on the server,
	and follows `--brand` on its own once the colour is configurable. The
	wordmark is ink, so it reads in both themes without a second cut.

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

	Uploaded art (#162) follows the same mechanism. When the brand is customised, each
	theme resolves its own source, and the golden rule fills the gaps:

	| variant | light                           | dark                                         |
	| ------- | ------------------------------- | -------------------------------------------- |
	| lockup  | `lockup` upload, else wordmark  | `lockup_dark`, else `lockup`, else wordmark  |
	| mark    | `mark` upload, else monogram    | same as light (the mark has no dark cut)     |

	When the two themes resolve to the same source one element is rendered; when they
	differ, both are, swapped by `dark:hidden` / `hidden dark:block`. Choosing the
	source in JS would repaint the wrong cut on a hard reload, as described above.
	Uploaded images are `decoding="async"` but never `loading="lazy"`: the logo is
	above the fold. `max-w-full object-contain` keeps a wide logo inside the 248 px
	sidebar and the portal header.

	Both files are therefore in the markup, one of them hidden. `alt` lives on
	the visible-in-light copy; the inverse is `aria-hidden` so a screen reader
	announces the brand once, not twice, whichever one is painted.
-->
{#snippet art(src: string, visibility: string, visible: boolean)}
	<img
		{src}
		alt={visible ? brand.productName : ''}
		aria-hidden={visible ? undefined : 'true'}
		decoding="async"
		class="{artClasses} {visibility}"
	/>
{/snippet}

{#snippet text(visibility: string, visible: boolean)}
	<span
		role={visible ? 'img' : undefined}
		aria-label={visible ? brand.productName : undefined}
		aria-hidden={visible ? undefined : 'true'}
		class="{wordmark({ size, class: className })} {visibility}"
	>
		{brand.productName}
	</span>
{/snippet}

{#if brand.customised}
	{#if variant === 'mark'}
		{#if markSrc}
			{@render art(markSrc, '', true)}
		{:else}
			<span role="img" aria-label={brand.productName} class={monogram({ size, class: className })}>
				{monogramLetter(brand.productName)}
			</span>
		{/if}
	{:else if lockupLight === lockupDark}
		{#if lockupLight}
			{@render art(lockupLight, '', true)}
		{:else}
			{@render text('', true)}
		{/if}
	{:else}
		{#if lockupLight}
			{@render art(lockupLight, 'dark:hidden', true)}
		{:else}
			{@render text('dark:hidden', true)}
		{/if}
		{#if lockupDark}
			{@render art(lockupDark, 'hidden dark:block', false)}
		{:else}
			{@render text('hidden dark:block', false)}
		{/if}
	{/if}
{:else if variant === 'mark'}
	<img src={mark} alt={brand.productName} class={classes} />
{:else}
	<img src={lockup} alt={brand.productName} class="{classes} dark:hidden" />
	<img src={lockupInverse} alt="" aria-hidden="true" class="{classes} hidden dark:block" />
{/if}
