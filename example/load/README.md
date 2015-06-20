# "Load" Sample Application

The FSM in this sample application handles the "initialization" (or "load") process of the app.  Although it's fairly oversimplified, it demonstrates an alternative approach to wrapping the series of async events with deferreds.

To demonstrate how the FSM would respond to a failed call to Hacker News, change the url in the main.js file to something that will break.

This example application is using postal.js to integrate the FSM with a local message bus.  Communication between the FSM and other components in the application is happening almost entirely through message-based means.

A wiretap (provided by the postal.diagnostics.js file) causes all published messages to be printed to the console as well.