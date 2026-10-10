<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	/**
	 * The `.ut-btn` family from the design system. Radius grammar (ADR 0019):
	 * action buttons sit at `--radius-md` (8px), the same corner as an input or
	 * a select trigger — full-pill geometry is reserved for badges and status
	 * markers, not every control. Colour only ever arrives through a token.
	 */
	export const button = tv({
		base: [
			'relative inline-flex items-center justify-center gap-[var(--space-2)]',
			'rounded-[var(--radius-md)] border-0 font-semibold whitespace-nowrap',
			'tracking-[0.005em] transition-[background-color,transform,box-shadow] ut-transition-fast',
			'active:not-disabled:translate-y-px',
			// `.ut-btn[disabled]` in the reference CSS: the shadow goes too, so a
			// disabled button reads as flat rather than merely faded.
			'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'
		],
		variants: {
			variant: {
				primary:
					'bg-[var(--action)] text-[var(--on-action)] shadow-[inset_0_-2px_0_rgba(0,0,0,0.28)] hover:bg-[var(--action-hover)] active:shadow-none',
				secondary:
					'bg-[var(--surface-1)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-[var(--surface-2)]',
				ghost: 'bg-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]',
				danger:
					'bg-[var(--danger)] text-[var(--on-danger)] shadow-[inset_0_-2px_0_rgba(0,0,0,0.22)] active:shadow-none'
			},
			size: {
				sm: 'h-[var(--size-control-sm)] px-[var(--space-3)] text-xs leading-4',
				md: 'h-[var(--size-control-md)] px-[var(--space-4)] text-[13px] leading-4',
				lg: 'h-[var(--size-control-lg)] px-[var(--space-5)] text-sm leading-4'
			},
			/** Square, for a button whose whole label is an icon. */
			iconOnly: { true: 'p-0' }
		},
		compoundVariants: [
			{ iconOnly: true, size: 'sm', class: 'w-[var(--size-control-sm)]' },
			{ iconOnly: true, size: 'md', class: 'w-[var(--size-control-md)]' },
			{ iconOnly: true, size: 'lg', class: 'w-[var(--size-control-lg)]' }
		],
		defaultVariants: { variant: 'primary', size: 'md' }
	});

	export type ButtonVariant = NonNullable<VariantProps<typeof button>['variant']>;
	export type ButtonSize = NonNullable<VariantProps<typeof button>['size']>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	interface Common {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Square button for an icon-only label. Needs an `aria-label` from the caller. */
		iconOnly?: boolean;
		children: Snippet;
		/** Narrower than Svelte's `ClassValue`: tailwind-variants merges strings. */
		class?: string;
	}

	/**
	 * A control that does something is a `<button>`; one that goes somewhere is
	 * an `<a>`. Giving the second the look of the first is a styling decision, so
	 * it lives here, and `href` is what chooses the element — a link dressed as a
	 * button by hand ends up with the wrong semantics for a keyboard or a screen
	 * reader.
	 */
	type Props =
		| (Common & Omit<HTMLButtonAttributes, 'class' | 'children'> & { href?: undefined })
		| (Common & Omit<HTMLAnchorAttributes, 'class' | 'children'> & { href: string });

	let {
		variant = 'primary',
		size = 'md',
		iconOnly = false,
		children,
		class: className,
		href,
		...rest
	}: Props = $props();

	const classes = $derived(button({ variant, size, iconOnly, class: className }));
</script>

{#if href !== undefined}
	<a class={classes} {href} {...rest as HTMLAnchorAttributes}>
		{@render children()}
	</a>
{:else}
	<button class={classes} {...rest as HTMLButtonAttributes}>
		{@render children()}
	</button>
{/if}
