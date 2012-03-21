//import("VersionHeader.js");
(function(root, doc, factory) {
	if (typeof define === "function" && define.amd) {
		// AMD. Register as an anonymous module.
		define(["machina", "postal"], function(machina, postal) {
			return factory(machina, postal, root, doc);
		});
	} else {
		// Browser globals
		factory(root.machina, root.postal, root, doc);
	}
}(this, document, function(machina, postal, global, document, undefined) {

	var bus = machina.bus = {

		channels: {},

		config: {
			handlerChannelSuffix: "",
			eventChannelSuffix: ".events"
		},

		wireHandlersToBus: function(fsm, handlerChannel) {
			fsm.messaging.subscriptions.push(
				bus.channels[handlerChannel].subscribe("*", function(data, envelope){
					fsm.handle.call(fsm, envelope.topic, data);
				})
			);
		},

		wireEventsToBus: function(fsm, eventChannel) {
			fsm.messaging.eventPublisher = function(){
				bus.channels[eventChannel].publish(arguments[1], { channel: eventChannel, topic: arguments[0] });
			};
			fsm.on("*", fsm.messaging.eventPublisher);
		},

		wireUp: function(fsm) {
			var handlerChannel = fsm.messaging.namespace + bus.config.handlerChannelSuffix,
				eventChannel   = fsm.messaging.namespace + bus.config.eventChannelSuffix;
			bus.channels[handlerChannel] = postal.channel({ channel: handlerChannel });
			bus.channels[eventChannel] = postal.channel({ channel: eventChannel });
			bus.wireHandlersToBus(fsm, handlerChannel);
			bus.wireEventsToBus(fsm, eventChannel);
		}
	};

	machina.on("newFsm", bus.wireUp);

}));