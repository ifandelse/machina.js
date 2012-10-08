/*
 machina.postal
 Author: Jim Cowart (http://freshbrewedcode.com/jimcowart)
 License: Dual licensed MIT (http://www.opensource.org/licenses/mit-license) & GPL (http://www.opensource.org/licenses/gpl-license)
 Version 0.2.3
 */
(function ( root, doc, factory ) {
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( ["machina", "postal"], function ( machina, postal ) {
			return factory( machina, postal, root, doc );
		} );
	} else {
		// Browser globals
		factory( root.machina, root.postal, root, doc );
	}
}( this, document, function ( machina, postal, global, document, undefined ) {

	var dataParser = {
		transitioned: function(data) {
			return { fromState: data[0], toState: data[1] };
		},
		transitioning: function(data) {
			return { fromState: data[0], toState: data[1] };
		}
	};
	
	var bus = machina.bus = {
		channels : {},
		config : {
			handlerChannelSuffix : "",
			eventChannelSuffix : ".events"
		},
		wireHandlersToBus : function ( fsm, handlerChannel ) {
			bus.channels[handlerChannel]._subscriptions.push(
				bus.channels[handlerChannel].subscribe( "#", function ( data, envelope ) {
					fsm.handle.call( fsm, envelope.topic, data, envelope );
				} )
			);
		},
		wireEventsToBus : function ( fsm, eventChannel ) {
			var publisher = bus.channels[eventChannel].eventPublisher = function () {
				var args = Array.prototype.slice.call(arguments, 0);
				var handler = args[0].toLowerCase();
				try {
					var data = dataParser.hasOwnProperty(handler) ? dataParser[handler](args.slice(1)) : args[1];
					bus.channels[eventChannel].publish( { topic : args[0], data : data || {} } );
				} catch ( exception ) {
					if ( console && typeof console.log !== "undefined" ) {
						console.log( exception.toString() );
					}
				}
			};
			fsm.on( "*", publisher );
		},
		wireUp : function ( fsm ) {
			var handlerChannel = fsm.namespace + bus.config.handlerChannelSuffix,
				eventChannel = fsm.namespace + bus.config.eventChannelSuffix;
			bus.channels[handlerChannel] = postal.channel( { channel : handlerChannel } );
			bus.channels[eventChannel] = postal.channel( { channel : eventChannel } );
			bus.channels[handlerChannel]._subscriptions = [];
			bus.wireHandlersToBus( fsm, handlerChannel );
			bus.wireEventsToBus( fsm, eventChannel );
		}
	};
	machina.on( "newfsm", bus.wireUp );

} ));