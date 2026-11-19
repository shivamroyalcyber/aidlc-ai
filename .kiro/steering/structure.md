# Structure

The workspace root is `/workshop`. The app lives in `idea-board/`. Run npm commands from that folder.

```
/workshop
├── .kiro/steering/          Steering docs (product, tech, structure)
└── idea-board/
    ├── index.html           Vite entry HTML; mounts #root, loads /src/main.tsx
    ├── vite.config.ts       Vite config (react plugin, proxy base, allowedHosts, HMR)
    ├── eslint.config.js     ESLint flat config
    ├── tsconfig.json        References tsconfig.app.json and tsconfig.node.json
    ├── tsconfig.app.json    Compiler options for src/
    ├── tsconfig.node.json   Compiler options for config files such as vite.config.ts
    ├── package.json
    ├── public/              Static files served as-is (favicon.svg, icons.svg)
    └── src/
        ├── main.tsx         React root; renders <App /> in StrictMode
        ├── App.tsx          Top-level component (currently starter demo)
        ├── App.css          Styles for App
        ├── index.css        Global styles
        └── assets/          Images imported from code (hero.png, react.svg, vite.svg)
```

## Conventions
- Application code goes under `idea-board/src/`. Config files stay at the `idea-board/` root.
- Import images and other assets from `src/assets/` so Vite hashes and bundles them. Use `public/` only for files that need a fixed URL.
- Keep global styles in `index.css` and component styles next to the component (`Component.css`).
- When the app grows, group by feature (for example `src/components/`, `src/hooks/`, `src/types/`). Don't create these folders until there is code to put in them.
- `node_modules/` and `dist/` are generated and ignored. Don't edit them.
