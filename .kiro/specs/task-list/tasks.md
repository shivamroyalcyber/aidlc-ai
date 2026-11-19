# Implementation Plan: Task List

## Overview

Build the task list in `idea-board/src/` in this order: pure types and helpers in `task.ts`, leaf components, `App` wiring, the Clear all button in `App`, starter cleanup, then lint and build. Clear all adds no new file or helper (see `design.md`). The plan follows `design.md` as written, including the provisional decisions (append new tasks at the bottom, trimmed text, new task hidden under a non-matching filter, buttons with `aria-pressed`, message "No tasks to show.", no persistence) and the `retained` mechanism (`App` state `retained`, `filterTasks(tasks, filter, retained)`). The BRD puts automated tests out of scope, so there are no test tasks. Run all npm commands from `idea-board/`. Add no dependencies. Use `import type` for type-only imports and union types instead of enums.

## Tasks

- [x] 1. Create types and pure helpers in `task.ts`
  - [x] 1.1 Write `idea-board/src/task.ts`
    - Export `Task` (`id`, `text`, `done`), `Filter` (`'all' | 'done' | 'active'`), and `FILTER_OPTIONS` (All, Done, Not done)
    - Export `addTask(tasks, text, id)`: ignore blank text (return the input list), otherwise append a not-done task with trimmed text
    - Export `toggleTask(tasks, id)`: flip `done` on one task and keep order
    - Export `filterTasks(tasks, filter, retained)`: `'all'` returns every task. Otherwise return tasks matching by `done` plus tasks whose id is in `retained`, in original order
    - No React imports. Do not mutate inputs
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 3.3, 3.4, 3.6, 4.3, 4.4, 4.5, 4.7, 4.8, 7.2_

- [x] 2. Build the `TaskItem` component
  - [x] 2.1 Write `TaskItem.tsx` and `TaskItem.css`
    - Props `{ task: Task; onToggle: (id: string) => void }`, with `import type { Task } from './task.ts'`
    - Render `<li>` with `<input type="checkbox" id>` checked from `task.done`, and a `<label htmlFor>` holding the task text
    - Style done text with `line-through` and a muted color
    - Default-export the component and export nothing else
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 6.3, 6.4, 7.2_

- [x] 3. Build the `TaskForm` component
  - [x] 3.1 Write `TaskForm.tsx`
    - Props `{ onAdd: (text: string) => void }`. Hold the draft text in `useState`
    - Render a `<form>` with a `<label htmlFor>` bound to a text input and a `type="submit"` Add button, so Enter submits natively
    - On submit, call `preventDefault`. If the draft is blank, do nothing and keep the draft. Otherwise call `onAdd` and clear the draft
    - Default-export the component and export nothing else
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 6.1, 6.4, 7.2_

- [x] 4. Build the `StatusFilter` component
  - [x] 4.1 Write `StatusFilter.tsx` and `StatusFilter.css`
    - Props `{ value: Filter; onChange: (f: Filter) => void }`
    - Render `<div role="group" aria-label="Filter tasks">` with one `<button type="button" aria-pressed>` per entry in `FILTER_OPTIONS`
    - Style the active button so it differs without relying on color alone (for example bold text plus an outline)
    - Default-export the component and export nothing else
    - _Requirements: 4.1, 4.6, 6.4, 6.5, 7.2_

- [x] 5. Build the `TaskList` component
  - [x] 5.1 Write `TaskList.tsx`
    - Props `{ tasks: Task[]; onToggle: (id: string) => void }`
    - When `tasks` is empty, render `<p>No tasks to show.</p>`. Otherwise render a `<ul>` of `TaskItem`, keyed by `task.id`
    - Default-export the component and export nothing else
    - _Requirements: 3.1, 5.1, 5.2, 6.2, 7.2_

