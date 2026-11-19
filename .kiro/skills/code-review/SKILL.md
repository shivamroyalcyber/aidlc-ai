---
name: code-review
description: Review .ts and .tsx files in the idea-board project (under idea-board/src/) for typed props, export conventions, error handling on async calls, and accessibility (labels, ARIA, semantic HTML), and report Critical, Warnings, Suggestions, and Passed, with every finding citing its file and line. Use it whenever the user asks to review, audit, check, or critique a .ts or .tsx file in this project, including "is this component OK", pre-merge checks, and questions about prop typing or accessibility in one of these files, even if they don't say "code review". Do not use it for other file types (.css, .js, .json, .md, .html), files outside this project, or requests to write or fix code.
---

# Code review for React and TypeScript files

Review one `.ts` or `.tsx` file in this project (or each such file the user names) against four areas and report findings in a fixed format. This is a review only: do not edit the file unless the user asks for fixes afterwards.

If the user names a file of another type, or a file outside `idea-board/`, say that this skill doesn't cover it and stop. If the user describes the file without naming it ("the component that renders the list"), find it under `idea-board/src/` and state which file you chose.

## Before reviewing

1. Read the whole file. Note line numbers, because every finding must cite one.
2. Read `.kiro/steering/tech.md` and `.kiro/steering/product.md` if they exist. Project rules there override the defaults below. Say which rule you applied when it changes a verdict.
3. Read the files the target imports types or props from, when a verdict depends on them (for example a `Task` type from `./task.ts`). Don't review those files, only use them as context.
4. Check `tsconfig` for `strict` or `noImplicitAny`. If neither is on, untyped parameters compile silently as `any`, so the review must catch them by reading. That is the case in this project.

## What to check

### 1. Typed props

- Every component's props have an explicit type: a `type` or `interface` that is named or inline, used in the parameter annotation.
- **Critical:** props typed as `any`, or untyped props when `noImplicitAny` is off (they become `any` without an error).
- **Warning:** `any` or `Function` inside a prop type, callbacks typed loosely (`(...args: any[]) => any`), `children` used but not declared, a non-null assertion (`!`) on a prop.
- **Suggestion:** prop type duplicated where a shared type exists, `React.FC` used only to type props (a plain annotated function is clearer), optional props without a default.
- Type-only imports must use `import type` when `verbatimModuleSyntax` is on. Otherwise the build fails, so this is **Critical**.
- `enum` and `namespace` fail with `erasableSyntaxOnly`, so they are **Critical** when it is on.

### 2. Exports

This project default-exports the top-level component of each file (`tech.md`), and the `react-refresh` lint rule requires component files to export only components. Apply that convention:

- **Pass:** one component per file, default-exported, with a name (`export default function TaskForm` or `function TaskItem` plus `export default TaskItem`).
- **Warning:** a component file that also exports non-components such as constants, helpers or types. This breaks fast refresh. Move them to a `.ts` file.
- **Warning:** an anonymous default export (`export default () => ...`), because it shows up unnamed in React DevTools and stack traces.
- **Suggestion:** more than one component in a file, once the app has grown past the starter stage.
- In `.ts` helper and type files, expect **named** exports. A default export there is a **Suggestion** to change.
- If no steering file exists, prefer named exports for helpers and one named or default component per file, and say that you assumed this.

### 3. Error handling on async calls

Look for `await`, `.then(`, `fetch(`, `async` functions, `Promise`, timers, and any call that can throw (`JSON.parse`, `crypto.randomUUID` outside a secure context, `localStorage`).

- **Critical:** an `await` or promise with no `try`/`catch` and no `.catch`, whose rejection would go unhandled. An `async` function passed directly to `useEffect` (it returns a promise, not a cleanup).
- **Warning:**
  - A `catch` that swallows the error silently, or only logs it, when the user needs to know.
  - No loading or error state rendered for a request.
  - State set after the component may have unmounted, with no `AbortController` or ignore flag.
  - A request in an effect with no abort on cleanup.
  - `JSON.parse` on stored or fetched data without `try`/`catch`.
- **Suggestion:** a generic error message where the cause is known, or a missing retry path.
- If the file has no async code and no throwing calls, list "Async error handling: no async calls in this file" under Passed. Don't invent findings.

### 4. Accessibility

