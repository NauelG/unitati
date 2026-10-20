<script lang="ts">
	import {
		CELL_PADDING_MM,
		LABEL_FORMATS,
		layoutSheets,
		type LabelFormatKey
	} from '#lib/domain/label-formats.js';
	import { m } from '#lib/paraglide/messages.js';

	export interface PrintableLabel {
		tag: string;
		name: string;
		qrSvg: string;
	}

	interface Props {
		labels: PrintableLabel[];
		format: LabelFormatKey;
		/** Empty cells at the start of the first sheet. */
		skip: number;
		productName: string;
		/** URL of the brand's mark, when it has one. */
		markUrl: string | null;
	}

	let { labels, format, skip, productName, markUrl }: Props = $props();

	const spec = $derived(LABEL_FORMATS[format]);
	const sheets = $derived(layoutSheets(format, labels, skip));

	/**
	 * The 4-module quiet zone as a share of the QR box (`--qr`): 4 / (modules + 2 × 4).
	 * It is a ratio of `--qr`, not a CSS percentage: a percentage padding resolves against
	 * the parent's width, which is the whole label.
	 */
	function quietRatio(svg: string): number {
		const modules = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1] ?? 0);
		return modules > 0 ? 4 / (modules + 8) : 0;
	}
	// On screen only: a roll label is tiny and a sheet is taller than a window.
	const zoom = $derived(spec.sheet ? 0.9 : 4);
</script>

<div class="sheets" style:--zoom={zoom}>
	{#each sheets as cells, sheetIndex (sheetIndex)}
		<section
			class="sheet"
			data-sheet
			style:--page-w="{spec.pageMm.width}mm"
			style:--page-h="{spec.pageMm.height}mm"
			style:--cols={spec.columns}
			style:--rows={spec.rows}
			style:--cell-w="{spec.cellMm.width}mm"
			style:--cell-h="{spec.cellMm.height}mm"
			style:--pad-top="{spec.marginTopMm}mm"
			style:--inner="{CELL_PADDING_MM}mm"
			style:--qr="{spec.qrMm}mm"
			style:--tag-size="{spec.tagPt}pt"
		>
			{#each cells as cell, cellIndex (cellIndex)}
				{#if cell}
					<article class="label" data-label={cell.tag}>
						<div class="qr" style:--quiet={quietRatio(cell.qrSvg)} aria-hidden="true">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG written by the qrcode library from a URL we built -->
							{@html cell.qrSvg}
						</div>
						<div class="text">
							<p class="tag">{cell.tag}</p>
							{#if spec.showName}<p class="name">{cell.name}</p>{/if}
							<p class="owner">
								{#if markUrl && spec.showMark}<img class="mark" src={markUrl} alt="" />{/if}
								<span>{m.labels_owned_by({ name: productName })}</span>
							</p>
						</div>
					</article>
				{:else}
					<div class="empty" data-empty></div>
				{/if}
			{/each}
		</section>
	{/each}
</div>

<style>
	.sheet {
		box-sizing: border-box;
		width: var(--page-w);
		/* A hair under the page: an exact fit lets rounding push a blank page out. */
		height: calc(var(--page-h) - 0.2mm);
		padding-top: var(--pad-top);
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--cell-w));
		grid-template-rows: repeat(var(--rows), var(--cell-h));
		align-content: start;
		overflow: hidden;
		background: #fff;
		color: #000;
		break-inside: avoid;
	}
	.sheet:not(:last-child) {
		break-after: page;
	}
	.label,
	.empty {
		box-sizing: border-box;
		width: var(--cell-w);
		height: var(--cell-h);
		overflow: hidden;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 1.5mm;
		padding: var(--inner);
	}
	.qr {
		box-sizing: border-box;
		flex: none;
		width: var(--qr);
		height: var(--qr);
		padding: calc(var(--qr) * var(--quiet, 0));
		background: #fff;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		shape-rendering: crispEdges;
	}
	.text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.8mm;
	}
	p {
		margin: 0;
	}
	.tag {
		font-family: var(--font-mono);
		font-size: var(--tag-size);
		font-weight: 600;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.name {
		font-size: 8pt;
		line-height: 1.2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.owner {
		display: flex;
		align-items: center;
		gap: 1mm;
		font-size: 6pt;
		line-height: 1.2;
	}
	.mark {
		height: 3.5mm;
		width: auto;
		max-width: 6mm;
		object-fit: contain;
	}

	@media screen {
		.sheets {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 16px;
			padding: 16px;
		}
		.sheet {
			zoom: var(--zoom);
			border: 1px solid var(--border);
			box-shadow: var(--shadow-sm, 0 1px 4px rgb(0 0 0 / 0.12));
		}
		.label {
			outline: 1px dashed var(--border);
			outline-offset: -1px;
		}
	}
</style>
