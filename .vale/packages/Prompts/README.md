# Prompts (vendored)

Vale style for agent instruction files, from https://github.com/jdkato/prompts.

Vendored because the upstream repo publishes no release for `vale sync` to pin.
Copied at commit `0fb3361da35a7b5d6934a9a3b4a6effda4fbba77` (2026-09-04), MIT
license (see LICENSE in this directory). `vale sync` copies this directory into
StylesPath like any other package.

To upgrade: re-copy `Prompts/*.yml` from a newer upstream commit and update the
commit hash here and in the `.vale.ini` comment.
