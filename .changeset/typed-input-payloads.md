---
"machina": minor
---

Add typed input payloads (#195). A curried factory form fixes an input payload map — input name → argument tuple — before config inference starts: `createFsm<TInputs>()({...})` and `createBehavioralFsm<TClient, TInputs>()({...})`. Under a map, handler payload parameters are inferred from the map's tuples, `handle()` enforces them at the call site, and the map is the complete input vocabulary: handler keys outside it are compile errors. `InputMapFromUnion` derives a map from a discriminated event union. `InputMapOfInstance` extracts the map back off a constructed instance, for tooling. The map is type-only; runtime behavior is unchanged, and the untyped call forms behave exactly as before.

One edge affects type-position code only: in an instantiation expression such as `typeof createBehavioralFsm<Client, X>`, the second type argument now binds to the input map, not the states object. Direct calls are unaffected. Spell such annotations with the class and extraction types instead: `BehavioralFsm<Client, StateNamesOf<typeof states>, InputNamesOf<typeof states>>`.
