# Connectivity FSM Example

The Connectivity FSM (under `js/connectivityFsm.js`) can be in one of the following states:

* `probing` - the FSM will attempt to perform a heartbeat check via HTTP (we're currently using mockjax to mock the endpoint)
    * this state has an entry action, triggered by the `_onEnter` handler - which issues the command to check for a heartbeat.
* `online` - the FSM is online, and will monitor for events to signal it should `go.offline` or into probing again.
* `offline` - the FSM has been told to go offline intentionally and will listen for a `go.online` event
* `disconnected` - the FSM has detected the connection has been lost, and will listen for events the signal it should `go.offline` or into probing.

### The UI

* clicking the switch to the left of the center box will send `go.online` and `go.offline` commands to the FSM
* clicking the cables that run down from the top of the page to the box will simulate the `window.offline` and `window.online` events, to which the FSM is listening.
* clicking the box itself will expand it to display a LED readout, and will cause the UI to run in slow motion (2 second delay) between each message