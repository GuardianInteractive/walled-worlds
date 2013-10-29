define(['app/models/worldMap', 'app/models/svgs', 'app/models/config', 'PubSub', 'd3', 'togeojson'],
  function(WorldMapData, Svgs, Config, PubSub) {
  return function(animLength, animDelay) {
    var el;
    var mapData;
    var mapid;
    var markers;
    var tweenCount = 0;
    var paths = [];
    var tweens = [];
    var pubSubTokens = {};
    var debug = Config.debug;
    var animDuration = animLength || 500;
    var animDeley = animDelay || 250;

    var shouldAnimate = false;

    function _nextPathTween() {
      tweenCount += 1;
      if (tweenCount < paths.length) {
        tweens[tweenCount].start();
      } else {
        PubSub.publish('animFinished');
      }
    }

    function _setupAnim(path, totalLength) {
      var length = path.getTotalLength();
      path.style.strokeDasharray = length + ' ' + length;
      path.style.strokeDashoffset = length;
      var pathTime = Math.round((length / totalLength) * animDuration);

      return new TWEEN.Tween( { x: length} )
        .to( { x: 0 }, pathTime)
        .onUpdate( function () {
          path.style.strokeDashoffset = this.x + 'px';
        })
        .onComplete(_nextPathTween);
    }

    function _setupPaths() {
      paths = el.querySelectorAll('.svg_wall .wall_path');
      if (paths.length === 0) {
        return;
      }

      var totalLength = 0;
      for (var i = 0; i < paths.length; i++) {
        totalLength += paths[i].getTotalLength();
      }

      for (var i = 0; i < paths.length; i++) {
        paths[i].setAttribute('style', '');
        tweens.push(_setupAnim(paths[i], totalLength));
      }
    }



    function _setupMarkers() {
      markers = el.querySelectorAll('.svg_wall .marker_group');
      for (var i = 0; i < markers.length; i++) {
        var markerID = markers[i].id.replace('marker_', '');
        pubSubTokens[markerID] = PubSub.subscribe(markerID, _triggerMarker.bind(markers[i]));
      }
    }


    function _triggerMarker(msg, data) {
      // Can't use .classList on SVG elements
      if (data.show) {
        if (-1 === this.getAttribute('class').indexOf('show-marker')) {
          this.setAttribute('class', this.getAttribute('class') + ' show-marker');
        }
      } else {
        if (-1 !== this.getAttribute('class').indexOf('show-marker')) {
          this.setAttribute('class', this.getAttribute('class').replace(' show-marker', ''));
        }
      }
    }



    // Example: https://mapsengine.google.com/map/edit?mid=zTpKh93u3nmI.kn5ClQNz9iAk
    var KMLPath = 'mapsengine.google.com/map/kml?mid=';
    var proxyPath = 'http://ec2-54-228-9-201.eu-west-1.compute.amazonaws.com:1337/?src=';

    function _fetchKML() {
      var proxyUrl = proxyPath + KMLPath + mapData.mapurl.split('mid=')[1];

      d3.xml(proxyUrl, function(xml) {
        if (xml) {
          var geoJson = toGeoJSON.kml(xml);
          _drawMap(geoJson);
        }
      });
    }

    function _drawMap(json) {
      var WIDTH = 380;
      var HEIGHT = 800;
      var markerPath = "M77 208 C -10 130 -30 0 77 1 C 184 0 164 130 77 208 Z";

      markerPath += "M 77 30 a 40 40 0 1 0 0.00001 0 Z"; // Circle cut out

      el = document.createElement('div');
      el.classList.add('svg_wall');

      var svg = d3.select(el).append("svg")
        .attr("width", WIDTH)
        .attr("height", HEIGHT);

      var center = [-1.4, 51];
      if (mapData.center !== undefined && mapData.center.split(',').length === 2) {
        center = mapData.center.split(',').map(function(loc) { return parseFloat(loc); });
      }

      var zoom = 4000;
      if (mapData.zoomlevel !== undefined && !isNaN(parseInt(mapData.zoomlevel, 10)) ) {
        zoom = parseInt(mapData.zoomlevel, 10);
      }

      var translate = [WIDTH / 2, HEIGHT / 2];
      if (mapData.offsetx !== undefined && !isNaN(parseInt(mapData.offsetx, 10)) ) {
        translate[0] += parseInt(mapData.offsetx, 10);
      }

      if (mapData.offsety !== undefined && !isNaN(parseInt(mapData.offsety, 10)) ) {
        translate[1] += parseInt(mapData.offsety, 10);
      }

      // Ref: https://github.com/mbostock/d3/wiki/Geo-Projections
      var projectionType = 'equirectangular';
      if (typeof mapData.projection === 'string') {
        if (mapData.projection.trim().toLocaleLowerCase() === 'mercator') {
          projectionType = 'mercator';
        }

        if (mapData.projection.trim().toLocaleLowerCase() === 'orthographic') {
          projectionType = 'orthographic';
        }
      }


      var projection = d3.geo[projectionType]()
        .scale(zoom)
        .translate(translate)
        .center(center);

      var path = d3.geo.path().projection(projection);

      if (debug) {
        var world = svg.append("svg:g")
          .attr("class", "world");
        world.selectAll(".country")
          .data(WorldMapData.features)
          .enter().insert("path", ".graticule")
          .attr("class", "country")
          .attr("d", path);
      }

      // Add walls
      var wallData = json.features.filter(function(feature) {
        return feature.properties.folder.toLowerCase() === 'walls';
      });

      var walls = svg.append("svg:g")
        .attr("class", "wall_group");

      walls.selectAll("path")
        .data(wallData)
        .enter()
        .append("path")
        .attr("class", 'wall_path')
        .attr("d", path);


      // Add Labels
      var labelsData = json.features.filter(function(feature) {
        return feature.properties.folder.toLowerCase() === 'labels';
      });

      var labels = svg.append("svg:g")
        .attr("class", "labels");

      labels.selectAll("path")
        .data(labelsData)
        .enter()
        .append("g")
        .attr("class", "label_group")
        .attr('id', function(d) { return 'marker_' + d.properties.name; })
        .append("svg:text")
        .attr("text-anchor", "middle")
        .attr("class", function(d) {if (d.properties.description === "1") {return "label_text major";} else {return "label_text minor";}})
        .attr("id", function(d) { return 'label-' + d.properties.name; })
        .attr("transform", function(d) { return "translate(" + projection(d.geometry.coordinates) + ")"; })
        .text(function(d) {if (d.properties.description === "1") {return d.properties.name;} else {return "◆ " + d.properties.name;}});

      // Add markers
      var markerData = json.features.filter(function(feature) {
        return feature.properties.folder.toLowerCase() === 'markers';
      });

      var markers = svg.append("svg:g")
        .attr("class", "markers");

      markers.selectAll("path")
        .data(markerData)
        .enter()
        .append("g")
        .attr("class", "marker_group")
        .attr('id', function(d) { return 'marker_' + d.properties.name; })
        .append("svg:text")
        .attr("text-anchor", "middle")
        .attr("class", "marker_text")
        .attr("id", function(d) { return 'marker-' + d.properties.name; })
        .attr("transform", function(d) { return "translate(" + projection(d.geometry.coordinates) + ")"; });

      markers.selectAll(".marker_group")
        .data(markerData)
        .append("path")
        .attr('class', 'marker_path')
        .attr('transform', function(d) {var x = projection(d.geometry.coordinates)[0] - 16; var y = projection(d.geometry.coordinates)[1] - 33; return "translate(" + x + "," + y + ") scale(0.10)";})
        .attr("d", markerPath);

      PubSub.publish('mapRendered', { id: mapid });
    }


    function render() {
      _setupPaths();
      _setupMarkers();

      if (shouldAnimate) {
        anim();
      }

      return el;
    }

    function anim() {
      shouldAnimate = true;
      if (tweens[0]) {
        tweens[0].delay(animDeley).start();
      }
    }

    function _simpleSVG() {
      if ( Svgs.hasOwnProperty(mapid)) {
        el = document.createElement('div');
        el.classList.add('svg_wall');
        el.innerHTML = Svgs[mapid];
        PubSub.publish('mapRendered', { id: mapid });
      }
    }


    function init(mapID, data) {
      mapData = data;
      mapid = mapID;

      if (Config.useGoogleMaps) {
        _fetchKML();
      } else {
        _simpleSVG();
      }


    }

    return {
      render: render,
      init: init,
      anim: anim
    };
  };
});
