const path = require( "path" );
const pkg = require( "./package.json" );
const webpack = require( "webpack" );
const UnminifiedWebpackPlugin = require( "unminified-webpack-plugin" );

const banner = `${ pkg.name } - ${ pkg.description }
Author: ${ pkg.author }
Version: v${ pkg.version }
Url: ${ pkg.homepage }
License(s): ${ pkg.license }`;

module.exports = {
	mode: "production",
	entry: "./src/index.js",
	output: {
		path: path.resolve( __dirname, "lib" ),
		filename: "machina.min.js",
		library: 'machina',
   		libraryTarget: 'umd',
  		umdNamedDefine: true,
		// library: {
		// 	name: "machina",
		// 	type: "umd",
		// 	export: "default"
		// },
		globalObject: "this",
		clean: true
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
		minimize: true
	},
	devtool: "source-map",
	plugins: [
		new webpack.BannerPlugin( banner ),
		new UnminifiedWebpackPlugin( { postfix: "" } )
	],
	module: {
		rules: [
			{
				test: /\.js?$/,
				exclude: /(node_modules)/,
				loader: "babel-loader"
			}
		]
	}
};
