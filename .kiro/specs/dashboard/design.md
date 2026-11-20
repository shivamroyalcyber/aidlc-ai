# Design: U5 Dashboard

## Files (`bridgex/dashboard/`)
| File | Content |
|---|---|
| `index.html` | Header with connection form, tab list, five panels |
| `styles.css` | CSS variables, cards, tables, four-column flow view, dark code blocks |
| `app.js` | ES module: `api(path, opts)` wrapper, tab switching, one `render*` function per panel, 5 s polling for the Overview |
| `config.json` | Written at deploy by CDK (`{"apiUrl": "..."}`); served by the local server in development |

## Data flow
All data comes from the admin API (contract section 1). The Playground calls the integration route directly, reads `x-bridgex-request-id` from the response (exposed through CORS) and then loads `/admin/requests/{id}` for the flow view.

## Safety
Every value from the API goes through `textContent` or `document.createTextNode`. The only `innerHTML` use is static markup with no data.
