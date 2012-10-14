var AccountView;
(function ( $, Backbone, infuser, undefined ) {
	AccountView = Backbone.View.extend( {
		tagName : "div",

		initialize : function () {
			_.bindAll( this, "render" );
		},

		render : function () {
			var self = this;
			infuser.infuse( "account", {
				target : self.$el,
				model : self.model.toJSON(),
				preRender : function () {
					infuser.defaults.preRender.apply( this, arguments );
					$( self.options.target ).html( self.$el );
				}
			} );
		}
	} );
})( jQuery, Backbone, infuser );