
## 82.7.1-02 build observation

- `npm run build` fails at prerender of `/favicon.ico` route with
  `Error: No response is returned from route handler '...favicon--route-entry.js'`.
- Pre-existing on the working tree before Plan 02 changes (the favicon route
  is unrelated to `_shell/row-list.tsx`).
- Out of scope for E-02. Logged here per executor scope-boundary rule.
