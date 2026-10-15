# Quick Task 261015-rrv: docs: add AGENTS.md with Codex review calibration

## Goal
Add `AGENTS.md` at repo root with a one-line context heading and the standard "## Review calibration" block (verbatim from `regiekamer/_regie/opdrachten/2026-10-15-codex-reviewrichtlijnen.md`), so Codex reviews this repo with the agreed calibration.

## Tasks
1. Create `AGENTS.md`: heading line + standard block, no other content.
2. Verify the block is byte-identical to the source block (`diff`), run `npm run test:manifests`.
3. Commit, push, open PR titled "docs: add AGENTS.md with Codex review calibration" with `Fase: quick` in the body.

## must_haves
- AGENTS.md exists at repo root, first line is the context heading, block matches the source verbatim
- No code or `.planning/` changes beyond this quick task directory and the STATE.md row
