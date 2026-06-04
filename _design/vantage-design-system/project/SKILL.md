---
name: vencore-design
description: Use this skill to generate well-branded interfaces and assets for Vencore, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files (`colors_and_type.css`, the `assets/` icons set, the `ui_kits/web/` recreation, and the `preview/` cards that document each token cluster).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy `assets/` out, link `colors_and_type.css`, and create static HTML files for the user to view. The `ui_kits/web/` folder is the highest-fidelity reference — start there when mocking any dashboard view.

If working on production code, the original codebase is at https://github.com/Kavin-Charles/Vencore — the design tokens here are ported from its `apps/web/app/globals.css` and the components are reconstructed from `apps/web/components/`. Read those rules to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design (a marketing page? an internal mock? a new screen for the dashboard?), ask a few questions to scope it (which feature pillar — CRM / Infra / Analytics? which screens? how interactive?), and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
