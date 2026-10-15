<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const;
	export type HttpMethod = (typeof HTTP_METHODS)[number];

	/**
	 * An HTTP method as it is written in the API documentation. Shares the
	 * pill geometry of the `.ut-badge` family, without the status dot (a method
	 * names a kind of request, not a state), and sets the tone by how much the
	 * request changes: reads are calm, deletes warn.
	 */
	export const methodBadge = tv({
		base: [
			'inline-flex items-center h-[22px] px-[var(--space-2)] rounded-[var(--radius-full)]',
			'font-mono text-xs leading-4 font-semibold tracking-[0.04em] whitespace-nowrap'
		],
		variants: {
			method: {
				GET: 'bg-[var(--brand-soft)] text-[var(--brand)]',
				POST: 'bg-[var(--success-soft)] text-[var(--success)]',
				PATCH: 'bg-[var(--warning-soft)] text-[var(--warning)]',
				DELETE: 'bg-[var(--danger-soft)] text-[var(--danger)]'
			}
		}
	});
</script>

<script lang="ts">
	interface Props {
		method: HttpMethod;
		class?: string;
	}

	let { method, class: className }: Props = $props();
</script>

<span class={methodBadge({ method, class: className })}>{method}</span>
