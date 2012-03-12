var AmplifyFsmProvider = function() {
	var eventTransformations = {},
		wireHandlersToBus = function(fsm) {
			_.each(utils.getHandlerNames(fsm), function(topic) {
				fsm.messaging.subscriptions.push(
					amplify.subscribe(fsm.messaging.handlerNamespace + "." + topic, fsm, function(data) {
						this.handle.call(this,topic, data);
					})
				);
			});
		},
		wireEventsToBus = function(fsm) {
			fsm.messaging.eventPublisher = function(){
				var topic = arguments[0],
					payload = _.deepExtend({}, slice.call(arguments, 1));
				if(eventTransformations[topic]) {
					payload = eventTransformations[topic](payload);
				}
				amplify.publish(fsm.messaging.eventNamespace + "." + topic, payload);
			};
			fsm.on("*", fsm.messaging.eventPublisher);
		};
	return {
		wireUp: function(fsm) {
			wireHandlersToBus(fsm);
			wireEventsToBus(fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.amplify = new AmplifyFsmProvider();
messageBusProvider.amplify.addEventTransforms(utils.standardEventTransforms);