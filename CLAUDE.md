# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies (requires access to `@quilltap/plugin-types` and `@quilltap/plugin-utils` as peer deps)
- `npm run build` — bundle with esbuild to `dist/index.js`
- `npm run clean` — remove `dist/`

There is no test suite and no lint script. `tsconfig.json` has `noEmit: true` — type-checking is implicit in the esbuild step; to type-check without bundling, run `npx tsc --noEmit`.

## Architecture

This is a Quilltap provider plugin. It is loaded by the Quilltap server via `require('dist/index.js')` and must export a `TextProviderPlugin` as default. There is no server of its own — the plugin is pure adapter code that the Quilltap host invokes.

**Three source files, one bundle:**

- `index.ts` — plugin descriptor (`metadata`, `capabilities`, `getModelInfo`, tool-format adapters). Wires `createProvider` / `createImageProvider` factories. The static model list in `getModelInfo()` is the source of truth for context windows / vision flags shown in the UI; `getAvailableModels()` also calls the Z.AI `/models` endpoint at runtime.
- `provider.ts` (`ZAIProvider`) — chat + streaming. Uses the `openai` SDK pointed at `https://api.z.ai/api/paas/v4` (Z.AI is OpenAI-compatible Chat Completions, **not** Responses API). Handles message formatting, vision attachments (URL or base64 `image_url` parts), tool-call accumulation across stream chunks, and z.ai's quirk of sometimes returning `tool_calls[].function.arguments` as an object instead of a JSON string (normalized in `sendMessage`).
- `image-provider.ts` (`ZAIImageProvider`) — CogView-4 / GLM-Image via `/images/generations`. Returns URLs (valid ~30 days) or base64.

**Web search** is Z.AI-specific: when `params.webSearchEnabled` is true, `buildWebSearchTool()` prepends a `{ type: 'web_search', web_search: { enable: 'True', ... } }` entry to the `tools` array. This is *not* an OpenAI function tool — it coexists with them. The host never defines a `web_search` function itself.

**Vision gating** happens in `formatMessages` via `isVisionModel()` (regex on model ID). Non-vision models with attachments push an entry into `attachmentResults.failed` rather than throwing, so the UI can surface per-attachment errors.

## Build / packaging constraints

- `esbuild.config.mjs` must emit `format: 'cjs'` — IIFE output will not load in the Quilltap host. Node built-ins and host-provided libs (`react`, `next`, `zod`, etc.) are marked external; the `openai` SDK **is** bundled in.
- `manifest.json` `capabilities` must be `["LLM_PROVIDER", "IMAGE_PROVIDER"]`. Provider-level feature flags (chat / imageGeneration / embeddings / webSearch) live under `providerConfig.capabilities`.
- `package.json` `main` points at `dist/index.js`; only `dist` and `manifest.json` are published.

## Reference material

Reference plugins live in the sibling repo at `~/source/quilltap-server/plugins/dist/`. The closest structural analog is `qtap-plugin-grok` (also OpenAI SDK + vision + image gen + web search), but **Grok uses the Responses API and Z.AI uses Chat Completions** — don't copy Grok's request shape wholesale. Provider plugin contract: `~/source/quilltap-server/docs/developer/PROVIDER_PLUGIN_DEVELOPMENT.md`.
