'use client';

import { useEffect, useRef, useState } from 'react';
import cytoscape, {
  type Core,
  type ElementDefinition,
  type NodeSingular,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import edgehandles from 'cytoscape-edgehandles';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Check } from 'lucide-react';

cytoscape.use(fcose);
cytoscape.use(edgehandles);

const COLORS = {
  question: '#0ea5e9',
  thought: '#f59e0b',
  reference: '#10b981',
} as const;

interface GraphNode {
  slug: string;
  type: keyof typeof COLORS;
  title: string;
  preview: string;
  in_degree: number;
}

/** Maps in-degree → node diameter in px. Log-scaled so hubs stand out without dwarfing the rest. */
function sizeForDegree(d: number): number {
  return Math.round(14 + 5 * Math.log2(1 + Math.max(0, d)));
}

interface ApiData {
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
}

interface HoverState {
  node: GraphNode;
  x: number;
  y: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EhInstance = { enableDrawMode?: () => void; disableDrawMode?: () => void } & any;

export default function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const ehRef = useRef<EhInstance | null>(null);
  const editingRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus');
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [editing, setEditing] = useState(false);

  // Keep the ref in sync so cytoscape event handlers can read the latest value.
  useEffect(() => {
    editingRef.current = editing;
    if (!ehRef.current) return;
    if (editing) ehRef.current.enableDrawMode?.();
    else ehRef.current.disableDrawMode?.();
  }, [editing]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/graph');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiData;
        if (cancelled || !containerRef.current) return;

        if (data.nodes.length === 0) {
          setEmpty(true);
          return;
        }

        const nodeBySlug = new Map(data.nodes.map((n) => [n.slug, n]));

        const elements: ElementDefinition[] = [
          ...data.nodes.map((n) => ({
            data: {
              id: n.slug,
              label: n.title,
              type: n.type,
              in_degree: n.in_degree,
            },
          })),
          ...data.edges.map((e) => ({
            data: { id: `${e.source}--${e.target}`, source: e.source, target: e.target },
          })),
        ];

        const cy = cytoscape({
          container: containerRef.current,
          elements,
          wheelSensitivity: 0.2,
          style: [
            {
              selector: 'node',
              style: {
                'background-color': (n: NodeSingular) =>
                  COLORS[n.data('type') as keyof typeof COLORS] ?? '#888',
                label: 'data(label)',
                color: '#fafafa',
                'font-size': '13px',
                'font-weight': 500,
                'text-outline-color': '#0a0a0a',
                'text-outline-width': 2,
                'text-valign': 'bottom',
                'text-margin-y': 6,
                'text-wrap': 'wrap',
                'text-max-width': '140px',
                width: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0),
                height: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0),
                'border-width': 0,
                'transition-property': 'width height border-width border-color',
                'transition-duration': 150,
              },
            },
            {
              selector: 'node:active',
              style: {
                width: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 6,
                height: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 6,
                'border-width': 2,
                'border-color': '#fafafa',
              },
            },
            {
              selector: 'node.hovered',
              style: {
                width: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 4,
                height: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 4,
                'border-width': 2,
                'border-color': '#fafafa',
              },
            },
            {
              selector: 'node.focused',
              style: {
                width: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 8,
                height: (n: NodeSingular) => sizeForDegree((n.data('in_degree') as number) ?? 0) + 8,
                'border-width': 3,
                'border-color': '#fafafa',
              },
            },
            {
              selector: 'edge',
              style: {
                width: 1.5,
                'line-color': 'rgba(140,140,140,0.45)',
                'curve-style': 'straight',
              },
            },
            {
              selector: 'edge:active, edge.hovered',
              style: { width: 3, 'line-color': '#ef4444' },
            },
            // edgehandles plug-in styling
            {
              selector: '.eh-handle',
              style: {
                'background-color': '#fafafa',
                width: 8,
                height: 8,
                shape: 'ellipse',
                'overlay-opacity': 0,
                'border-width': 2,
                'border-color': '#0ea5e9',
              },
            },
            {
              selector: '.eh-source, .eh-target',
              style: { 'border-width': 2, 'border-color': '#0ea5e9' },
            },
            {
              selector: '.eh-preview, .eh-ghost-edge',
              style: {
                'line-color': '#0ea5e9',
                'line-style': 'dashed',
                width: 2,
                opacity: 0.9,
              },
            },
            {
              selector: '.eh-ghost-edge.eh-preview-active',
              style: { opacity: 0 },
            },
          ],
          layout: {
            name: 'fcose',
            animate: true,
            animationDuration: 600,
            randomize: true,
            quality: 'proof',
            nodeSeparation: 80,
            idealEdgeLength: 110,
            nodeRepulsion: 6500,
            gravity: 0.15,
            padding: 60,
            nodeDimensionsIncludeLabels: true,
          } as cytoscape.LayoutOptions,
        });

        cy.on('tap', 'node', (evt) => {
          if (editingRef.current) return; // in edit mode, taps on nodes start edges, not nav
          const slug = evt.target.id();
          router.push(`/n/${slug}`);
        });

        // --- edge editing ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eh = (cy as any).edgehandles({
          snap: true,
          snapThreshold: 30,
          handleNodes: 'node',
          edgeParams: () => ({}),
        });
        // Don't enable draw mode here — it stays off until the user toggles edit mode.
        ehRef.current = eh;

        cy.on('ehcomplete', (_evt, sourceNode, targetNode, addedEdge) => {
          const from = sourceNode.id() as string;
          const to = targetNode.id() as string;
          addedEdge.remove();
          fetch('/api/links', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ from, to }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.error) {
                alert(`Link failed: ${res.error}`);
                return;
              }
              const id = from < to ? `${from}--${to}` : `${to}--${from}`;
              if (!cy.getElementById(id).nonempty()) {
                cy.add({
                  data: { id, source: from < to ? from : to, target: from < to ? to : from },
                });
              }
            })
            .catch((e) => alert(`Link failed: ${e?.message ?? 'network error'}`));
        });

        cy.on('tap', 'edge', (evt) => {
          if (!editingRef.current) return; // only delete edges in edit mode
          const edge = evt.target;
          const a = edge.source().id() as string;
          const b = edge.target().id() as string;
          if (!confirm(`Remove link between "${a}" and "${b}"?`)) return;
          edge.addClass('hovered');
          fetch('/api/links', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ a, b }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.error) {
                alert(`Delete failed: ${res.error}`);
                edge.removeClass('hovered');
                return;
              }
              edge.remove();
            })
            .catch((e) => {
              alert(`Delete failed: ${e?.message ?? 'network error'}`);
              edge.removeClass('hovered');
            });
        });

        cy.on('mouseover', 'node', (evt) => {
          const slug = evt.target.id() as string;
          const node = nodeBySlug.get(slug);
          if (!node) return;
          evt.target.addClass('hovered');
          const pos = evt.target.renderedPosition();
          setHover({ node, x: pos.x, y: pos.y });
        });

        cy.on('mouseout', 'node', (evt) => {
          evt.target.removeClass('hovered');
          setHover(null);
        });

        cy.on('pan zoom drag', () => setHover(null));

        cy.one('layoutstop', () => {
          if (focus) {
            const target = cy.getElementById(focus);
            if (target.nonempty()) {
              target.addClass('focused');
              cy.animate({ center: { eles: target }, zoom: 1.4, duration: 600 });
            }
          }
        });

        cyRef.current = cy;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load graph');
      }
    }

    init();

    return () => {
      cancelled = true;
      ehRef.current = null;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [router, focus]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-red-400">
        Graph error: {error}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
        No nodes yet. Add one with the + buttons.
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <EditToggle editing={editing} onToggle={() => setEditing((e) => !e)} />
      {editing && <EditHint />}
      <Legend />
      {hover && <Tooltip hover={hover} />}
    </>
  );
}

