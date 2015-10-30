'use strict';

module.exports = tileReduce;

var bboxPolygon = require('turf-bbox-polygon');
var tilecover = require('tile-cover');
var ProgressBar = require('progress');

var EventEmitter = require('events').EventEmitter;
var cpus = require('os').cpus().length;
var fork = require('child_process').fork;
var path = require('path');

function tileReduce(options) {
  var tiles = bboxTiles(options.bbox, options.zoom);
  var remaining = tiles.length;
  var workers = [];
  var workersReady = 0;
  var ee = new EventEmitter();
  var bar = new ProgressBar(':current / :total tiles (:percent), :elapseds elapsed [:bar] ', {total: remaining});

  for (var i = 0; i < cpus - 1; i++) {
    var worker = fork(path.join(__dirname, 'worker.js'), [options.map, JSON.stringify(options.sources)]);
    worker.on('message', handleMessage);
    workers.push(worker);
  }

  function handleMessage(message) {
    if (message.ready && ++workersReady === workers.length) run();
    else if (message.reduce !== undefined) {
      bar.tick();
      if (message.reduce !== null) ee.emit('reduce', message.reduce);
      if (--remaining === 0) shutdown();
    }
  }

  function shutdown() {
    while (workers.length) workers.pop().kill();
    ee.emit('end');
  }

  function run() {
    ee.emit('start', tiles);
    for (var i = 0; i < tiles.length; i++) {
      workers[i % workers.length].send(tiles[i]);
    }
  }

  return ee;
}

function bboxTiles(bbox, zoom) {
  return tilecover.tiles(bboxPolygon(bbox).geometry, {min_zoom: zoom, max_zoom: zoom});
}