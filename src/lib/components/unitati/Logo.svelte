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
	import mark from '#lib/assets/brand/unitati-mark.svg';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** `lockup` is the mark plus the wordmark; `mark` is the symbol alone, for tight spaces. */
		variant?: LogoVariant;
		size?: LogoSize;
		class?: string;
	}

	let { variant = 'lockup', size, class: className }: Props = $props();

	const sources = { mark, lockup } satisfies Record<LogoVariant, string>;
</script>

<img src={sources[variant]} alt={m.app_name()} class={logo({ size, class: className })} />
