define([
	'backbone',
    'jquery',
    'underscore',
    'bus',
    'text!template/mainView.html'
], function( Backbone, $, _, bus, template ) {
	return Backbone.View.extend({
		el: 'body',

		events: {
			'click .slow-mo'      : 'toggleSlowMo', // change this to whatever.  it just indicates an event that gets fired when we want to switch to/from slow-motion
			'click .go-offline'   : 'goOffline',
			'click .go-online'    : 'goOnline',
			'click .fake-offline' : 'simulateWindowOffline'
		},

		initialize: function() {
			_.bindAll(this);
			this.template = _.template(template);
			this.slowMotion = false; // use this however you need.....
			bus.connectivityOutput.subscribe( this.routeEvents ).withContext(this);
			bus.heartbeat.subscribe( this.routeEvents ).withContext(this);
		},

		// PLEASE blow this away - I'm just putting crap on the screen for now....
		render: function() {
			this.$el.html(this.template({}));
			this.$messages = this.$('#messages');
		},

		// SENDING INPUT TO THE FSM
		goOffline: function() {
			bus.connectivityInput.publish({ topic: "goOffline", data: {} });
		},
		goOnline: function() {
			bus.connectivityInput.publish({ topic: "goOnline", data: {} });
		},
		simulateWindowOffline: function() {
			$(window).trigger("offline");
		},

		// LISTENING TO THE FSM OUTPUT (& STETHOSCOPE)
		routeEvents: function(data, envelope) {
			var handler = envelope.topic.toLowerCase();
			if(this[handler]) {
				this[handler](data);
			}
		},
		transitioning: function(data) {
			this.$messages.append("<div>FSM is transitioning from '" + data.fromState + "' to '" + data.toState + "'.</div>");
		},
		transitioned: function(data) {
			this.$messages.append("<div>FSM completed transition from '" + data.fromState + "' to '" + data.toState + "'.</div>");
		},
		handling: function(data) {
			this.$messages.append("<div>FSM is currently handling the '" + data + "' event.</div>");
		},
		handled: function(data) {
			this.$messages.append("<div>FSM has handled the '" + data + "' event.</div><div>-</div>");
		},
		checking: function() {
			this.$messages.append("<div>Heartbeat check in progress.</div>");
		},

		// Reacting to events origination from DOM
		toggleSlowMo: function() {
			this.slowMotion = !this.slowMotion;
		}
	});
});