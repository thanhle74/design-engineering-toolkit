# Example `det build` config (issue #28 C1)

One offline command over the shipped sample project — the committed full-root snapshot fixture
and placeholder content manifest — through the shipped pipeline (capability probe -> extraction
-> composition). All paths resolve relative to THIS directory; the engine carries no defaults.

```bash
node bin/det.js build --config examples/build/project.example.json --out out/build-sample
# inspect the bundle:
out/build-sample/build-manifest.json      # versioned inventory: per-file-byte sha256 over every
                                          # generated artifact + consumed input, stage provenance,
                                          # honest gaps (composition ledger + OPERATOR_GATED steps)
out/build-sample/03-composition/native-content.html
```

A real project replaces every path with its own caller inputs (its own offline tree document,
registry/probe, binding map, content manifest, projection). The preview installation into a
Magento checkout is NOT part of the build — it is an explicitly OPERATOR_GATED gap recorded in
the manifest (see `examples/local-preview/README.md`).

Packaging (no npm publish): `npm link` at a toolkit checkout exposes the `det` bin locally, or
pack/install the repo tarball (`npm pack`) into the consuming project; `npm ci && npm run build`
prepares `dist/` either way.
