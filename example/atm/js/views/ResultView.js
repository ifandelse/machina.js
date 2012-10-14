var ResultView = Backbone.View.extend( {
	tagName : "div",

	model : new ResultModel(),

	initialize : function () {
		_.bindAll( this, "render" );
	},

	render : function () {
		var self = this;
		infuser.infuse( "result", {
			target : self.$el,
			model : self.model.toJSON(),
			preRender : function () {
				infuser.defaults.preRender.apply( this, arguments );
				$( self.options.target ).html( self.$el );
			}
		} );
	}
} );