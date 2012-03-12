# ATM Example

An example application where one FSM acts as the "brains" for an ATM machine (AtmFsm.js), and another controls how the nav bar is displayed (NavFsm.js), depending on the state of the application.

There are two sets of credentials that will work with this sample app:

* acct 123456789, pin 8675
* acct 987654321, pin 3090

This example application was intentionally written without message-bus interaction in order to demonstrate direct API usage.  For a message-bus-integrated example, please see the "load" sample app.

Even though messaging is not actively used in this example, it *does* demonstrate the auto-wireup to amplify.js's pub/sub.  The auto-wireup to amplify provides a wiretap, which causes any FSM events to be printed to the console.
