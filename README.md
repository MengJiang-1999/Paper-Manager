# PaperManager (Paper Reading)

A minimalist, PDF-first macOS desktop paper manager designed around the real pain points of reading academic papers.

## Features

- **PDF-First Local Folder Mapping**: Mount any local folder on disk (subfolders = categories). Dropping PDFs into Finder or moving papers between folders stays in live sync via filesystem watching — no database lock-in.
- **Unread / Read Workflow + One-Line Takeaway**: New PDFs start as **Unread**. After reading (double-click any row to open in your default macOS PDF reader), write a concise **one-line / short-paragraph takeaway** to mark as **Read** — displayed prominently in the list so you never forget what a paper did.
- **Acronym + Full Title + Team + Tags**: Automatically extracts Page-1 PDF text, arXiv IDs, and DOIs to recover canonical full paper titles, acronyms (e.g. `ACON`, `FoldGRPO`, `SE-Agent`), research teams/affiliations, authors, and venues. Metadata is stored cleanly in a hidden `.folio-meta.json` inside your papers folder.
- **Smart Grouping & Sorting**: Always keeps **Unread** above **Read**, with per-group sorting by **Date Added**, **Year Published**, or **Name** (ascending/descending).
- **Native macOS Context Menus**: Right-click folders to create subfolders, import PDFs, rename, reveal in Finder, or move to Trash; right-click any paper for quick actions.
- **Optional LLM Support (`.env`, Off by Default)**: Configure any OpenAI-compatible API via `.env` (or in-app Settings) to manually fill missing metadata on incomplete papers only — zero background token usage.
- **Rigorous Citation Export with VS Code-Style Diff**: Select papers, edit BibTeX directly, optionally run a customizable LLM audit with inline-editable side-by-side Diff, check real-time missing fields (`author`, `address`, `pages`, etc.), and export to **BibTeX (`.bib`)**, **GB/T 7714-2015**, **IEEE**, or **APA 7th**.
- **Bilingual UI**: Switch between **简体中文** and **English** in Settings.

## Quick Start

Requires [Bun](https://bun.sh/) on macOS.

```bash
# Install dependencies
bun install

# Build and launch desktop app
bun run start

# Development mode (hot reload)
bun run dev
```

## Optional LLM Setup

LLM features are disabled by default. To enable them, either:
1. Open **Settings & LLM (.env)** (`⌘,`) inside the app, or
2. Copy `.env.example` to `.env` and fill in your OpenAI-compatible `LLM_API_BASE`, `LLM_API_KEY`, and `LLM_MODEL`.
