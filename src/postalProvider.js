var PostalFsmProvider = function() {
	var eventTransformations = {},
		wireHandlersToBus = function(exch, ns, fsm) {
			fsm.messaging.subscriptions.push(
				postal.subscribe(exch, ns + ".handle.*", function(data, envelope){
					this.handle.call(this, envelope.topic, data);
				}).withContext(fsm)
			);
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
					postal.publish(exch, evnt + key, payload);
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
			if(!exch) { exch = "/"; }
			wireHandlersToBus(exch, ns, fsm);
			wireEventsToBus(exch, ns, fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.postal = new PostalFsmProvider();
messageBusProvider.postal.addEventTransforms(utils.standardEventTransforms);