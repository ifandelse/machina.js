var pkg = require( "./package.json" );
var _ = require( "lodash" );
var webpack = require( "webpack" );
var banner = [
	" * <%= pkg.name %> - <%= pkg.description %>",
	" * Author: <%= pkg.author %>",
	" * Version: v<%= pkg.version %>",
	" * Url: <%= pkg.homepage %>",
	" * License(s): <%= pkg.license %>"
].join( "\n" );
var header = _.template( banner )( { pkg: pkg } );

module.exports = {
	output: {
		library: "machina",
		libraryTarget: "umd",
		filename: "machina.js"
	},
	devtool: "#inline-source-map",
	externals: [
		{
			postal: true,
			machina: true,
			lodash: {
				root: "_",
				commonjs: "lodash",
				commonjs2: "lodash",
				amd: "lodash"
			}
		}
	],
	module: {},
	plugins: [
		new webpack.BannerPlugin( header )
	]
};
