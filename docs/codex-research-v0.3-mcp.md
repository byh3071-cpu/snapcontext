# Role
You are a research engineer fluent in Cloudflare Workers, the Model Context Protocol
(MCP), and Chrome MV3 extension architecture. Before we start implementing v0.3 of the
project below, perform a technical research pass to lock down the design.
**Do not write implementation code — gather the evidence needed to make decisions.**

# Background
- Product: SnapContext — a Chrome/Whale extension (Manifest V3, TypeScript, Vite +
  @crxjs). It captures screenshots plus context (URL, viewport, pin annotations, notes)
  and packages them into a "Context Pack" JSON.
- v0.2 (done): an anonymous-sharing backend built on a Cloudflare Worker + R2 is already
  deployed in production.
- v0.3 goal: turn SnapContext into "an agent's browser perception layer" — i.e., let
  agents like Claude/Cursor query captured Context Packs directly over MCP.

# Decisions already made (NOT up for re-litigation — push back only if you find a fatal flaw)
1. Transport = Option B: stand up the **Cloudflare Worker as a remote (HTTP) MCP server**.
   (The Native Messaging local-app approach is rejected.)
2. Storage = **Turso deferred**. Start with R2 (already in place) + a lightweight JSON index.
3. **Pro gating / paid auth deferred**. Single developer + dogfooding stage, so avoid
   over-engineering.
4. Four MCP tools planned: snap_capture · snap_analyze · snap_history · snap_pack
5. Definition of Done (DoD): from Claude/Cursor, actually call `snap_history` and
   `snap_pack` and get a Context Pack JSON back.

# Research questions (in priority order)

## A. Remote MCP server on Cloudflare Workers [P0]
- As of 2025–2026, what is the current standard remote transport for MCP? (Among stdio /
  SSE / Streamable HTTP — which is the current recommendation and which is deprecated?
  State the dates.)
- State of Cloudflare's official remote-MCP support: the `agents` SDK `McpAgent`,
  `workers-mcp`, `workers-oauth-provider`, etc. — which is the currently recommended stack?
- What is the minimal setup (boilerplate level) to run an MCP server on a Worker?

## B. MCP client compatibility [P0] — directly tied to the DoD
- Can Claude Desktop / Claude Code / Cursor each connect to a **remote HTTP MCP server
  natively**, or do they need a bridge like `mcp-remote`? (Current state + setup per client.)
- Provide the actual MCP server registration config (JSON, etc.) for each client in its
  real format.

## C. The structural problem with snap_capture [P0] — most important
- A remote Worker cannot directly control the extension in the user's browser. Yet
  `snap_capture` means "capture the current browser tab right now."
- Does a pattern exist for a remote MCP server to trigger an action in the client (the
  browser extension)? (long-polling / job queue / WebSocket / Durable Objects, etc.)
  Assess feasibility and complexity.
- Conclusion: is it sound to include snap_capture in the v0.3 MVP, or should we focus on
  "reading already-stored packs" (snap_history · snap_pack) and defer capture? Give a
  recommendation.

## D. R2 vs KV vs D1 — the metadata index [P1]
- The premise is "R2 JSON index, no Turso," but at single-developer scale, for listing
  and querying capture history, which is actually simplest/cheapest/most fitting among
  R2 (objects + list) / Workers KV / D1 (SQLite)?
- Compare each option's free-tier limits, consistency, and query/list constraints in a
  table, and recommend one.

## E. Extension ↔ Worker data ingestion & auth [P1]
- Path for the MV3 extension to put a captured Context Pack into R2/the index: extension
  PUTs to R2 directly (presigned URL / S3 API + aws4fetch) vs going through a Worker
  endpoint — which is simpler and safer?
- We're skipping paid auth, but for the remote MCP server to return "only my data," we
  still need some minimal identity/secret (e.g., a bearer token). What's the minimal auth
  approach appropriate for the single-developer stage?

## F. Cost/limits sanity check [P2]
- Verify the understanding that the Workers free tier is counted **per account** (e.g.,
  100K req/day), with current numbers. Also verify the overage/billing structure (e.g.,
  $5/mo) against current values. (Cite sources + dates.)

# Constraints / assumptions
- Single developer, free-tier first, goal of $0 fixed external cost.
- Target clients: Claude Desktop/Code + Cursor.
- Reuse the existing stack first (Worker + R2 already running). Introduce new
  infrastructure only with a justified reason.

# Deliverable format
**Write the entire final report in Korean** (you may research/think in English, but the
output must be Korean). Keep proper nouns, product names, API names, and code/config in
their original form.
1. **TL;DR recommendations** — a one-line "do this" conclusion for each of A–F.
2. Detailed rationale per question + trade-off tables.
3. **Recommended final architecture** diagram (text/mermaid): extension → ingestion →
   R2/index → Worker MCP → client, the data flow on one page.
4. **Proposed v0.3 MVP scope re-definition**: of the 4 tools, which go in the MVP and
   which are deferred, with reasons.
5. **Open issues / risk list**.

# Notes
- The MCP spec and Cloudflare's MCP support changed rapidly during 2025. **Attach a source
  link and date to every key claim, and separately verify whether anything older than a
  year is still current.**
- Clearly distinguish speculation from verified fact.
- Do not write implementation code. Keep boilerplate at the "structural example" level only.
