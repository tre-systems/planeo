# Diagrams

Graphviz / DOT sources plus rendered PNGs. The `.dot` files are the source of
truth; the PNGs are committed for in-browser viewing on GitHub. Complex diagrams
live here as Graphviz; small ones live inline as Mermaid in the prose docs.

## Files

| Diagram                | Source                   | Rendered                 |
| ---------------------- | ------------------------ | ------------------------ |
| System overview        | `system-overview.dot`    | `system-overview.png`    |
| Real-time data flow    | `realtime-data-flow.dot` | `realtime-data-flow.png` |
| AI agent decision loop | `ai-agent-loop.dot`      | `ai-agent-loop.png`      |

## Conventions

Color coding by domain:

- **Blue** — the browser client (3D scene, stores, hooks) and external APIs.
- **Green** — server-side code (the Next.js app / server actions).
- **Teal** — the EventHub Durable Object (the shared-world authority).
- **Diamonds** — decisions. **Bold green outline** — a terminal render/output.

Fonts: Avenir. Rendered at 220 DPI.

## Render

```
npm run diagrams          # render all .dot files to PNG next to the source
npm run check:diagrams    # verify each .dot renders cleanly and the PNG exists
```

Both scripts assume Graphviz is on PATH (`brew install graphviz`). CI installs
Graphviz before `npm run verify` (which runs `check:diagrams`). On a machine
without `dot`, `check:diagrams` skips with a clear message — refresh the PNGs
with `npm run diagrams` before committing diagram changes.

To render one manually:

```
dot -Tpng:cairo docs/diagrams/<name>.dot -Gdpi=220 -o docs/diagrams/<name>.png
```
