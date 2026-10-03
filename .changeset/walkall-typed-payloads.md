---
"machina-test": minor
---

walkAll reads the FSM's input payload map (machina #195). When the factory returns a typed instance, the config requires a `payloads` key: one generator per payload-carrying input, each returning that input's full argument tuple, which walkAll spreads into `handle()`. A forgotten or misspelled generator is now a compile error naming the input instead of a mid-walk TypeError. The legacy `inputs` key is unchanged for untyped FSMs and absent on the typed path.
