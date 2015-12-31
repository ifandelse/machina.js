/*eslint-disable */
var webpack = require( "webpack" );
var sml = require( "source-map-loader" );
/*eslint-enable */
var path = require( "path" );

module.exports = {
	module: {
		preLoaders: [
			{
				test: /\.js$/,
				loader: "source-map-loader"
			}
		],
		loaders: [
			{ test: /sinon.*\.js/, loader: "imports?define=>false" }
		],
		postLoaders: [ {
			test: /\.js$/,
			exclude: /(spec|node_modules)\//,
			loader: "istanbul-instrumenter"
		} ]
	},
	resolve: {
		alias: {
			machina: path.join( __dirname, "./lib/machina.js" )
		}
	}
};
