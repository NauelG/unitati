<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The form-level error line: what a server refusal says under a form, inside
	 * a `ConfirmDialog` or a `Sheet`. One spelling instead of the fifteen that
	 * grew by copy; a field's own error stays on `Field`. `empty:hidden` is how
	 * "nothing to say" renders nothing: the live region stays in the DOM, so the
	 * message is announced when it fills in.
	 */
	export const formError = tv({ base: 'text-small text-[var(--danger)] empty:hidden' });
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/**
		 * Empty (or absent) renders nothing, so callers write
		 * `<FormError>{form?.message}</FormError>` without an `{#if}`.
		 */
		children?: Snippet;
		/** For an `aria-describedby` pointing at the message. */
		id?: string;
		class?: string;
	}

	let { children, id, class: className }: Props = $props();
</script>

{#if children}
	<p {id} role="alert" class={formError({ class: className })}>{@render children()}</p>
{/if}
