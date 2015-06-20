var AccountModel = Backbone.Model.extend( {
	defaults : {
		modelType : "account",
		name      : "",
		balance   : 0,
		limit     : 0
	},
	initialize : function () {

	}
} );