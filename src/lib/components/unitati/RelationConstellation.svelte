<script lang="ts">
	import { layoutConstellation, type ConstellationNode } from '#lib/constellation.js';
	import { handRecordMorphTo } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RelatedGroup } from '#lib/server/links/index.js';
	import WorkPanel from './WorkPanel.svelte';
	import { statusLabel } from './status.js';

	/**
	 * S3, the relation constellation (#91): the same typed array
	 * `RelatedRecords` lists, drawn as the record's neighbourhood — it at the
	 * centre, what it is linked to around it. A second projection, not a second
	 * query: it renders nothing the list does not already say.
	 *
	 * Edges are SVG hairlines; nodes are HTML links laid over them by
	 * percentage. That is deliberate: a node's tag has to be a real element with
	 * a box to take part in the record morph (`view-transition-name`), and a link
	 * is what keyboard and assistive tech already know how to use.
	 */
	interface Props {
		/** The record whose page this is. */
		centre: { kind: 'asset' | 'ticket'; tag: string };
		groups: RelatedGroup[];
		class?: string;
	}

	let { centre, groups, class: className }: Props = $props();

	const layout = $derived(
		layoutConstellation({
			centre,
			items: groups.flatMap((group) =>
				group.items.map((item) => ({
					kind: item.ref.kind,
					tag: item.ref.tag,
					href: item.ref.href,
					status: item.status
				}))
			)
		})
	);

	const KIND_LABEL = {
		ticket: () => m.constellation_kind_ticket(),
		asset: () => m.constellation_kind_asset()
	} as const;

	function percent(value: number, size: number): string {
		return `${(value / size) * 100}%`;
	}

	function recordLabel(node: Extract<ConstellationNode, { type: 'record' }>): string {
		return m.constellation_node_label({
			kind: KIND_LABEL[node.kind](),
			tag: node.tag,
			status: statusLabel(node.status)
		});
	}

	function groupLabel(node: Extract<ConstellationNode, { type: 'group' }>): string {
		if (node.kind === 'ticket') {
			return node.count === 1
				? m.constellation_group_tickets_one()
				: m.constellation_group_tickets_other({ count: node.count });
		}
		return node.count === 1
			? m.constellation_group_assets_one()
			: m.constellation_group_assets_other({ count: node.count });
	}

	const DOT = { ticket: 'var(--desk)', asset: 'var(--asset)' } as const;
</script>

{#if layout}
	<WorkPanel heading={m.constellation_title()} class={className}>
		<div class="ut-constellation relative mx-auto aspect-square w-full max-w-[18rem]">
			<svg
				viewBox="0 0 {layout.size} {layout.size}"
				class="absolute inset-0 size-full"
				aria-hidden="true"
				focusable="false"
			>
				{#each layout.edges as edge, index (index)}
					<line
						class="ut-constellation-edge"
						style:--i={index}
						x1={edge.from.x}
						y1={edge.from.y}
						x2={edge.to.x}
						y2={edge.to.y}
						pathLength="1"
						stroke="var(--border-strong)"
						stroke-width="1"
						vector-effect="non-scaling-stroke"
					/>
				{/each}
			</svg>

			<span
				class="ut-constellation-node absolute -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-1)] px-[var(--space-2)] py-[2px] font-mono text-xs font-semibold text-[var(--ink)]"
				style:left={percent(layout.centre.x, layout.size)}
				style:top={percent(layout.centre.y, layout.size)}
				style:--i="0"
			>
				<span
					class="mr-1 inline-block size-1.5 rounded-full align-middle"
					style:background-color={DOT[layout.centre.kind]}
					aria-hidden="true"
				></span>{layout.centre.tag}
			</span>

			{#each layout.nodes as node, index (index)}
				{#if node.type === 'record'}
					<a
						href={node.href}
						aria-label={recordLabel(node)}
						class="ut-constellation-node absolute -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] bg-[var(--surface-1)] px-[var(--space-2)] py-[2px] font-mono text-xs font-semibold text-[var(--ink)] outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
						style:left={percent(node.x, layout.size)}
						style:top={percent(node.y, layout.size)}
						style:--i={index + 1}
						onclick={(event) => {
							const target = event.currentTarget.querySelector<HTMLElement>('[data-node-tag]');
							if (target) handRecordMorphTo(target, node.tag);
						}}
					>
						<span
							class="mr-1 inline-block size-1.5 rounded-full align-middle"
							style:background-color={DOT[node.kind]}
							aria-hidden="true"
						></span><span data-node-tag>{node.tag}</span>
					</a>
				{:else}
					<span
						role="img"
						aria-label={groupLabel(node)}
						class="ut-constellation-node absolute -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-full)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-[var(--space-2)] py-[2px] font-mono text-xs font-semibold text-[var(--ink-muted)]"
						style:left={percent(node.x, layout.size)}
						style:top={percent(node.y, layout.size)}
						style:--i={index + 1}
					>
						<span
							class="mr-1 inline-block size-1.5 rounded-full align-middle"
							style:background-color={DOT[node.kind]}
							aria-hidden="true"
						></span>+{node.count}
					</span>
				{/if}
			{/each}
		</div>
	</WorkPanel>
{/if}
