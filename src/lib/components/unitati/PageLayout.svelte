<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	/**
	 * The app's one page-layout vocabulary (ADR 0018): three shapes, no per-page
	 * container. Fluid below the `--size-page-max` ceiling, centred beyond it —
	 * full width only wins when the content actually fills it, which is why
	 * `form` stays a fixed measure instead of stretching to the ceiling too.
	 */
	export const pageLayout = tv({
		slots: {
			root: 'mx-auto w-full',
			main: '',
			side: ''
		},
		variants: {
			variant: {
				/** Lists and tables: fluid to the ceiling, centred beyond it. */
				index: {
					root: 'max-w-[var(--size-page-max)]'
				},
				/**
				 * The same ceiling, plus a 340px side column above 1100px (falls
				 * below `main` under it) for genuinely secondary content — a
				 * record's own panels, or (ADR 0020) a create flow's own subflow,
				 * like `/assets/new`'s model-creation helper. Not detail-only.
				 */
				record: {
					root: [
						'max-w-[var(--size-page-max)] grid items-start gap-[var(--space-6)]',
						'min-[1100px]:grid-cols-[minmax(0,1fr)_340px]'
					],
					main: 'flex min-w-0 flex-col gap-[var(--space-5)]',
					side: 'flex min-w-0 flex-col gap-[var(--space-4)]'
				},
				/** Create/edit forms and prose: a fixed measure, never the ceiling. */
				form: {
					root: 'max-w-2xl'
				}
			}
		}
	});

	export type PageLayoutVariant = NonNullable<VariantProps<typeof pageLayout>['variant']>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant: PageLayoutVariant;
		/** The page's own content. Under `record`, this is the main column. */
		children: Snippet;
		/** The side column, `record` only: panels at 340px above 1100px. */
		side?: Snippet;
		class?: string;
	}

	let { variant, children, side, class: className }: Props = $props();

	const styles = $derived(pageLayout({ variant }));
</script>

<div class={styles.root({ class: className })}>
	{#if variant === 'record'}
		<div class={styles.main()}>{@render children()}</div>
		{#if side}
			<aside class={styles.side()}>{@render side()}</aside>
		{/if}
	{:else}
		{@render children()}
	{/if}
</div>
