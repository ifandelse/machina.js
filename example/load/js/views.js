var MainView = function( target ) {
		var self = this;
		self.model = {
			title: "Contrived News Reader"
		};

		self.render = function() {
			var self = this;
			infuser.infuse( "main", {
				target: target,
				model: self.model,
				postRender: function() {
					$( '#refresh' ).on( "click", function() {
						postal.publish( { channel: "application", topic: "refresh" } );
					} )
				}
			} );
		};

		infuser.get( "main", function( template ) {
			postal.publish( { channel: "application", topic: "mainTemplate.retrieved" } );
			self.render();
		} );
	},
	ErrorView = function( target ) {
		this.model = {};

		this.render = function( model ) {
			var self = this;
			self.model = model || self.model;
			infuser.infuse( "failure", {
				target: target,
				model: self.model
			} );
		};

		infuser.get( "failure", function( template ) {
			postal.publish( { channel: "application", topic: "errorTemplate.retrieved" } );
		} );
	},
	ItemView = function( target ) {
		var self = this,
			errorNotice = new ErrorView( target );
		self.model = {};

		self.render = function() {
			var self = this;
			infuser.infuse( "headlines", {
				target: target,
				model: self.model
			} );
		};

		postal.subscribe( {
			channel: "application.events",
			topic: "dataGetFail",
			callback: function( data, env ) {
				errorNotice.render( data[0] );
			}
		} );

		postal.subscribe( {
			channel: "application",
			topic: "itemData.retrieved",
			callback: function( data, env ) {
				self.model = data;
				self.render();
			}
		} );

		infuser.get( "headlines", function( template ) {
			postal.publish( { channel: "application", topic: "itemTemplate.retrieved" } );
		} );
	};
