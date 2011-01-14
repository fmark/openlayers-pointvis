/*
 * Based on, and a fork of, Bjoern Hoehrmann's OpenLayers Heatmap, copyright 
 * (c) 2010 Bjoern Hoehrmann <http://bjoern.hoehrmann.de/>.
 * This module is licensed under the same terms as OpenLayers itself.
 *
 */

 // START GUNK
 function appendErro(str){
   throw new Error("DEBUG: "+str)
}

function log(str){
   setTimeout("appendErro('"+str+"')", 1)
}
//END GUNK
 
 
IDW = {};

/**
 * Class: IDW.Source
 */
IDW.Source = OpenLayers.Class({

  /** 
   * APIProperty: lonlat
   * {OpenLayers.LonLat} location of the heat source
   */
  lonlat: null,

  /** 
   * APIProperty: val
   * {Number} Heat source value
   */
  val: null,

  /**
   * Constructor: IDW.Source
   * Create a heat source.
   *
   * Parameters:
   * lonlat - {OpenLayers.LonLat} Coordinates of the heat source
   * val - Data value
   */
  initialize: function(lonlat, val) {
    this.lonlat = lonlat;
    this.val = val;
  },

  CLASS_NAME: 'IDW.Source'
});

/**
 * Class: IDW.Layer
 * 
 * Inherits from:
 *  - <OpenLayers.Layer>
 */
