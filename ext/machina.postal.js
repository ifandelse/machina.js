/*
 machina.postal
 Author: Jim Cowart (http://freshbrewedcode.com/jimcowart)
 License: Dual licensed MIT (http://www.opensource.org/licenses/mit-license) & GPL (http://www.opensource.org/licenses/gpl-license)
 Version 0.2.1
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
				try {
					var data = args[0] === "Transitioned" ? { fromState: args[1], toState: args[2] } : args[1];
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
	machina.on( "newFsm", bus.wireUp );

} ));