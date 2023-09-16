/**
 * background.js (c) 2023 Joe Koop
 * License: GPLv2
 * this is a stand-alone module that'll add a bit of texture to your background
 * type="module"
 *
 * For a bright theme, set body { background-color: #f8f8f8; }
 * For a dark theme, set body { background-color: #080808; }
 */

const VERSION = 2;

if (localStorage.background_version != VERSION) {
	var canvas = document.createElement('canvas');
	var w = canvas.width = 256;
	var h = canvas.height = 256;
	var context = <CanvasRenderingContext2D>canvas.getContext("2d");

	for (var i = 0; i < w; i++) {
		for (var j = 0; j < h; j++) {
			var n = Math.floor(Math.random() * 256);
			context.fillStyle = `rgb(${n},${n},${n})`;
			context.fillRect(i, j, 1, 1);
		}
	}

	localStorage.background_version = VERSION;
	localStorage.background = canvas.toDataURL();
}

document.body.style.backgroundImage = `url(${localStorage.background})`;
document.body.style.backgroundSize = '512px';
document.body.style.backgroundBlendMode = 'overlay';
