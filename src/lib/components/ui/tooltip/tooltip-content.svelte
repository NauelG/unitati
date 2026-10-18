<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
	import TooltipPortal from "./tooltip-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 0,
		side = "top",
		children,
		portalProps,
		...restProps
	}: TooltipPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{side}
		class={cn(
			"bg-foreground text-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 z-50 w-fit origin-(--bits-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</TooltipPrimitive.Content>
</TooltipPortal>
