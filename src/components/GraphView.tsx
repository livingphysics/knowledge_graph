'use client';

import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { useRouter, useSearchParams } from 'next/navigation';

cytoscape.use(fcose);

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

export default function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus');
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

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
            data: { id: n.slug, label: n.title, type: n.type },
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
                'background-color': (n) =>
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
                width: 18,
                height: 18,
                'border-width': 0,
                'transition-property': 'width height border-width border-color',
                'transition-duration': 150,
              },
            },
            {
              selector: 'node:active',
              style: {
                width: 24,
                height: 24,
                'border-width': 2,
                'border-color': '#fafafa',
              },
            },
            {
              selector: 'node.hovered',
              style: {
                width: 22,
                height: 22,
                'border-width': 2,
                'border-color': '#fafafa',
              },
            },
            {
              selector: 'node.focused',
              style: {
                width: 26,
                height: 26,
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
          } as cytoscape.LayoutOptions,
        });

        cy.on('tap', 'node', (evt) => {
          const slug = evt.target.id();
          router.push(`/n/${slug}`);
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

        cy.on('pan zoom', () => setHover(null));

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
      <Legend />
      {hover && <Tooltip hover={hover} />}
    </>
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
