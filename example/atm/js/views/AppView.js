var AppView;
(function ( $, Backbone, infuser, undefined ) {
	AppView = Backbone.View.extend( {
		model : new AppModel(),

		initialize : function () {
			_.bindAll( this, "render" );
		},

		render : function () {
			var postRender = infuser.defaults.postRender,
				self = this;
			infuser.infuse( "app", {
				model : this.model,
				target : self.options.target,
				postRender : function () {
					postRender.apply( this );
					_.defer( function () {
						self.trigger( "AppRendered" );
					} );
				}
			} );
		}
	} );
})( jQuery, Backbone, infuser );