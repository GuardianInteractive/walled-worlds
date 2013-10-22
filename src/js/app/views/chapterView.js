define(['mustache', 'app/views/mapView', 'app/views/navigationView', 'templates', 'app/utils/utils', 'app/models/data', 'PubSub', 'marked'],
  function(mustache, MapView, NavigationView, templates, Utils, DataModel, PubSub, marked)
{
  return function(chapterData) {

    var el = document.createElement('div');
    var model = chapterData;
    var mapView = new MapView(model);
    var mapElm;
    var _isHidden = false;

    marked.setOptions({ smartypants: true });

    function _buildCopyAsset(id) {
      var data = _getAssetData(id, DataModel.get('copy'));
      var templateData = {
        assetid: data.assetid,
        content: marked(data.content)
      };
      var html = mustache.render(templates.chapter_asset_copy, templateData);
      return Utils.buildDOM(html);
    }

    function _buildImageAsset(id) {
      var data = _getAssetData(id, DataModel.get('images'));
      var html = mustache.render(templates.chapter_asset_image, data);
      var domFrag = Utils.buildDOM(html);

      if (data.hasOwnProperty('marker') && data.marker === 'TRUE') {
        _addWaypoint(domFrag.firstChild, id);
      }

      return domFrag;
    }

    function _addWaypoint(el,ID) {
      Utils.on(window, 'scroll', checkScroll);

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
      var data = _getAssetData(id, DataModel.get('videos'));
      var html = mustache.render(templates.chapter_asset_video, data);
      return Utils.buildDOM(html);
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
      var boundingBox = el.getBoundingClientRect();

      if (boundingBox.top - NavigationView.getHeight() < 0 && boundingBox.bottom > 0) {
        if (!el.classList.contains('fixed-background')) {
          _isHidden = false;
          el.classList.add('fixed-background');
          _correctBackgroundPosition();

          if (mapElm) {
            mapElm.style.position = 'fixed';
            mapView.animate();
          }

          PubSub.publish('chapterActive', { id: model.chapterid });
        }

      } else {
        if (!_isHidden) {
          PubSub.publish('chapterDeactivate', { id: model.chapterid });
          el.classList.remove('fixed-background');
          el.style.backgroundPosition = '0 0';
          if (mapElm) {
            mapElm.setAttribute('style', '');
          }
          _isHidden = true;
        }
      }
    }

    function _correctBackgroundPosition() {
      var boundingBox = el.getBoundingClientRect();
      if (!_isHidden) {
        el.style.backgroundPosition = boundingBox.left + 'px 3.4rem';
        if (mapElm) {
          mapElm.style.left = boundingBox.left + 'px';
        }
      }
    }

    function _addMap() {
      mapElm = mapView.render();
      if (mapElm) {
        el.appendChild(mapElm);
      }
    }

    function _addGradient() {
      var backgroundData = _getAssetData(model.background.trim(), DataModel.get('backgrounds'));
      if (backgroundData) {
        var gradImg = Utils.getGradientImg(
          backgroundData.gradientwidth,
          backgroundData.gradientcolour,
          backgroundData.gradientstart,
          backgroundData.gradientopacity
        );
      } else {
        var gradImg = Utils.getGradientImg();
      }

      el.insertBefore(gradImg, el.firstChild);
    }

    function _setBackground() {
      if (model.background && model.background.length > 0) {
        var data = _getAssetData(model.background.trim(), DataModel.get('backgrounds'));
        if (data.src) {
          el.style.backgroundImage = 'url('+ data.src + ')';
        }

        if (data.backgroundcolour !== undefined && data.backgroundcolour.trim().length > 0) {
          el.style.backgroundColor = data.backgroundcolour;
        }
      }
    }

    function render() {
      el = Utils.buildDOM(mustache.render(templates.chapter, model)).firstChild;
      _setBackground();
      _buildAssets();
      _addMap();
      _addGradient();

      Utils.on(window, 'scroll', _handleScroll);
      Utils.on(window, 'resize', _correctBackgroundPosition);

      return this;
    }

    function getEl() {
      return el;
    }


    return {
      getEl: getEl,
      render: render
    };
  };
});
