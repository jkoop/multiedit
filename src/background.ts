/**
 * background.js (c) 2023 Joe Koop
 * License: GPLv2
 * @link https://joekoop.com/js/background.js
 * type="module"
 */

const VERSION = 1;

if (localStorage.background_version != VERSION) {
	var canvas = document.createElement('canvas');
	var w = canvas.width = 256;
	var h = canvas.height = 256;
	var context = <CanvasRenderingContext2D>canvas.getContext("2d");

	for (var i = 0; i < w; i++) {
		for (var j = 0; j < h; j++) {
			var n = Math.floor(Math.random() * 16);
			context.fillStyle = `rgb(${n},${n},${n})`;
			context.fillRect(i, j, 1, 1);
		}
	}

	localStorage.background_version = VERSION;
	localStorage.background = canvas.toDataURL();
}

document.body.style.background = `url(${localStorage.background})`;
document.body.style.backgroundSize = '512px';
