define( [
	'backbone',
	'jquery',
	'lodash',
	'bus',
	'text!template/mainView.html'
 ], function( Backbone, $, _, bus, template ) {
	return Backbone.View.extend( {
		el: 'body',

		slowMotion: false,
		slowMotionDelay: 2000,
		online: false,
		animating: false,

		events: {
			'click .equipment': 'toggleSlowMotion',
			'click .toggle-online': 'toggleOnline',
			'click .toggle-disconnect': 'toggleWindowDisconnect'
		},

		initialize: function() {
			_.bindAll( this, "render", "dequeue", "resetQueue", "updateLed", "updateClass", "routeEvents", "transition", "handling", "handled", "checking", "toggleSlowMotion", "toggleOnline", "toggleWindowDisconnect" );
			this.template = _.template( template );
			bus.connectivityOutput.subscribe( "#", this.routeEvents ).withContext( this );
			bus.heartbeat.subscribe( "#", this.routeEvents ).withContext( this );
		},

		render: function() {
			this.$el.html( this.template( {} ) );
			this.$switchPlate = this.$( '.switch-plate' );
			this.$internet = this.$( '.internet' );
			this.$led = this.$( '.equipment-led' );
		},

		dequeue: function() {
			this.animating = false;
			this.$el.dequeue( "slow-motion" );
		},

		queueUpdate: function( callback, immediate ) {
			var self = this;

			this.$el.queue( "slow-motion", function() {
				self.animating = true;
				callback();

				if ( immediate === true ) {
					self.dequeue();
					return;
				}

				window.setTimeout( self.dequeue, self.slowMotionDelay );
			} );

			if ( !this.animating ) {
				this.$el.dequeue( "slow-motion" );
			}
		},

		resetQueue: function() {
			this.$el.stop( "slow-motion", true, false );
		},

		updateLed: function( message ) {
			var self = this;

			if ( this.slowMotion ) {
				this.queueUpdate( function() {
					self.$led.html( message );
				} );
			} else {
				self.$led.html( message );
			}
		},

		updateClass: function( toState ) {
			var self = this,
				updateInternet = function() {
					if ( toState === "online" ) {
						self.$internet.removeClass( "internet-disconnected" );
					} else {
						self.$internet.toggleClass( "internet-disconnected", app.simulateDisconnect || toState === "disconnected" );
					}
				};

			if ( this.slowMotion ) {
				this.queueUpdate( function() {
					self.$el
						.removeClass( "online offline disconnected probing" )
						.addClass( toState );

					updateInternet();
				}, true );
			} else {
				if ( toState !== "probing" ) {
					this.$el
						.removeClass( "online offline disconnected probing" )
						.addClass( toState );

					updateInternet();
				}
			}
		},

		// LISTENING TO THE FSM OUTPUT (& STETHOSCOPE)
		routeEvents: function( data, envelope ) {
			var handler = envelope.topic.toLowerCase();
			if ( this[ handler ] ) {
				this[ handler ]( data );
			}
		},
		transition: function( data ) {
			this.updateLed( data.fromState + " &rarr; " + data.toState );
			this.updateClass( data.toState );
			this.updateLed( data.toState );
		},
		handling: function( data ) {
			this.updateLed( data.inputType );
		},
		handled: function( data ) {
		},
		checking: function() {
			this.updateClass( "probing" );
			this.updateLed( "Heartbeat Check" );
		},

		// Reacting to events origination from DOM
		toggleSlowMotion: function() {
			this.slowMotion = !this.slowMotion;
			this.resetQueue();
			this.$el.toggleClass( "equipment-open", this.slowMotion );
		},
		toggleOnline: function() {
			this.online = !this.online;
			this.$switchPlate.toggleClass( "switch-on", this.online );
			bus.connectivityInput.publish( {
				topic: this.online ? "go.online" : "go.offline",
				data: {}
			} );
		},
		toggleWindowDisconnect: function() {
			app.toggleDisconnectSimulation();
			this.$internet.toggleClass( "internet-disconnected", app.simulateDisconnect );
		}
	} );
} );
