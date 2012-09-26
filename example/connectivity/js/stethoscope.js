define([
	'backbone',
    'underscore',
    'jquery'
], function( Backbone, _, $ ) {

	var Stethoscope = function(heartbeatDef) {
		this.settings = $.extend(true, {
			type: "GET",
			dataType: "json",
			timeout: 5000
		}, heartbeatDef);
	};

	_.extend(Stethoscope.prototype, Backbone.Events, {
		checkHeartbeat: function() {
			var self = this;

			$.ajax(self.settings )
				.done(function() {
					self.trigger('heartbeat')
				})
				.fail(function() {
					self.trigger('no-heartbeat');
				});
		}
	});

	return Stethoscope;
});