const { merge } = require('webpack-merge');
const path = require('path');

// Base configurations
const mainConfig = require('./webpack.main.js');
const rendererConfig = require('./webpack.renderer.js');

// Development-specific configuration for renderer process
const rendererDevConfig = {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 3000,
    hot: true,
    liveReload: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    allowedHosts: 'all',
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
      logging: 'info',
    },
  },
  output: {
    publicPath: 'http://localhost:3000/',
  },
  stats: 'minimal',
};

// Development-specific configuration for main process
const mainDevConfig = {
  mode: 'development',
  devtool: 'eval-source-map',
  watch: true,
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000,
  },
  stats: 'minimal',
};

module.exports = [
  // Main process config
  merge(mainConfig, mainDevConfig),

  // Renderer process config
  merge(rendererConfig, rendererDevConfig),
];