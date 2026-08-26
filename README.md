# Article Workflow Editor

An editable model of Sanity's article lifecycle — 12 states, 18 transitions, five writer tiers
and ten article types — with a lens that collapses the graph to the path one article actually
takes.

Built from the [Article Workflow Diagram Patrick](https://claude.ai/design/p/922e31d5-2797-4d43-8705-75212be1f03d?file=Article+Workflow+Diagram+Patrick.dc.html)
design document in the *Sanity roles and permissions* Claude Design project.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run check` | Path-derivation correctness checks — **run this after editing the seed** |
| `npm run lint:tokens` | Fails if any raw hex colour appears under `src/` |

## The idea

The static diagram couldn't answer the question people actually ask: *what happens to my
article?* A MidDTP writer's News brief self-publishes straight from Grammarly Edit Complete.
That same writer's Shorty goes through copy edit. Both facts live in one diagram, and neither
is visible when every edge is drawn at once.

So the fork at **Grammarly Edit Complete is not decided by writer tier** — it's decided by the
tier × article-type **self-publish matrix**, editable in the page. Flip a cell and the active
lens re-derives immediately.

### Three lenses, composable

- **Article by** — writer tier: UltraDTP (16), MidDTP (58), DTP, SWUser (34), AI-assist (25)
- **Article type** — Shorty, Medium, Article, Duo, News brief, Short MM, Long MM, Influencer,
  Earnings, AI-Assist
- **Viewing as** — Writers / Copyeds / FFEs / HQ / System

Tier + type answer *where does this article go*. Viewer role answers *which of those moves are
mine*. States an article can't reach are dimmed rather than removed — knowing a state exists but
is unreachable tells you more than it vanishing.

### Reference paths

| Tier + type | States | Route |
| --- | --- | --- |
| UltraDTP + Shorty | 6 | self-publishes, never enters review |
| UltraDTP + AI-Assist | 10 | denied by matrix → copy edit, no financial |
| MidDTP + News brief | 6 | self-publishes |
| MidDTP + Shorty | 10 | denied by matrix → copy edit, no financial |
| DTP + anything | 10 | always copy edit, never financial |
| SWUser + anything | 12 | copy edit → financial edit — the full graph |
| AI-assist + AI-Assist | 6 | self-publishes |

`npm run check` asserts all of these plus default-deny and the viewer-role subset.

## Editing

Drag nodes to reposition. Drag between node edges to create a transition. Click any node or edge
to open the inspector, which edits everything the model holds — including per-tier availability
and the self-publish gate. `+ Add state` drops a new node; the matrix's *New article type* adds a
column **denied for every tier** (the "New Type" default-deny rule from the source permissions
table).

### Persistence

`src/data/workflow.seed.json` is the committed source of truth and loads on first run. After
that a localStorage draft (`sanity-workflow:draft:v1`) wins. **Export JSON** downloads the
current document — copy it over the seed and commit to make an edit permanent. **Import JSON**
validates before applying and reports every problem at once. **Reset to seed** discards the
draft.

## Two things to know

**HQ's any-to-any is not drawn.** HQ editors can move an article between any two states — 132
edges that would bury the diagram. It's the `hqOverride` flag, surfaced as a banner when you view
as HQ.

**One routing rule is derived, not confirmed.** A MidDTP or UltraDTP article that *fails* the
self-publish check falls through to copy edit, and is currently routed like DTP: the copyeditor
publishes from In Copy Edit, no financial edit. The design states only that *"only SWUser
articles continue to financial edit"* — it says nothing about this fall-through case
specifically. Change `t-inCopy-scheduled` / `t-inCopy-readyFinancial` in the seed if that's
wrong, then re-run `npm run check`.

This is tracked as the third item under **Still open** in the page's notes panel, alongside the
two claim models the design left undecided.

## Design system

`public/ds/colors_and_type.css` is a vendored, **trimmed** copy of the Motley Fool design
system's stylesheet. Every token, base type rule and utility class is byte-identical to
upstream; only the `@font-face` block was reduced — to the one Satoshi variable face we ship.
The file's header records exactly what was removed and why. Re-syncing means re-fetching
upstream and re-applying that trim deliberately, not pasting over it.

No file under `src/` may contain a raw hex colour; every colour resolves through an `--mf-*`
token. `npm run lint:tokens` enforces it.
