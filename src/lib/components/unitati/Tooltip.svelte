<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	/**
	 * A styled tooltip for icon-only controls (#215), replacing the slow, unstyled
	 * native `title`. It shows on hover and on keyboard focus. The trigger is the
	 * caller's own element: spread `props` on it. Icon-only controls still need
	 * their own `aria-label`; the tooltip is a visual aid, not their name.
	 */
	interface Props {
		content: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		/** Renders the trigger with no tooltip, e.g. while the label is already visible. */
		disabled?: boolean;
		child: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { content, side = 'right', disabled = false, child }: Props = $props();
</script>

{#snippet trigger({ props }: { props: Record<string, unknown> })}
	{@render child({ props })}
{/snippet}

<Tooltip.Provider delayDuration={150}>
	<Tooltip.Root {disabled}>
		<Tooltip.Trigger child={trigger} />
		<Tooltip.Content {side} sideOffset={8}>{content}</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
