<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: Size;
		children: Snippet;
	}

	let { variant = 'primary', size = 'md', children, class: extra, ...rest }: Props = $props();

	// Colours come from the design tokens in app.css, never from literals here.
	const variants: Record<Variant, string> = {
		primary: 'bg-[var(--action)] text-[var(--on-action)] hover:bg-[var(--action-hover)]',
		secondary:
			'bg-[var(--surface-1)] text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--surface-2)]',
		ghost: 'text-[var(--ink)] hover:bg-[var(--surface-2)]',
		danger: 'bg-[var(--danger)] text-[var(--on-danger)] hover:brightness-110'
	};

	const sizes: Record<Size, string> = {
		sm: 'h-[var(--size-control-sm)] px-3 text-sm',
		md: 'h-[var(--size-control-md)] px-4 text-sm',
		lg: 'h-[var(--size-control-lg)] px-5 text-base'
	};
</script>

<button
	class="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 {variants[
		variant
	]} {sizes[size]} {extra ?? ''}"
	{...rest}
>
	{@render children()}
</button>
