<script lang="ts" module>
	import type { VariantProps } from 'tailwind-variants';
	import { tv } from '#lib/tv.js';

	/**
	 * The `.ut-avatar` and `.ut-person` families.
	 *
	 * The surfaces are always neutral, with no tone variant on purpose: colour in
	 * this system means a domain or a state, and a person is neither. Tinting
	 * people by initial is the fastest way to imply a meaning that is not there.
	 */
	export const avatar = tv({
		slots: {
			person: 'inline-flex items-center gap-[var(--space-2)]',
			disc: [
				'inline-flex shrink-0 items-center justify-center overflow-hidden',
				'rounded-[var(--radius-full)] border border-[var(--border)]',
				'bg-[var(--surface-2)] font-semibold leading-none text-[var(--ink)]'
			],
			name: 'font-medium text-[var(--ink)]',
			meta: 'text-small text-[var(--ink-muted)]'
		},
		variants: {
			size: {
				sm: { disc: 'size-[22px] text-caption' },
				md: { disc: 'size-[28px] text-xs' },
				lg: { disc: 'size-[40px] text-sm' }
			}
		},
		defaultVariants: { size: 'md' }
	});

	export type AvatarSize = NonNullable<VariantProps<typeof avatar>['size']>;

	/**
	 * First name and first surname, which is how a Spanish full name reads.
	 * Taking the last word instead would turn "Ada Lovelace Byron" into "AB".
	 */
	export function initialsOf(name: string): string {
		return name
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<script lang="ts">
	interface Props {
		name: string;
		/**
		 * A second line under the name — a role, a department. Passing it renders
		 * the person composition (disc, name, meta) rather than the bare disc,
		 * because `meta` has nowhere else to live.
		 */
		meta?: string;
		imageUrl?: string;
		size?: AvatarSize;
		class?: string;
	}

	let { name, meta, imageUrl, size = 'md', class: className }: Props = $props();

	const styles = $derived(avatar({ size }));
	const initials = $derived(initialsOf(name));
	// `meta` is what decides it, because a name on its own belongs in the cell
	// beside the disc, not inside this component.
	const asPersonRow = $derived(meta !== undefined);
</script>

{#if asPersonRow}
	<!-- The name is right there as text, so the disc is decoration. -->
	<span class={styles.person({ class: className })}>
		<span class={styles.disc()} aria-hidden="true">
			{#if imageUrl}
				<img src={imageUrl} alt="" class="size-full object-cover" />
			{:else}
				{initials}
			{/if}
		</span>
		<span class="flex min-w-0 flex-col">
			<span class={styles.name()}>{name}</span>
			<span class={styles.meta()}>{meta}</span>
		</span>
	</span>
{:else if imageUrl}
	<span class={styles.disc({ class: className })}>
		<img src={imageUrl} alt={name} class="size-full object-cover" />
	</span>
{:else}
	<!-- Standing alone, the disc carries the name: "AL" announced on its own
	     tells a screen reader nothing. -->
	<span class={styles.disc({ class: className })} role="img" aria-label={name}>
		<span aria-hidden="true">{initials}</span>
	</span>
{/if}
