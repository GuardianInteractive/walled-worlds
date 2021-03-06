define(['mustache', 'app/views/mapView', 'app/views/navigationView', 'app/models/config', 'templates', 'app/utils/utils', 'app/models/data', 'PubSub', 'marked'],
  function(mustache, MapView, NavigationView, Config, templates, Utils, DataModel, PubSub, marked)
{
  return function(chapterData) {

    var el = document.createElement('div');
    var model = chapterData;
    var mapView = new MapView(model);
    var mapElm;
    var photoCreditElm;
    var _isHidden = false;
    var waypoints = [];
    var imgs = {};
    var backgroundImg;

    marked.setOptions({ smartypants: true });

    function _buildCopyAsset(id) {
      var data = _getAssetData(id, DataModel.get('copy'));
      if (typeof data === 'undefined') {
        return;
      }

      var templateData = {
        assetid: data.assetid,
        content: marked(data.content)
      };
      var html = mustache.render(templates.chapter_asset_copy, templateData);
      var domFrag = Utils.buildDOM(html);

      if (data && data.hasOwnProperty('marker') && data.marker.trim().toLocaleLowerCase() === 'true') {
        _addWaypoint(domFrag.firstChild, id);
      }

      return domFrag;
    }

    function _buildImageAsset(id) {
      var data = _getAssetData(id, DataModel.get('images'));

      if (data && data.hasOwnProperty('height') && !isNaN(parseInt(data.height, 10))) {
        imgs[data.assetid]= {};
        imgs[data.assetid].aspectRatio = parseInt(data.height, 10) / 496;
        imgs[data.assetid].height = data.height;
        var newHeight = parseInt((Config.width - 20) * imgs[data.assetid].aspectRatio, 10);
        data.scaledHeight = (newHeight < imgs[data.assetid].height) ? newHeight : imgs[data.assetid].height;
      }

      var html = mustache.render(templates.chapter_asset_image, data);
      var domFrag = Utils.buildDOM(html);

      imgs[data.assetid].el = domFrag.querySelector('img');

      if (data && data.hasOwnProperty('marker') && data.marker.trim().toLocaleLowerCase() === 'true') {
        _addWaypoint(domFrag.firstChild, id);
      }

      // Check of world map image
      if (data && data['class'] && typeof data['class'] === 'string' && data['class'].toLowerCase().indexOf('worldmap') !== -1) {
        Utils.on(imgs[data.assetid].el, 'click', handleMapClick);
      }

      return domFrag;
    }

    function handleMapClick(event) {
      var x = event.layerX || event.offsetX;
      var y = event.layerY || event.offsetY;
      var target = event.target || event.srcElement;
      var originalHeight = (target.dataset) ? target.dataset.height : target.getAttribute('data-height');
      var scale = target.clientHeight / originalHeight;

      var hitBoxes = [
        {coords: [26, 44, 46, 64], href: '#mexico'},
        {coords: [134, 161, 154, 181], href: '#saopaulo'},
        {coords: [209, 2, 229, 22], href: '#belfast'},
        {coords: [211, 41, 231, 61], href: '#melilla'},
        {coords: [196, 63, 216, 83], href: '#sahara'},
        {coords: [264, 28, 284, 48], href: '#greece'},
        {coords: [286, 37, 306, 57], href: '#homs'},
        {coords: [382, 66, 402, 86], href: '#bangladesh'},
        {coords: [437, 33, 457, 53], href: '#korea'}
      ];

      hitBoxes.some(checkHitBox);

      function checkHitBox(hitBox) {
        if (x > hitBox.coords[0]*scale  &&
            x < hitBox.coords[2]*scale &&
            y > hitBox.coords[1]*scale &&
            y < hitBox.coords[3]*scale
          ) {
          document.location.hash = hitBox.href;
          return true;
        }

        return false;
      }
    }

    function _addWaypoint(el,ID) {
      waypoints.push(checkScroll);

      function checkScroll() {
        var elPos = el.getBoundingClientRect();

        if (elPos.bottom < 0 || elPos.top > window.innerHeight) {
          return;
        }

        if (elPos.top - (window.innerHeight/2) < 0) {
          PubSub.publish(ID, { id: ID, show: true });
        }

        if (elPos.top - (window.innerHeight/2) > 0) {
          PubSub.publish(ID, { id: ID, show: false });
        }
      }
    }

    function _buildVideoAsset(id) {
      if (Modernizr.video === false) {
        return false;
      }

      var data = _getAssetData(id, DataModel.get('videos'));
      var html = mustache.render(templates.chapter_asset_video, data);
      var domFrag = Utils.buildDOM(html);

      if (data && data.hasOwnProperty('marker') && data.marker.trim().toLocaleLowerCase() === 'true') {
        _addWaypoint(domFrag.firstChild, id);
      }

      domFrag.querySelector('video').addEventListener('play', function(e) {
        var videos = document.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
          if (!videos[i].paused && videos[i] !== (e.target || e.srcElement)) {
            videos[i].pause();
          }
        }

        Utils.trackEvent('play', 'video');
      }.bind(this));

      return domFrag;
    }

    function _buildAssets() {
      var ids = model.assets.trim().split(',');
      var domFrag = document.createDocumentFragment();

      ids.forEach(function(id) {
        var assetElm = _getAssetContent(id);
        if (assetElm) {
          domFrag.appendChild(assetElm);
        }
      });

      var assetContainer = el.querySelector('.chapter_copy');
      assetContainer.appendChild(domFrag);
    }

    function _getAssetContent(id) {
      var type = id.split('_')[0];
      switch (type) {
        case 'copy':
          return _buildCopyAsset(id);
          break;
        case 'image':
          return _buildImageAsset(id);
          break;
        case 'video':
          return _buildVideoAsset(id);
          break;
      }
    }

    function _getAssetData(id, data) {
      return data.filter(function(el) {
        return el.assetid.trim() === id;
      })[0];
    }

    function _handleScroll() {
      //Check waypoints
      waypoints.forEach(function(waypoint) { waypoint(); });

      // Check chapter position
      var boundingBox = el.getBoundingClientRect();

      if (boundingBox.top - NavigationView.getHeight() < 0 &&
        boundingBox.bottom > NavigationView.getHeight())
      {
        if (!el.classList.contains('fixed-background')) {
          _isHidden = false;
          el.classList.add('active');

          if (Config.wide && !(Utils.isMobile || Utils.isIPad ||Utils.isIOS)) {
            el.classList.add('fixed-background');
            _correctBackgroundPosition();
          }

          if (mapElm) {
            mapView.animate();
          }

          PubSub.publish('chapterActive', { id: model.chapterid });
        }

      } else {
        if (!_isHidden) {
          PubSub.publish('chapterDeactivate', { id: model.chapterid });
          el.classList.remove('active');

          if (Config.wide && !(Utils.isMobile || Utils.isIPad ||Utils.isIOS)) {
            el.classList.remove('fixed-background');
            el.style.backgroundPosition = '0 0';
          }
//
          if (mapElm && !(Utils.isMobile || Utils.isIPad ||Utils.isIOS)) {
            //mapElm.setAttribute('style', '');
            mapElm.style.left = '';
            mapElm.style.top = '';
          }

          _isHidden = true;
        }
      }

    }



    function _correctBackgroundPosition() {
      var boundingBox = el.getBoundingClientRect();
      if (!_isHidden && el.classList.contains('fixed-background')) {


        if ('backgroundPosition' in el.style) {
          el.style.backgroundPosition = parseInt(boundingBox.left, 10) + 'px 55px';
        } else {
          el.style.backgroundPositionX = parseInt(boundingBox.left, 10) + 'px';
          el.style.backgroundPositionY = '100px';
        }


        //bgElm.style.backgroundPosition = parseInt(boundingBox.left, 10) + 'px 55px';
//        bgElm.style.left = parseInt(boundingBox.left, 10) + 'px';
//        bgElm.style.right = '55px';
//        bgElm.style.width = Config.width + 'px';


        if (mapElm && Config.wide) {
          mapElm.style.left = boundingBox.left + 'px';
        } else if(mapElm) {
          mapElm.style.left = '0';
        }

        if (photoCreditElm && Config.wide) {
          photoCreditElm.style.left = boundingBox.left + 'px';
        }
      }
    }

    function _addMap() {
      if (mapElm !== false && model.map && typeof model.map === 'string' && model.map.trim().length > 0) {
        mapElm = mapView.render();
        el.insertBefore(mapElm, el.querySelector('.chapter_copy'));
      }
    }

    function _addGradient() {
      var gradImg;
      var backgroundData = _getAssetData(model.background.trim(), DataModel.get('backgrounds'));

//      if (Config.wide) {
        if (backgroundData) {
          gradImg = Utils.getGradientImg(
            backgroundData.gradientwidth,
            backgroundData.gradientcolour,
            backgroundData.gradientstart,
            backgroundData.gradientopacity
          );
        } else {
          gradImg = Utils.getGradientImg();
        }
//      } else {
//        if (backgroundData) {
//          gradImg = Utils.generateOverlay(backgroundData.gradientopacity);
//          gradImg.style.backgroundColor = backgroundData.gradientcolour;
//        } else {
//          gradImg = Utils.generateOverlay();
//        }
//      }

      el.insertBefore(gradImg, el.firstChild);
    }

    function _setBackground() {
      if (model.background && model.background.length > 0) {
        var data = _getAssetData(model.background.trim(), DataModel.get('backgrounds'));

//        bgElm = document.createElement('div');
//        bgElm.classList.add('background_map');
//        el.insertBefore(bgElm, el.firstChild);

        if (data.src) {
          backgroundImg = data.src;
        }

        var targetEl = (Config.wide) ? el : mapElm;
//        var targetEl = (Config.wide) ? bgElm : mapElm;

        if (!targetEl || data === undefined) { return; }

        targetEl.style.backgroundImage = 'url('+ data.src + ')';

        if (data.backgroundcolour !== undefined && data.backgroundcolour.trim().length > 0) {
          el.style.backgroundColor = data.backgroundcolour;
        }

        if (data.credit !== undefined && data.credit.trim().length > 0) {
          photoCreditElm = el.querySelector('.background_credit');
          photoCreditElm.innerHTML = 'Photography &copy; ' + data.credit;
        }
      }
    }

    function _correctImageHeight() {
      for (var key in imgs) {
        var img = imgs[key];
        if (img.aspectRatio && img.el.clientWidth > 0 && img.aspectRatio * img.el.clientWidth > 0 && img.el.height) {
          img.el.height = parseInt(img.aspectRatio * img.el.clientWidth, 10);
        }
      }
    }

    function updateView() {
      if (backgroundImg) {
        if (Config.wide) {
          el.style.backgroundImage = 'url(' + backgroundImg + ')';
          if(mapElm)
            mapElm.style.backgroundImage = 'none';
        } else {
          el.style.backgroundImage = 'none';
          if (mapElm)
            mapElm.style.backgroundImage = 'url(' + backgroundImg + ')';
        }

        _correctBackgroundPosition();
        _handleScroll();
      }
      _correctImageHeight();
    }

    function render() {
      el = Utils.buildDOM(mustache.render(templates.chapter, model)).firstChild;
      _buildAssets();
      _addMap();
      _addGradient();
      _setBackground();
      _correctBackgroundPosition();
      _handleScroll();
      return this;
    }


    function getEl() {
      return el;
    }

    return {
      getEl: getEl,
      render: render,
      checkIfActive: _handleScroll,
      updateView: updateView
    };
  };
});
