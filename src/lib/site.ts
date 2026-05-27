// Per-deployment branding. Override via env vars in /etc/kg.env:
//   SITE_TITLE="My Knowledge Graph"
//   SITE_DESCRIPTION="What this instance is about."

export function siteTitle(): string {
  return process.env.SITE_TITLE?.trim() || 'Knowledge Graph';
}

export function siteDescription(): string {
  return (
    process.env.SITE_DESCRIPTION?.trim() ||
    'A collaborative knowledge graph of questions, thoughts, and references.'
  );
}