IDW.Layer = OpenLayers.Class(OpenLayers.Layer, {

  /** 
   * APIProperty: isBaseLayer 
   * {Boolean} IDW layer is never a base layer.  
   */
  isBaseLayer: false,

  /** 
   * Property: points
   * {Array(<IDW.Source>)} internal coordinate list
   */
  points: null,

  /** 
   * Property: cache
   * {Object} Hashtable with CanvasGradient objects
   */
  cache: null,

  /** 
   * Property: gradient
   * {Array(Number)} RGBA gradient map used to colorize the value map.
   */
  gradient: null,

  /** 
   * Property: canvas
   * {DOMElement} Canvas element.
   */
  canvas: null,

  /**
   * Constructor: IDW.Layer
   * Create a IDW layer.
   *
   * Parameters:
   * name - {String} Name of the Layer
   * options - {Object} Hashtable of extra options to tag onto the layer
   */
  initialize: function(name, options) {
    OpenLayers.Layer.prototype.initialize.apply(this, arguments);
    this.points = [];
    this.cache = {};
	this.maxNeighbours = 12;
	this.power = 2;
	this.pixelSize = 16;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.setGradientStops({
      0.00: 0xffffff00,
      0.10: 0x99e9fdff,
      0.20: 0x00c9fcff,
      0.30: 0x00e9fdff,
      0.30: 0x00a5fcff,
      0.40: 0x0078f2ff,
      0.50: 0x0e53e9ff,
      0.60: 0x4a2cd9ff,
      0.70: 0x890bbfff,
      0.80: 0x99019aff,
      0.90: 0x990664ff,
      0.99: 0x660000ff,
      1.00: 0x000000ff
    });

    // For some reason OpenLayers.Layer.setOpacity assumes there is
    // an additional div between the layer's div and its contents.
    var sub = document.createElement('div');
    sub.appendChild(this.canvas);
    this.div.appendChild(sub);
  },

  /**
   * APIMethod: setGradientStops
   * ...
   *
   * Parameters:
   * stops - {Object} Hashtable with stop position as keys and colors
   *                  as values. Stop positions are numbers between 0
   *                  and 1, color values numbers in 0xRRGGBBAA form.
   */
  setGradientStops: function(stops) {

    // There is no need to perform the linear interpolation manually,
    // it is sufficient to let the canvas implementation do that.

    var ctx = document.createElement('canvas').getContext('2d');
    var grd = ctx.createLinearGradient(0, 0, 256, 0);

    for (var i in stops) {
      grd.addColorStop(i, 'rgba(' +
        ((stops[i] >> 24) & 0xFF) + ',' +
        ((stops[i] >> 16) & 0xFF) + ',' +
        ((stops[i] >>  8) & 0xFF) + ',' +
        ((stops[i] >>  0) & 0xFF) + ')');
    }

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 1);
    this.gradient = ctx.getImageData(0, 0, 256, 1).data;
  },

  /**
   * APIMethod: addSource
   * Adds a heat source to the layer.
   *
   * Parameters:
   * source - {<IDW.Source>} 
   */
  addSource: function(source) {
    this.points.push(source);
  },

  /**
   * APIMethod: removeSource
   * Removes a heat source from the layer.
   * 
   * Parameters:
   * source - {<IDW.Source>} 
   */
  removeSource: function(source) {
    if (this.points && this.points.length) {
      OpenLayers.Util.removeItem(this.points, source);
    }
  },

  /** 
   * Method: moveTo
   *
   * Parameters:
   * bounds - {<OpenLayers.Bounds>} 
   * zoomChanged - {Boolean} 
   * dragging - {Boolean} 
   */
  moveTo: function(bounds, zoomChanged, dragging) {

    OpenLayers.Layer.prototype.moveTo.apply(this, arguments);

    // The code is too slow to update the rendering during dragging.
    if (dragging)
      return;

    // Pick some point on the map and use it to determine the offset
    // between the viewports's 0,0 coordinate and the layer's 0,0 position.
    var someLoc = new OpenLayers.LonLat(0,0);
    var offsetX = this.map.getViewPortPxFromLonLat(someLoc).x -
                  this.map.getLayerPxFromLonLat(someLoc).x;
    var offsetY = this.map.getViewPortPxFromLonLat(someLoc).y -
                  this.map.getLayerPxFromLonLat(someLoc).y;
    this.canvas.width = this.map.getSize().w;
    this.canvas.height = this.map.getSize().h;

    var ctx = this.canvas.getContext('2d');

    ctx.save(); // Workaround for a bug in Google Chrome
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
	
	//calculate the inverse distance weighting
	var start = +new Date();
	var iii = 0;
	var sizex = ((this.canvas.width / this.pixelSize) >> 0) + 1;
	var sizey = ((this.canvas.height / this.pixelSize) >> 0) + 1;
	var matrix = new Array(sizex);
	for (var x = 0; x < sizex; x++){
		matrix[x] = new Array(sizey);
		for (var y = 0; y < sizey; y++){		
			iii++;
			var dists = [];
			var sum_dist = 0;
			// calculate, record and sum the (decayed) distances
			for (var i in this.points){
				var dest = this.points[i];
				var destpos = this.map.getViewPortPxFromLonLat(dest.lonlat);
				var eucdist = Math.pow(x * this.pixelSize - destpos.x, 2) + 
					Math.pow(y * this.pixelSize - destpos.y, 2);
				var dist_decayed = Math.pow(eucdist, -this.power);
				sum_dist += dist_decayed;
				dists.push({dist: dist_decayed, val: dest.val});
			}
			// calculate the inverse distance weight
			matrix[x][y] = 0;
			for (var i = 0, len = dists.length; i < len; i++){
				matrix[x][y] += dists[i].val * dists[i].dist / sum_dist
			}
		}
	}
	var end =  +new Date();
	var diff = end - start;
	log("IDW calculation: " + iii + " iterations, " + (diff / 1000) + " seconds.")
	//write to the canvas, resampling and choosing the appropriate colour
	start = +new Date();
	var dat = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    var pix = dat.data;
	var minx, dx, miny, dy;//bilinear
	for (var x = 0; x < this.canvas.width; x ++){		
		minx = (x / this.pixelSize) >> 0; //bilinear
		dx = (x / this.pixelSize) - minx; //bilinear
		for (var y = 0; y < this.canvas.height; y ++){					
			//If pixelSize > 1 we need to resample our IDX grid to match the canvas size
			//NEAREST NEIGHBOUR (blocky and awful)
			//var pixel_val = matrix[Math.round(x / this.pixelSize)][Math.round(y / this.pixelSize)]
			//BILINEAR (moderately blockly but tolerable)
			miny = ((y / this.pixelSize) >> 0);
			dy = (y / this.pixelSize) - miny;
			var pixel_val = (matrix[minx][miny] * (2 - dx - dy) +
							 matrix[minx][miny + 1] * (1 - dx + dy) +
							 matrix[minx + 1][miny] * (dx + 1 - dy) +
							 matrix[minx + 1][miny + 1] * (dx + dy))
							 / 8;
			
			var idx = (this.canvas.width * y + x) * 4;
			var scaled = pixel_val * 255

			pix[idx] = 0; //scale to a byte, need to improve method
			pix[idx + 1] = 0; //scale to a byte, need to improve method
			pix[idx + 2] = 0; //scale to a byte, need to improve method
			pix[idx + 3] = 255 - scaled; // alpha
		}
	}
	//save the image	
    ctx.putImageData(dat, 0, 0);
	end =  +new Date();
	diff = end - start;
	log("Resampling and writing to canvas: " + (diff / 1000) + " seconds.")

	
    // Unfortunately OpenLayers does not currently support layers that
    // remain in a fixed position with respect to the screen location
    // of the base layer, so this puts this layer manually back into
    // that position using one point's offset as determined earlier.
    this.canvas.style.left = (-offsetX) + 'px';
    this.canvas.style.top = (-offsetY) + 'px';
  },

  /** 
   * APIMethod: getDataExtent
   * Calculates the max extent which includes all of the heat sources.
   * 
   * Returns:
   * {<OpenLayers.Bounds>}
   */
  getDataExtent: function () {
    var maxExtent = null;
        
    if (this.points && (this.points.length > 0)) {
      var maxExtent = new OpenLayers.Bounds();
      for(var i = 0, len = this.points.length; i < len; ++i) {
        var point = this.points[i];
        maxExtent.extend(point.lonlat);
      }
    }
    return maxExtent;
  },

  CLASS_NAME: 'IDW.Layer'

});
