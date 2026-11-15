// Cross-fade through the photos listed in data-photos; tap a photo to skip ahead.
(function () {
  var wrap = document.querySelector('.slideshow');
  var srcs = (wrap.dataset.photos || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (srcs.length < 2) return;
  var first = wrap.querySelector('img');
  var imgs = [first].concat(srcs.slice(1).map(function (src) {
    var im = new Image(); im.className = 'hero slide'; im.dataset.src = src; im.alt = '';
    wrap.appendChild(im); return im;
  }));
  first.classList.add('slide', 'on');
  var i = 0, timer;
  function load(k) { var im = imgs[k % imgs.length]; if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } }
  function show(n) {
    imgs[i].classList.remove('on'); i = (n + imgs.length) % imgs.length;
    load(i); imgs[i].classList.add('on'); load(i + 1);   // fetch the next photo ahead of time
  }
  load(1);
  function start() { clearInterval(timer); timer = setInterval(function () { show(i + 1); }, 5000); }
  wrap.addEventListener('click', function () { show(i + 1); start(); });
  start();
})();
