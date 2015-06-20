var NavView;
(function ( $, Backbone, infuser, undefined ) {
	NavView = Backbone.View.extend( {
		tagName : "div",

		events : {
			"click #deposit" : "makeDeposit",
			"click #withdrawal" : "makeWithdrawal",
			"click #logout" : "logout"
		},

		initialize : function () {
			_.bindAll( this, "render", "unAuthLayout", "authLayout", "makeDeposit", "makeWithdrawal", "logout", "depositLayout", "withdrawalLayout" );
		},

		render : function ( postRender ) {
			var self = this;
			infuser.infuse( "nav", {
				target : self.$el,
				preRender : function () {
					infuser.defaults.preRender.apply( this, arguments );
					$( "#nav" ).html( self.$el );
					$( document ).delegate( "#cancel", "click", function () {
						self.cancelAction();
					} );
				},
				postRender : function () {
					infuser.defaults.postRender.apply( this, arguments );
					postRender.apply( self );
				}
			} );
		},

		unAuthLayout : function () {
			this.$el.find( "#deposit, #withdrawal, #logout, #submit, #cancel, #atm-spacer-row" ).parent().hide();
			this.$el.find( "#auth" ).parent().show();
		},

		authLayout : function () {
			this.$el.find( "#deposit, #withdrawal, #logout" ).parent().show();
			this.$el.find( "#auth, #submit, #cancel, #atm-spacer-row" ).parent().hide();
		},

		depositLayout : function () {
			this.$el.find( "#withdrawal, #logout, #submit, #cancel, #atm-spacer-row" ).parent().show();
			this.$el.find( "#deposit, #auth" ).parent().hide();
		},

		withdrawalLayout : function () {
			this.$el.find( "#deposit, #logout, #submit, #cancel, #atm-spacer-row" ).parent().show();
			this.$el.find( "#withdrawal, #auth" ).parent().hide();
		},

		makeDeposit : function () {
			window.location.hash = "deposit";
		},

		makeWithdrawal : function () {
			window.location.hash = "withdrawal";
		},

		logout : function () {
			window.location.hash = "deauthorize";
		},

		cancelAction : function () {
			window.location.hash = "account";
		}
	} );
})( jQuery, Backbone, infuser );