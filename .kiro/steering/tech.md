# Tech

## Stack
- React 19 with function components and hooks
- TypeScript 6 (strict-leaning, see below)
- Vite 8 with `@vitejs/plugin-react`
- ESLint 10 flat config (`typescript-eslint`, `react-hooks`, `react-refresh`)
- npm (`package-lock.json`). ES modules (`"type": "module"`).
- No test framework, router, state library, or CSS framework is installed. Don't add one without asking.

## Commands (run from `idea-board/`)
- `npm run dev`: start the dev server on port 5173. It is long-running, so start it as a background process.
- `npm run build`: `tsc -b && vite build`. This is the type check plus production build.
- `npm run lint`: `eslint .`
- `npm run preview`: serve the production build.

## TypeScript rules (`tsconfig.app.json`)
- `verbatimModuleSyntax`: use `import type { ... }` for type-only imports.
- `erasableSyntaxOnly`: no `enum`, `namespace`, or constructor parameter properties. Use union types and plain objects.
- `noUnusedLocals` and `noUnusedParameters` are on.
- `allowImportingTsExtensions`: relative imports may include `.ts`/`.tsx`, as in `import App from './App.tsx'`.
- Target ES2023. `types` is limited to `vite/client`.

## Dev environment: IDE CloudFront proxy
The dev server is opened through the IDE's CloudFront proxy, and `vite.config.ts` is set up for that:
- `base: '/absproxy/5173/'`. The page URL is `https://<cloudfront-host>/absproxy/5173/`. `/proxy/5173/` does not work, because it strips the prefix and Vite then redirects in a loop.
- `server.allowedHosts` lists the CloudFront host. Update it if the domain changes (see `VSCODE_PROXY_URI`).
- `server.hmr` uses `clientPort: 443` and `protocol: 'wss'`.
- Because of `base`, reference public assets in a way that respects it. Use `import.meta.env.BASE_URL` or import the asset from `src/`. Root-absolute paths such as `/icons.svg` in `App.tsx` ignore `base` in JSX attributes and will break.
- If the app is deployed outside this proxy, revisit `base` and `hmr`.

## Conventions
- Default-export the top-level component of a file. Keep one component per file once the app grows.
- Satisfy the `react-refresh` rule: component files export only components.
- Follow the `react-hooks` lint rules. Don't disable them to silence warnings.
- Run `npm run lint` and `npm run build` after changes, and fix errors before finishing.
- Don't commit secrets. Client-side env vars must use the `VITE_` prefix, and they are public.