- **Critical:**
  - A form control with no accessible name: no `<label htmlFor>`, no wrapping label, no `aria-label` or `aria-labelledby`.
  - An icon-only button with no `aria-label`.
  - An `<img>` with no `alt`.
  - A clickable `div` or `span` with `onClick` but no role, `tabIndex` and key handler. Use a `<button>` instead.
- **Warning:**
  - A `<button>` inside a `<form>` with no `type`, which defaults to submit.
  - A toggle or selected state shown by color or class only, with no `aria-pressed`, `aria-checked`, `aria-selected` or `aria-current`.
  - Lists rendered without `<ul>`, `<ol>` or `<li>`.
  - Skipped heading levels.
  - Positive `tabIndex`.
  - `aria-hidden` on focusable content.
  - Dynamic status or error text with no live region where the user needs to hear it.
  - `role` duplicating a native element (`<button role="button">`).
- **Suggestion:**
  - An `aria-label` that repeats visible text.
  - `alt` text that repeats the filename.
  - A missing `<main>` or landmark on a page-level component.
  - Focus not managed after an element the user activated disappears.
- Prefer native semantics over ARIA. A finding that adds ARIA where a native element would do is itself a Suggestion to switch.

## Rules for findings

- Every finding under Critical, Warnings, and Suggestions MUST start with its location as `` `<path>:<line>` ``. The path is relative to the workspace root, such as `idea-board/src/TaskList.tsx:11`. Never use a bare filename, a line-free path, or "N/A".
  - Use a range (`idea-board/src/App.tsx:16-19`) when the problem spans several lines.
  - Use the line of the relevant declaration when the problem concerns a whole component or file. For example, an export problem cites the `export` line.
  - When a problem concerns something missing, cite the line where it should go and say so. For example, cite the `<input>` line for a missing label.
  - Take line numbers from the file as read, not from memory. Re-read the lines before reporting if the file may have changed.
  - If the same problem occurs on several lines, list each location in one finding: `` `idea-board/src/A.tsx:12`, `idea-board/src/A.tsx:30` ``.
- Quote the offending code in one short line after the location.
- Each finding says what is wrong, why it matters (the concrete effect: build error, unhandled rejection, screen reader announces "button" with no name), and the fix.
- Put each problem under exactly one severity, the highest that applies.
- Don't report things the linter or compiler already rejects, unless the project config turns that check off.
- Don't pad. An empty section says "None."
- Under Passed, list each of the four areas that had no Critical or Warning finding, with a short note on what you checked and the line it is on (for example "Typed props: `TaskFormProps` at `idea-board/src/TaskForm.tsx:4` declares `onAdd: (text: string) => void`").

## Output format

ALWAYS use this exact structure:

```markdown
# Code review: <file path>

<One sentence: overall verdict and the count of Critical and Warning findings.>

## Critical
- `<path>:<line>` **<Area>: <short title>.** <What is wrong and why it matters.> Fix: <change>.

## Warnings
- `<path>:<line>` **<Area>: <short title>.** <What and why.> Fix: <change>.

## Suggestions
- `<path>:<line>` **<Area>: <short title>.** <What and why.> Fix: <change>.

## Passed
- **<Area>:** <what was checked and found fine>.
```

`<Area>` is one of: Typed props, Exports, Async error handling, Accessibility.

When the user names several files, repeat the whole structure once per file, then add a final `## Across files` section only if the same problem recurs.

## Example

Input: `idea-board/src/TaskForm.tsx` with `function TaskForm({ onAdd }: { onAdd: (t: string) => void })`, an `<input>` with no label, and `<button>Add</button>` inside a `<form>`.

Output (excerpt):

```markdown
## Critical
- `idea-board/src/TaskForm.tsx:14` **Accessibility: input has no accessible name.** `<input value={draft} …/>` has no label, so a screen reader announces only "edit text". Fix: add `<label htmlFor="new-task">Task</label>` and `id="new-task"` on the input.

## Warnings
- `idea-board/src/TaskForm.tsx:16` **Accessibility: button type not set.** `<button>Add</button>` defaults to `type="submit"`. That works here, but the intent is implicit and breaks if another button is added. Fix: add `type="submit"`.

## Passed
- **Typed props:** `onAdd` is typed `(t: string) => void` at `idea-board/src/TaskForm.tsx:3`.
- **Async error handling:** no async calls in this file.
```
