// Client-safe URL helper (no server-only imports). Builds graph-scoped paths.
export function gPath(graph: string, sub = ''): string {
  return `/g/${encodeURIComponent(graph)}${sub}`;
}
