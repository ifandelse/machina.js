var LoginView;
(function ( $, Backbone, infuser, undefined ) {
	LoginView = Backbone.View.extend( {
		tagName : "div",

		model : new LoginModel(),

		events : {
			"change #account" : "handleAccountChange",
			"change #pin" : "handlePinChange",
			"click #auth" : "authenticate"
		},

		initialize : function () {
			_.bindAll( this, "render", "authenticate", "handleAccountChange", "handlePinChange" );
		},

		handleAccountChange : function ( evnt ) {
			this.model.set( { acct : $( evnt.target ).val() } );
		},

		handlePinChange : function ( evnt ) {
			this.model.set( { pin : $( evnt.target ).val() } );
		},

		render : function () {
			var self = this;
			infuser.infuse( "login", {
				target : self.$el,
				model : self.model.toJSON(),
				preRender : function () {
					infuser.defaults.preRender.apply( this, arguments );
					$( self.options.target ).html( self.$el );
				},
				postRender : function () {
					infuser.defaults.postRender.apply( this, arguments );
					self.delegateEvents( self.events );
				}
			} );
		},

		authenticate : function () {
			this.model.set( "error", "" );
			var model = this.model.toJSON();
			if ( !model.acct || !model.pin ) {
				this.model.set( { error : "You must enter an account number and a pin first." } );
				this.render();
				return;
			}
			this.trigger( "Authenticate", model );
		}
	} );
})( jQuery, Backbone, infuser );