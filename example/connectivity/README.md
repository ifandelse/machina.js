# Connectivity FSM Example

### WARNING: This is a work in progress!

The Connectivity FSM can be in one of the following states:

* `probing` - the FSM will attempt to perform a heartbeat check via HTTP
* `online` - the FSM is online, and will monitor for events to signal it should `goOffline` or into probing again.
* `offline` - the FSM has been told to go offline intentionally and will listen for a `goOnline` event
* `disconnected` - the FSM has detected the connection has been lost, and will listen for events the signal it should `goOffline` or into probing.

