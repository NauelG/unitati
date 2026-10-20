<script lang="ts">
	import { onMount } from 'svelte';
	import Eraser from '@lucide/svelte/icons/eraser';
	import Button from '#lib/components/unitati/Button.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * A drawn signature, by finger, pen or mouse (#275). The bitmap stays
	 * transparent with black ink, so the PNG is the signature alone and an
	 * untouched pad encodes to fully transparent pixels, which the server refuses.
	 * The paper colour is CSS, so the pad reads the same in dark mode.
	 *
	 * Strokes are kept in pad-relative coordinates and redrawn on resize, so
	 * turning a phone does not wipe what was signed. `value` is the PNG as a data
	 * URL, or the empty string while nothing is drawn.
	 */

	interface Props {
		name: string;
		label: string;
		hint: string;
		value?: string;
	}

	let { name, label, hint, value = $bindable('') }: Props = $props();

	type Point = { x: number; y: number };

	let canvas: HTMLCanvasElement;
	let strokes: Point[][] = [];
	let current: Point[] | null = null;
	const hintId = $props.id();

	// High-density screens get a sharper bitmap, capped so the PNG stays small.
	const scale = () => Math.min(window.devicePixelRatio || 1, 2);
	const lineWidth = 2.5;

	function context() {
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#111';
		ctx.fillStyle = '#111';
		ctx.lineWidth = lineWidth * scale();
		return ctx;
	}

	function toPixels(point: Point) {
		return { x: point.x * canvas.width, y: point.y * canvas.height };
	}

	function drawStroke(ctx: CanvasRenderingContext2D, stroke: Point[]) {
		const [first, ...rest] = stroke.map(toPixels);
		if (rest.length === 0) {
			ctx.beginPath();
			ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		ctx.beginPath();
		ctx.moveTo(first.x, first.y);
		for (const point of rest) ctx.lineTo(point.x, point.y);
		ctx.stroke();
	}

	function redraw() {
		const ctx = context();
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (const stroke of strokes) drawStroke(ctx, stroke);
	}

	function fit() {
		const { width, height } = canvas.getBoundingClientRect();
		const ratio = scale();
		const nextWidth = Math.round(width * ratio);
		const nextHeight = Math.round(height * ratio);
		if (canvas.width === nextWidth && canvas.height === nextHeight) return;
		canvas.width = nextWidth;
		canvas.height = nextHeight;
		redraw();
	}

	function pointOf(event: PointerEvent): Point {
		const rect = canvas.getBoundingClientRect();
		return {
			x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
			y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
		};
	}

	function start(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		canvas.setPointerCapture(event.pointerId);
		current = [pointOf(event)];
		strokes.push(current);
		redraw();
	}

	function move(event: PointerEvent) {
		if (!current) return;
		event.preventDefault();
		current.push(pointOf(event));
		redraw();
	}

	function end() {
		if (!current) return;
		current = null;
		value = canvas.toDataURL('image/png');
	}

	function clear() {
		strokes = [];
		current = null;
		redraw();
		value = '';
	}

	onMount(() => {
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(canvas);
		return () => observer.disconnect();
	});
</script>

<div class="space-y-[var(--space-2)]">
	<div class="flex items-end justify-between gap-[var(--space-3)]">
		<span class="text-label font-medium text-[var(--ink)]">{label}</span>
		<Button type="button" variant="ghost" size="sm" onclick={clear} disabled={!value}>
			<Eraser class="size-4" aria-hidden="true" />
			{m.signing_signature_clear()}
		</Button>
	</div>

	<!--
		Drawing has no keyboard equivalent; the confirmation checkbox and the
		reject form below stay fully keyboard operable.
	-->
	<canvas
		bind:this={canvas}
		class="block h-44 w-full cursor-crosshair touch-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-white"
		aria-label={m.signing_signature_area()}
		aria-describedby={hintId}
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
	></canvas>

	<p id={hintId} class="text-sm text-[var(--ink-muted)]">{hint}</p>
	<input type="hidden" {name} {value} />
</div>
