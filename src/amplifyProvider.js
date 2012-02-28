var AmplifyFsmProvider = function() {
	var eventTransformations = {},
		wireHandlersToBus = function(exch, ns, fsm) {
			_.each(utils.getHandlerNames(fsm), function(topic) {
				fsm.messaging.subscriptions.push(
					amplify.subscribe(exch + "." + ns + ".handle." + topic, fsm, function(data) {
						this.handle.call(this,topic, data);
					})
				);
			});
		},
		wireEventsToBus = function(exch, ns, fsm) {
			var evnt = ns + ".event.";
			_.each(fsm.events, function(value, key) {
				var pub = function() {
					var payload = _.deepExtend({}, arguments);
					payload.stateBag = payload[0];
					delete payload[0];
					if(eventTransformations[key]) {
						payload = eventTransformations[key](payload);
					}
					amplify.publish(exch + "." + evnt + key, payload);
				};
				value.push(pub);
				fsm.messaging.publishers.push( { "Event" : key, "publish" : pub } );
			});
		};
	return {
		wireUp: function(fsm) {
			var exch = utils.getExchBase(fsm),
				ns = utils.getTopicBase(fsm),
				evnt = ns + "event.";
			wireHandlersToBus(exch, ns, fsm);
			wireEventsToBus(exch, ns, fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.amplify = new AmplifyFsmProvider();
messageBusProvider.amplify.addEventTransforms(utils.standardEventTransforms);