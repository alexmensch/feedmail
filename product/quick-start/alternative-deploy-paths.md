---
guid: 5D3610BF-55EA-4380-82B4-FBCAA8AD7CF9
date: 2026-03-10
feature: alternative-deploy-paths
---

## Feature: Alternative Deploy Paths

Evaluate and potentially implement alternative deployment experiences beyond the primary setup script (one-line-deploy), to lower the barrier to entry for users who prefer browser-based or CI-driven workflows over running a shell script locally.

---

## Context

The one-line-deploy feature (`F39F0C1C-64AC-4F37-AB29-DD16D53307F3`) establishes a hardened shell script as the primary onboarding path. The approaches below were identified during roadmap planning as potential alternatives that could reach different user segments or reduce friction further. They should be evaluated after one-line-deploy ships and real user feedback is available.

---

## Approaches Under Consideration

1. **Cloudflare Deploy Button** — One-click browser-based deploy from GitHub. No CLI required. Cloudflare supports "Deploy to Workers" buttons that can provision workers directly. Lowest friction option for new users. Known limitation: cannot deploy multiple Workers together in a single button (each needs a separate button), and does not support service bindings between workers in a single deployment. May require a custom wrapper for feedmail's two-worker architecture.

2. **GitHub template repository with Actions deploys** — Users fork a template repo, fill in configuration, and GitHub Actions handles deployment. Common pattern in the SSG ecosystem. Worth investigating whether this pattern supports clean updates from the source repo (e.g., via upstream merges).

---

## Next Step

Run this feature through `define-feature` to evaluate approaches, define requirements, and produce a full specification. Should be informed by real user feedback from the one-line-deploy experience.
