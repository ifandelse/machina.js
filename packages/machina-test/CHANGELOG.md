# machina-test

## 4.0.0

### Major Changes

- 659fbfd: walkAll reads the FSM's input payload map (machina #195). The major bump covers two breaks. The machina peer dependency narrows to `>=8.0.0`, because the typed path imports types that exist from machina 8 on. And `walkAll`'s first type parameter is now the FSM type, not the client type: a v3 `walkAll<Client>(factory, config)` call respells as `walkAll(factory, config)`, and the client type infers from the config. The old spelling would have bound the client type to the FSM. Keeping it TClient-first was worse: an explicit client type silently disabled the typed payload checking that the map promises.
  When the factory returns a typed instance, the config requires a `payloads` key: one generator per payload-carrying input, each returning that input's full argument tuple, which walkAll spreads into `handle()`. A forgotten or misspelled generator is now a compile error naming the input instead of a mid-walk TypeError. The legacy `inputs` key is unchanged for untyped FSMs and absent on the typed path.

### Patch Changes

- Updated dependencies [8ab61de]
    - machina-inspect@4.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [59746b5]
- Updated dependencies [eb71113]
- Updated dependencies [749d583]
    - machina@7.0.0
    - machina-inspect@4.0.0

## 2.0.0

### Patch Changes

- Updated dependencies
    - machina@6.3.0
    - machina-inspect@3.0.0

## 1.0.0

### Minor Changes

- Add property based testing/walkAll utility.

### Patch Changes

- Updated dependencies
    - machina@6.2.0
    - machina-inspect@2.0.0

## 0.2.0

### Minor Changes

- Initial create/publish of machina test extensions
