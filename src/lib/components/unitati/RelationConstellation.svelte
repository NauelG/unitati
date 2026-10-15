<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The three kinds of node share one pill and differ in what they say: the
	 * current record (outlined, inert), a linked record (a link) and a counted
	 * group (dashed, inert). The dot is the record's domain colour.
	 */
	export const constellation = tv({
		slots: {
			panel: 'ut-constellation relative mx-auto aspect-square w-full max-w-[18rem]',
			node: [
				'ut-constellation-node absolute -translate-x-1/2 -translate-y-1/2 bg-[var(--surface-1)]',
				'px-[var(--space-2)] py-[2px] font-mono text-xs font-semibold'
			],
			dot: 'mr-1 inline-block size-1.5 rounded-full align-middle'
		},
		variants: {
			type: {
				centre: {
					node: 'rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-[var(--ink)]'
				},
				record: {
					node: [
						'rounded-[var(--radius-sm)] text-[var(--ink)] outline-offset-2 hover:underline',
						'focus-visible:outline-2 focus-visible:outline-[var(--brand)]'
					]
				},
				group: {
					node: [
						'rounded-[var(--radius-full)] border border-dashed border-[var(--border-strong)]',
						'text-[var(--ink-muted)]'
					]
				}
			},
			kind: {
				ticket: { dot: 'bg-[var(--desk)]' },
				asset: { dot: 'bg-[var(--asset)]' }
			}
		}
	});
</script>

<script lang="ts">
	import { layoutConstellation, type ConstellationNode } from '#lib/constellation.js';
	import { handRecordMorphTo } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AssetRelatedGroup } from '#lib/server/links/index.js';
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
		groups: AssetRelatedGroup[];
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

	const styles = constellation();
</script>

{#if layout}
	<WorkPanel heading={m.constellation_title()} class={className}>
		<div class={styles.panel()}>
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
				class={styles.node({ type: 'centre' })}
				style:left={percent(layout.centre.x, layout.size)}
				style:top={percent(layout.centre.y, layout.size)}
				style:--i="0"
			>
				<span class={constellation({ kind: layout.centre.kind }).dot()} aria-hidden="true"
				></span>{layout.centre.tag}
			</span>

			{#each layout.nodes as node, index (index)}
				{#if node.type === 'record'}
					<a
						href={node.href}
						aria-label={recordLabel(node)}
						class={styles.node({ type: 'record' })}
						style:left={percent(node.x, layout.size)}
						style:top={percent(node.y, layout.size)}
						style:--i={index + 1}
						onclick={(event) => {
							const target = event.currentTarget.querySelector<HTMLElement>('[data-node-tag]');
							if (target) handRecordMorphTo(target, node.tag);
						}}
					>
						<span class={constellation({ kind: node.kind }).dot()} aria-hidden="true"></span><span
							data-node-tag>{node.tag}</span
						>
					</a>
				{:else}
					<span
						role="img"
						aria-label={groupLabel(node)}
						class={styles.node({ type: 'group' })}
						style:left={percent(node.x, layout.size)}
						style:top={percent(node.y, layout.size)}
						style:--i={index + 1}
					>
						<span class={constellation({ kind: node.kind }).dot()} aria-hidden="true"
						></span>+{node.count}
					</span>
				{/if}
			{/each}
		</div>
	</WorkPanel>
{/if}
