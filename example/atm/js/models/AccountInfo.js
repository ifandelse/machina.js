var AccountInfo = Backbone.Model.extend( {
	defaults : {
		modelType : "accountInfo",
		name      : "",
		balance   : 0,
		limit     : 0
	},

	initialize : function () {
		this.fetch();
	}
} );
