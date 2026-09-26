# Component provenance

This project uses the actual requested libraries. It does not redraw their effects.

- **Vanta NET**: npm `vanta@0.5.24`, `three@0.134.0`. Loaded only on the landing page. Monochrome settings and reduced-motion handling live in `src/components/Net.jsx`. Source: https://github.com/tengbao/vanta . MIT.
- **Thinking Orbs**: npm `thinking-orbs@0.3.2` by Jakub Antalik. Imported directly for onboarding, listening, working, and sleep states. https://github.com/Jakubantalik/thinking-orbs . MIT.
- **Beautiful UI**: all 21 published Copy Code components from https://www.beautifului.dev/ are preserved under `vendor/beautiful-ui/`. The compiled JavaScript adaptations are under `src/vendor/beautiful/`. `scripts/vendor.mjs` strips TypeScript syntax and changes dependency paths. It also gives TaskRows static `idle` and `paused` step states, since upstream rows that are neither done nor running play a gallery local sequence. The application's composer, task rows, and loading state use these implementations. All components can be inspected in Settings > Component library. Unpublished supporting atoms use local adapters; the Central Icons dependency uses equivalent Lucide icons. Gallery content and its simulated interactions are upstream examples, not user data. No license has been inferred beyond the site's public copy-code affordance; review distribution terms before a commercial release.
- **Evil Charts**: the requested ECharts bar implementation and its dependencies are copied from https://github.com/legions-developer/evilcharts . Original source and license remain under `vendor/evilcharts/`; compiled JS is under `src/vendor/evilcharts/`. The Sleep page uses the real chart, not a CSS imitation. All variants remain available in the source API.
- **Instrument Serif**: Google Fonts, SIL Open Font License. The exact regular and italic files are self-hosted under `public/fonts/`, with OFL.txt. The Offload wordmark uses outlined Instrument Serif letters. Body typography uses the same Avenir Next system font on macOS, with system fallbacks elsewhere.
- **Lucide**: lucide-react, ISC license. Application navigation and action icons.

Original files remain separate from adaptations so teammates can compare and update them.

The September 26 UI update uses the published Sidebar Nav and Streaming Text components for the working application, with controlled navigation, model selection, actual response text, and copy actions. Prompt Bar's account and microphone placeholders are disabled until implemented. Source changes are present in both the TSX originals and compiled JavaScript. The app interface uses the reference's Inter font from https://www.beautifului.dev/_next/static/media/e4af272ccee01ff0-s.p.woff2 with its SIL license in `public/fonts/Inter-OFL.txt`. The landing page and logo retain Instrument Serif and Avenir Next.

Connection logo provenance is recorded in `public/connections/SOURCES.md`.
