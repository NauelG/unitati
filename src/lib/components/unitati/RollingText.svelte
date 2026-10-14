<script lang="ts">
	import { splitRolling } from '#lib/rolling.js';
	import RollingNumber from './RollingNumber.svelte';

	/**
	 * A translated sentence whose numbers roll (S2, #91). `text` is the message
	 * rendered with `countToken(i)` in place of each count — the message keeps
	 * its own plural choice — and `counts` are the real numbers.
	 *
	 * The visible digits are inside NumberFlow's shadow DOM, which a screen
	 * reader reads fine, but its markup is not meant to be re-announced on every
	 * roll: the whole sentence is the accessible name, announced once, and the
	 * drawn parts are hidden from it.
	 */
	interface Props {
		text: string;
		counts: readonly number[];
	}

	let { text, counts }: Props = $props();

	const parts = $derived(splitRolling(text, counts));
	const plain = $derived(
		parts.map((part) => (typeof part === 'number' ? String(part) : part)).join('')
	);
</script>

<span class="sr-only">{plain}</span>
<span aria-hidden="true"
	>{#each parts as part, index (index)}{#if typeof part === 'number'}<RollingNumber
				value={part}
			/>{:else}{part}{/if}{/each}</span
>
