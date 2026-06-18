# Knowledge Graph

A collaborative, multi-tenant knowledge-graph web app. Each **graph** is an
independent collection of three kinds of linked notes — **questions**,
**thoughts**, and **references** — that anyone can browse and contribute to.
Notes connect with Obsidian-style `[[wikilinks]]`, render as a force-directed
graph, and export to BibTeX or a Quarto book. One server hosts many graphs
behind a portal where you can browse and create them.

> Markdown files on disk are the source of truth; SQLite is a derived index for
> fast queries. You can read, grep, back up, and version the raw `.md` notes
> directly.

---

## Features

**Notes & linking**
- Three node types — questions, thoughts, references — each its own full-screen page.
- `[[wikilink]]` connections with live autocomplete as you type `[[`. Links live in a hidden `<!--links-->` block, so they don't clutter the rendered note.
- Backlinks / related notes, grouped by type, with previews and dates.
- Markdown bodies (GFM); references can carry a URL and an attached PDF.
- Edit a title and the slug + every inbound link update automatically; a confirm guards accidental duplicate titles.

**Graph view**
- Full-screen force-directed graph (Cytoscape + fcose), node size scaled by incoming-link count, color by type.
- Click to open; hover for a title/preview tooltip; "View in graph" centers on a node.
- An **Edit links** mode lets you draw links by dragging between nodes and delete them by tapping an edge.

**References**
- PDF upload with an in-browser size check (oversized files are blocked with a popup, not an error page) and a responsive PDF.js preview that scales on mobile.
- **BibTeX export** per reference or for all references at once. Resolution order: a manual override → OpenAlex → arXiv API → Semantic Scholar → Crossref title search → a minimal `@misc`. arXiv IDs are even recovered from the uploaded PDF's watermark (and cached).

**Collaboration**
- Anonymous comments and emoji reactions on every note (Slack-style reaction picker).
- "Upgrade" a comment into its own question or thought, pre-linked back.
- Pin notes to surface them at the top of a graph's home page.

**Navigation & export**
- ⌘K / `/` command-palette search within a graph.
- Compact / cards view toggle, paginated "recent" feed with infinite scroll.
- Dark / light theme (dark default, no flash).
- Export an entire graph as a **Quarto book** (`.zip`) — one `.qmd` per note with rewritten cross-links.

**Multi-tenant portal**
- A portal at `/` lists all graphs and creates new ones from the browser — each lands at `/g/<name>`.
- Graphs are fully isolated: separate SQLite DB, markdown, and uploads per graph.
- Open creation, protected by a honeypot + per-IP rate limit.
- Optional single shared password (`SITE_PASSWORD`) gates the whole portal.

---

## Tech stack

- **Next.js 15** (App Router, server actions, intercepting routes for modals) + **React 19**
- **TypeScript**, **Tailwind CSS**
- **better-sqlite3** — one SQLite file per graph, plus a small registry DB
- **unified / remark / rehype** — markdown rendering + the wikilink plugin
- **Cytoscape** (+ `fcose`, `edgehandles`) — graph view
- **react-pdf / pdfjs-dist** — PDF preview and arXiv-ID extraction
- **jszip** — Quarto export bundles
- **lucide-react** — icons

No external services or databases required — it runs as a single Node process against local disk.

---

## Local development

```bash
npm install        # also copies the PDF.js worker into public/ (postinstall)
npm run dev        # http://localhost:3000
```

Open `http://localhost:3000`, create a graph from the portal, and you're in. Data
is written under `./data/` (gitignored). Other scripts:

```bash
npm run build      # production build (also type-checks + lints)
npm start          # run the production build (honors PORT)
npm run lint
```

---

## Configuration (environment variables)

All optional; sensible defaults for local dev.

| Variable | Default | Purpose |
|---|---|---|
| `KG_DATA_DIR` | `./data` | Root directory for all graph data + the registry. |
| `PORT` | `3000` | Port the server listens on. |
| `SITE_TITLE` | `Knowledge Graph` | Portal title (browser tab, portal heading). |
| `SITE_DESCRIPTION` | *(blurb)* | Portal description line. |
| `SITE_PASSWORD` | *(unset)* | If set, the **entire portal** (all graphs + APIs) requires this one password. Unset = open. |

On a server these live in `/etc/kg.env` (see deployment). Changing `SITE_PASSWORD`
invalidates existing sessions.

---

## How data is stored

```
data/
  registry.db                  # list of graphs (name, title, description, created_at)
  graphs/
    <graph>/
      app.db                   # nodes, links, revisions, comments, reactions (SQLite, WAL)
      nodes/<slug>.md          # the note body — source of truth
      uploads/<sha256>.pdf     # attached PDFs, content-addressed (deduped)
```

- **Markdown is canonical**; the SQLite `nodes`/`links` tables are rebuilt from it on every save, so they're a disposable index.
- **PDFs are content-addressed** by SHA-256, so the same paper uploaded to multiple references is stored once (per graph).
- **Backups** = archive a graph's directory (or all of `data/`). See `deploy/backup.sh`.

---

## Project layout

```
src/
  app/
    page.tsx                   # the portal (list + create graphs)
    login/                     # password gate (when SITE_PASSWORD is set)
    g/[graph]/                 # everything scoped to one graph
      page.tsx                 #   graph home (pinned + recent)
      n/[slug]/                #   node view + edit
      new/                     #   create node (also opens as a modal via @modal)
      list/  graph/            #   list view, force-directed graph view
      @modal/                  #   intercepted-route popups (e.g. + new node)
      api/                     #   per-graph endpoints: nodes, suggest, graph,
                               #   links, reactions, bibtex, quarto, uploads, exists
  components/                  # UI (NodeList, GraphView, RelatedSection, ReactionBar, …)
  lib/                         # data layer: db, registry, nodes, wikilinks,
                               # bibtex, quarto, markdown, uploads, auth, …
  middleware.ts                # the optional password gate
deploy/                        # systemd units, nginx, setup/update/backup scripts
```

---

## Deployment

See **[`deploy/README.md`](deploy/README.md)** for the full walkthrough — provisioning
a DigitalOcean droplet, the `setup.sh` / `update.sh` / `backup.sh` scripts, nginx +
HTTPS, the password gate, and per-deployment branding. In short: it's a single
Node process behind nginx, with all state on local disk under `KG_DATA_DIR`.
