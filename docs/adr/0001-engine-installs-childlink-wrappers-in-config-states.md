---
status: accepted
date: 2026-11-08
---

# The engine installs ChildLink wrappers into `config.states` in place

`BehavioralFsm` replaces each `_child` value in the user's `states` object with a `ChildLink` adapter at construction time. machina-inspect's live-instance path reads that wrapper through two members, `canHandle` and `instance`, to reach the child graph. We kept this behavior during the mount-table refactor (Nov 2026) so the refactor ships as a minor release: removing the mutation, or changing those two members, is a major release for machina plus a coordinated machina-inspect release and a peer-range bump.

## Consequences

- The mount table performs the write that `wrapChildLinks()` performed before. The contract with machina-inspect is unchanged.
- The mount table reads `_child` from each state object once, in its constructor. A caller who deletes or reassigns `_child` on `states` after construction does not change the mounts at runtime. Before the refactor the engine read `_child` on every call, and a delete stopped delegation. Machina never documented support for mutating state objects after construction. The one-time read stays, and `mount-table.test.ts` pins it.
- `ChildLink` stays exported as a type. Its other members may change in a minor release; only `canHandle` and `instance` are the members tooling reads.
- The natural point to revisit this is candidate 3 of the Nov 2026 review (Fsm as a bound-client mode of the engine), which already touches the Fsm ChildLink adapter.

## Revisiting

This record exists so a future architecture review does not re-suggest the change without knowing the cost. It is not a constraint on the author. When Jim decides to remove the mutation, supersede this ADR and do it.
