# Article Workflow Editor

An editable model of Sanity's article lifecycle — 12 states, 24 transitions, four writer roles
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
article?* A Projects Author's News brief self-publishes straight from Grammarly Edit Complete.
That same writer's Shorty goes through copy edit. Both facts live in one diagram, and neither
is visible when every edge is drawn at once.

So the fork at **Grammarly Edit Complete is not decided by writer tier** — it's decided by the
tier × article-type **access matrix**, editable in the page. Each cell is three-way:

| | |
| --- | --- |
| ✓ | self-publishes it, skipping review |
| W | writes it, and it goes through review |
| ✗ | no access — that tier never authors this type |

Click a cell to cycle it and the active lens re-derives immediately. Groups and article types are
addable, removable and renameable from the matrix — renaming changes only the display label, so
every access rule, transition and modifier stays attached — and a further column per modifier controls which
groups can carry it. The ✗/W distinction
matters: "can't self-publish" and "never writes this" produce very different diagrams, and a
two-state matrix hid the difference. A new article type starts ✗ for everyone.

### Three lenses, composable

- **Article by** — writer role: Core Author, Projects Author, Free Writer, AI-Assist Author (add
  your own in the matrix)
- **1Editor** — a modifier a writer carries *on top of* a role, not a role itself. Someone can be
  a Projects Author and 1Editor, or a Free Writer and 1Editor. It stops review at the Copy Editor
  instead of continuing to a Financial Editor. Which roles can carry it is set in the editors
  panel. Left on **Either**, both review depths show
- **Article type** — Shorty, Medium, Article, Duo, News brief, Short MM, Long MM, Influencer,
  Earnings, AI-Assist
- **Highlight roles** — Writers / Copy Editors / Financial Editors / HQ / System, **multi-select**

Role + type answer *where does this article go*. Highlighting roles answers *which of those moves
are whose*. Because roles multi-select, you can light up writers + Copy Editors together to see
the whole handoff chain for a reviewed article, rather than one role at a time.

Both lenses work by receding, not by shouting: what you select stays at full strength and
everything else drops away — states, transitions and labels alike. Highlighting a role leaves
just that role's subgraph legible: the states it acts from, the states it moves articles into,
and the transitions between them. States an article can't reach are dimmed by default — knowing a state exists but is unreachable
tells you something. Tick **Hide instead of dim** to drop them entirely and let the view refit to
just this article's journey. Hiding is tied to reachability only: a transition another role
performs stays visible, because it's still part of the article's path.

### Reference paths

| Role + type | States | Route | Editors |
| --- | --- | --- | --- |
| Core Author + Shorty | 6 | self-publishes, never enters review | 0 |
| Core Author + AI-Assist | 0 | no access — that article doesn't exist | — |
| Projects Author + News brief | 6 | self-publishes | 0 |
| Projects Author + Shorty | 12 | copy edit → financial edit | 2 |
| Projects Author + Shorty + 1Editor | 10 | copy edit only — the Copy Editor finishes it | 1 |
| Free Writer + anything | 12 | copy edit → financial edit | 2 |
| Free Writer + anything + 1Editor | 10 | copy edit only | 1 |
| AI-Assist Author + AI-Assist | 6 | self-publishes | 0 |

**Editors come from two things and nothing else:** the role's access to that article type, and
whether the writer carries 1Editor. Self-published → 0. Otherwise a Copy Editor, then a Financial
Editor — unless 1Editor, which stops at the Copy Editor.

Leaving either selector on **All** widens the union rather than switching the lens off. A
Projects Author across all types reaches all 12 states, because 5 of its 10 types self-publish
and the rest don't, so both forks out of Grammarly Edit Complete are live. An AI-Assist Author
reaches 6: the one type it touches is self-published.

`npm run check` asserts all of these, both role-only and role+type, plus default-deny and the
role subsets.

## Editing

Drag nodes to reposition. Drag between node edges to create a transition. Click any node or edge
to open the inspector, which edits everything the model holds — including per-tier availability
and the self-publish gate. `+ Add state` drops a new node; the matrix's *New article type* adds a
column **denied for every tier** (the "New Type" default-deny rule from the source permissions
table).

### Persistence

The matrix is part of the workflow document, not a separate thing — group and type edits persist
and export alongside the diagram.

`src/data/workflow.seed.json` is the committed source of truth and loads on first run. After
that a localStorage draft (`sanity-workflow:draft:v1`) wins. **Export JSON** downloads the
current document — copy it over the seed and commit to make an edit permanent. **Import JSON**
validates before applying and reports every problem at once. **Reset to seed** discards the
draft.

## Two things to know

**HQ's any-to-any is not drawn.** Free HQ Editors can move an article between any two states — 132
edges that would bury the diagram. It's the `hqOverride` flag, surfaced as a banner when you view
as HQ.

**Two things are still open**, listed in the notes panel and badged in the diagram where they sit
on a state: re-scheduling a published article and who sets the publish date, and whether the
editor who asked for edits is notified when they come back.

**The fall-through routing departs from the source diagram.** The design said *"Only SWUser
articles continue to financial edit"*, which would send a Projects Author's article that can't
self-publish down the one-editor route. That's wrong: confirmed with the team, every writer
continues to a Financial Editor unless they carry 1Editor. The seed follows the corrected rule,
and `npm run check` pins it per role.

## Design system

`public/ds/colors_and_type.css` is a vendored, **trimmed** copy of the Motley Fool design
system's stylesheet. Every token, base type rule and utility class is byte-identical to
upstream; the `@font-face` block is gone and the family tokens point at the system stack.

Satoshi was dropped when the repo went public. The ITF licence plainly permits serving it via
`@font-face`, but is silent on whether a public repo counts as redistributing the file, and the
font's own name table carries an attribution requirement. Not worth the ambiguity for an
internal spec tool — so headings render in the system face and nothing is downloaded.

The file's header records exactly what was removed and why. Re-syncing means re-fetching
upstream and re-applying that trim deliberately, not pasting over it.

No file under `src/` may contain a raw hex colour; every colour resolves through an `--mf-*`
token. `npm run lint:tokens` enforces it.
