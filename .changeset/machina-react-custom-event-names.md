---
"machina-react": minor
---

`useFsmEvent` and `useBehavioralFsmEvent` accept custom event names (machina #183). The event name type is the built-in names plus the names of the instance's declared event map, and each callback payload is typed from the same map. An FSM without an event map accepts any name with an `unknown` payload. The new `FsmEventMapOf`, `BehavioralFsmEventMapOf`, `FsmEventName`, and `BehavioralFsmEventName` types are exported.

The `machina` peer range rises to `>=8.2.0`, the first release that exports `EventMapOfInstance`. The generated declaration files import it. Against an older core, every hook fails type checking, including the ones that existed before this release.