- [x] 6. Wire everything together in `App`
  - [x] 6.1 Replace `App.tsx` and `App.css`
    - Rewrite `idea-board/src/App.tsx` to hold `tasks`, `filter` (initial `'all'`) and `retained` (initial `[]`) in `useState`
    - Derive `visibleTasks = filterTasks(tasks, filter, retained)` during render, with no stored copy
    - Add handler: call `crypto.randomUUID()` in the handler, then `setTasks(addTask(...))`. Leave `filter` and `retained` untouched
    - Toggle handler: `setTasks(toggleTask(...))` and add the id to `retained` if absent
    - Filter handler: `setFilter(value)` and `setRetained([])`, including when the current option is reselected
    - Render a heading, `TaskForm`, `StatusFilter`, and `TaskList`. Keep the default export
    - Replace `App.css` contents with layout styles for the new page only
    - _Requirements: 1.3, 1.5, 3.6, 4.2, 4.7, 4.8, 7.1, 7.2, 7.3_

- [ ] 7. Add the Clear all button
  - [ ] 7.1 Add Clear all to `App.tsx`
    - Render `<button type="button" disabled={tasks.length === 0}>Clear all</button>` between `StatusFilter` and `TaskList`
    - Handler: `if (window.confirm('Clear all tasks?')) { setTasks([]); setRetained([]) }`. Leave `filter` and the `TaskForm` draft untouched
    - Add any styling needed to `App.css`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

- [x] 8. Remove starter content
  - [x] 8.1 Delete unused starter files and rules
    - Confirm `App.tsx` no longer imports from `./assets/` or references `/icons.svg`
    - Delete `idea-board/public/icons.svg` and the unused `idea-board/src/assets/hero.png`, `react.svg`, `vite.svg`
    - Keep `idea-board/public/favicon.svg`, which `index.html` still references
    - Remove starter-only rules from `idea-board/src/index.css` (keep global resets and base styles the new UI uses)
    - Run `grep` for `icons.svg` and `assets/` under `idea-board/src/` and `index.html` to confirm no dangling references
    - _Requirements: 7.3, 7.4, 7.5_

- [ ] 9. Lint and build
  - [ ] 9.1 Run `npm run lint` and `npm run build` in `idea-board/`
    - Fix every error and warning reported (unused locals, `react-hooks` and `react-refresh` rules, `verbatimModuleSyntax`) without disabling rules
    - Re-run both commands until each exits cleanly
    - Do not start the dev server from the agent
    - _Requirements: 7.2, 7.4, 7.6_

- [~] 10. Final checkpoint - manual browser checks (for the user)
  - An agent cannot verify these. Start `npm run dev` from `idea-board/` and open `/absproxy/5173/` on the CloudFront host
  - Add a task with the Add button, and another with Enter. Check the input clears each time
  - Submit an empty and a whitespace-only entry. Check no task appears and the input is unchanged
  - Toggle tasks done and not done. Check the checkbox state and the strikethrough style
  - Under Done and under Not done, toggle a task. Check it stays visible and focus stays on its checkbox. Reselect a filter and check the task leaves if it no longer matches
  - Check All, Done, and Not done each show the right tasks, and the active option is visibly marked
  - Check "No tasks to show." appears when nothing matches and disappears when something does
  - Use the whole page with the keyboard only, and spot-check checkbox and input labels with a screen reader
  - Clear all: check the button is disabled with no tasks. With tasks, press it and cancel, and check nothing changes. Press it and confirm, and check the list empties and "No tasks to show." appears
  - Before clearing, set the filter to Done and type text in the input. After confirming, check the filter and the typed text are unchanged
  - Toggle a task under Done, clear all, add new tasks, and check none appear as stale retained tasks
  - Reach and activate Clear all with the keyboard only
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 3.2, 3.3, 3.5, 3.6, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.1, 5.2, 6.1, 6.3, 6.4, 6.5, 6.6, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

## Notes

- No test tasks exist because automated tests and a test framework are out of scope per the BRD.
- Provisional decisions in `design.md` stay as written until the user answers the open questions. Changing one affects only the file named in the design table.
- Task 10 is for the user to run and report back on.
- Tasks 1 to 6 and 8 were completed before Clear all was added. Task 7.1 and the Clear all checks in task 10 are the new work, and 9.1 is open again so lint and build re-run after it.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["5.1"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["9.1"] }
  ]
}
```
