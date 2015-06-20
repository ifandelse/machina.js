var DepositView;
(function ( $, Backbone, infuser, undefined ) {
	DepositView = Backbone.View.extend( {
		tagName : "div",

		model : new DepositModel(),

		events : {
			"change #amount" : "handleAmountChange"
		},

		initialize : function () {
			_.bindAll( this, "render", "handleSubmit", "handleAmountChange", "handleModelChange" );
			this.model.on( "change", this.handleModelChange );
		},

		render : function () {
			var self = this;
			infuser.infuse( "deposit", {
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

		handleModelChange : function () {
			this.render();
		},

		handleSubmit : function () {
			var amount = this.model.get( "amount" );
			if ( amount > 0 ) {
				this.trigger( "Deposit", amount );
				this.model.set( "amount", 0 );
				return;
			}
			this.model.set( "error", "Deposit amount must be greater than $0." );
		},

		handleAmountChange : function ( evnt ) {
			this.model.set( { error : ""}, { silent : true } );
			this.model.set( { amount : parseFloat( $( evnt.target ).val() ) } );
		}
	} );
})( jQuery, Backbone, infuser );