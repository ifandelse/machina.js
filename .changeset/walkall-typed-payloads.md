---
"machina-test": major
---

walkAll reads the FSM's input payload map (machina #195). The major bump covers two breaks. The machina peer dependency narrows to `>=8.0.0`, because the typed path imports types that exist from machina 8 on. And `walkAll`'s first type parameter is now the FSM type, not the client type: a v3 `walkAll<Client>(factory, config)` call respells as `walkAll(factory, config)`, and the client type infers from the config. The old spelling would have bound the client type to the FSM. Keeping it TClient-first was worse: an explicit client type silently disabled the typed payload checking that the map promises.
When the factory returns a typed instance, the config requires a `payloads` key: one generator per payload-carrying input, each returning that input's full argument tuple, which walkAll spreads into `handle()`. A forgotten or misspelled generator is now a compile error naming the input instead of a mid-walk TypeError. The legacy `inputs` key is unchanged for untyped FSMs and absent on the typed path.
