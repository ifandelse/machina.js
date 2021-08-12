// var pkg = require( "./package.json" );
// var _ = require( "lodash" );
// var webpack = require( "webpack" );
const path = require( "path" );
const pkg = require( "./package.json" );
const webpack = require( "webpack" );
const UnminifiedWebpackPlugin = require( "unminified-webpack-plugin" );

const banner = `${ pkg.name } - ${ pkg.description }
Author: ${ pkg.author }
Version: v${ pkg.version }
Url: ${ pkg.homepage }
License(s): ${ pkg.license }`;

const source = path.join( __dirname, "src", "index.js" );

module.exports = {
	mode: "production",
	entry: {
		externa: source,
	},
	output: {
		path: path.resolve( __dirname, "dist" ),
		filename: "machina.min.js",
		library: {
			name: "machina",
			type: "umd",
			export: "default",
		},
		globalObject: "this",
		clean: true,
	},
	externals: {
		lodash: {
			root: "_",
			commonjs: "lodash",
			commonjs2: "lodash",
			amd: "lodash"
		}
	},
	optimization: {
		minimize: true,
	},
	devtool: "source-map",
	plugins: [
		new webpack.BannerPlugin( banner ),
		new UnminifiedWebpackPlugin( { postfix: "", } ),
	],
	module: {
		rules: [
			{
				test: /\.js?$/,
				exclude: /(node_modules)/,
				loader: "babel-loader",
			},
		],
	},
};