function EditToggle({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={editing}
      className={`fixed top-3 right-16 z-40 px-3 h-10 inline-flex items-center gap-1.5 rounded-lg border text-sm transition ${
        editing
          ? 'bg-sky-700 hover:bg-sky-600 border-sky-600 text-white'
          : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 [html.light_&]:bg-neutral-100/95 [html.light_&]:hover:bg-neutral-200 [html.light_&]:border-neutral-300'
      }`}
    >
      {editing ? (
        <>
          <Check className="w-4 h-4" strokeWidth={1.75} />
          Done
        </>
      ) : (
        <>
          <Pencil className="w-4 h-4" strokeWidth={1.75} />
          Edit links
        </>
      )}
    </button>
  );
}

function EditHint() {
  return (
    <div className="absolute top-16 right-16 z-10 px-3 py-2 rounded-lg bg-neutral-900/85 [html.light_&]:bg-white/95 border border-neutral-800 [html.light_&]:border-neutral-200 backdrop-blur text-[11px] text-neutral-400 [html.light_&]:text-neutral-600 max-w-xs pointer-events-none">
      <div>Drag the dot on a node onto another node to link them.</div>
      <div>Tap an edge to remove it.</div>
    </div>
  );
}

function Tooltip({ hover }: { hover: HoverState }) {
  return (
    <div
      className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 max-w-xs rounded-lg border border-neutral-700 [html.light_&]:border-neutral-300 bg-neutral-900/95 [html.light_&]:bg-white/97 backdrop-blur px-3 py-2 shadow-xl"
      style={{ left: hover.x, top: hover.y - 18 }}
    >
      <div className="font-medium text-sm">{hover.node.title}</div>
      {hover.node.preview && (
        <p className="mt-1 text-xs text-neutral-400 [html.light_&]:text-neutral-600 line-clamp-2">
          {hover.node.preview}
        </p>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-24 left-4 z-10 px-3 py-2 rounded-lg bg-neutral-900/85 [html.light_&]:bg-white/95 border border-neutral-800 [html.light_&]:border-neutral-200 backdrop-blur text-xs flex flex-col gap-1.5 pointer-events-none">
      <LegendDot color={COLORS.question} label="Questions" />
      <LegendDot color={COLORS.thought} label="Thoughts" />
      <LegendDot color={COLORS.reference} label="References" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}
