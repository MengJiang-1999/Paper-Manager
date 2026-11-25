# PaperManager (Paper Reading)

A minimalist, PDF-first macOS desktop paper manager designed around the real pain points of reading academic papers.

## Why PaperManager?

In the era of AI agents, agents can help us read and digest papers faster than ever — yet what is read effortlessly is also forgotten just as quickly. **PaperManager** was built with one core mission: **a distraction-free paper manager designed to prevent forgetting.** By pairing every local PDF with a reader-written, one-line takeaway surfaced directly in your library, you can scan an entire folder of papers and instantly recall what each work actually did.

> **初衷**：在 Agent 时代，AI 可以帮我们以前所未有的速度阅读论文，但读得越快，遗忘得也越快。**PaperManager** 的初衷正是做一个极简的论文管理工具，专注于**对抗遗忘**——让每一篇读过的论文都沉淀为一句由你自己写下的核心总结，随时翻看，一眼记起。

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
