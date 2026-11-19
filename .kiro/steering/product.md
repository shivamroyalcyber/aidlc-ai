---
inclusion: always
---

# Product

## Overview
`idea-board` is a client-side single-page web app (React + TypeScript + Vite, no backend). The name suggests a board for capturing and organizing ideas.

## Current state
The code in `idea-board/` is still the unmodified Vite + React + TypeScript starter template (`src/App.tsx` is the "Get started" page with a counter). No product features exist yet. Treat any purpose beyond the scope below as unconfirmed until the user defines it.

## Defined scope
The user has requested these features, and only these:
- Add a task.
- Mark a task as done (and back to not done).
- Filter tasks by status: all, done, or not done.

Implementation notes:
- Model a task as a plain object (for example `id`, `text`, `done`) and the filter as a union type (`'all' | 'done' | 'active'`). Use `type`/`interface` and union types, not `enum`.
- Keep state in React (`useState`). Derive the filtered list from state during render instead of storing it separately.
- Ignore empty or whitespace-only task text.

## Guidance for agents
- Do not assume features beyond the defined scope (auth, backend, sharing, voting, editing, deleting, due dates, drag-and-drop, etc.). Ask before adding any.
- Ask for requirements before building substantial new features. A spec (requirements, design, tasks) fits larger features.
- Replace or remove the starter content (`App.tsx` demo, `App.css`, unused assets) when real features land.
- The app has no backend and no persistence, so task data is lost on reload. Raise any persistence or API need (such as `localStorage`) with the user before choosing an approach.
- Keep the UI simple and accessible: use semantic elements, label inputs, and make controls keyboard operable.
