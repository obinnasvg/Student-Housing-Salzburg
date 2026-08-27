

'use strict';

/* --------------------------------------------------------------------------
   1. CONFIGURATION
   -------------------------------------------------------------------------- */
const CONFIG = {
  dataUrl:        'data/dorms.geojson',
  campusesUrl:    'data/campuses.geojson',
  centre:         [47.7960, 13.0560],
  zoom:           12,
  walkKmh:        4.8,
  storageKey:     'shf.reviews.v1'
};

/* --------------------------------------------------------------------------
   2. STATE
   -------------------------------------------------------------------------- */
const state = {
  dorms:    [],
  markers:  {},
  campuses: [],
  current:  null,
  rating:   0,
  measure:  { on: false, from: null, name: '' }
};

/* --------------------------------------------------------------------------
   3. ELEMENTS
   -------------------------------------------------------------------------- */
const el = {
  list:        document.getElementById('dormList'),
  count:       document.getElementById('indexCount'),
  search:      document.getElementById('dormSearch'),
  factCount:   document.getElementById('factCount'),
  factRent:    document.getElementById('factRent'),
  factOps:     document.getElementById('factOperators'),

  record:      document.getElementById('record'),
  recordClose: document.getElementById('recordClose'),
  plate:       document.getElementById('recordPlate'),
  recIndex:    document.getElementById('recordIndex'),
  recName:     document.getElementById('recordName'),
  recOperator: document.getElementById('recordOperator'),
  spec:        document.getElementById('recordSpec'),
  recText:     document.getElementById('recordDescription'),
  btnMeasure:  document.getElementById('btnMeasure'),
  btnWebsite:  document.getElementById('btnWebsite'),

  reviewList:  document.getElementById('reviewList'),
  reviewScore: document.getElementById('reviewScore'),
  reviewForm:  document.getElementById('reviewForm'),
  reviewText:  document.getElementById('reviewText'),
  ratingInput: document.getElementById('ratingInput'),
  trap:        document.getElementById('trapField'),

  measureBar:  document.getElementById('measureBar'),
  measureText: document.getElementById('measureText'),
  measureStop: document.getElementById('measureCancel'),

  toast:       document.getElementById('toast')
};

/* --------------------------------------------------------------------------
   4. MAP
   -------------------------------------------------------------------------- */
const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

const imagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Imagery &copy; Esri and contributors' }
);

const map = L.map('map', {
  center: CONFIG.centre,
  zoom: CONFIG.zoom,
  layers: [streets],
  zoomControl: true
});

/* Campus reference points, switchable from the layer control. Loaded from
   its own GeoJSON file so it can be edited without touching app.js. */
const campusLayer = L.layerGroup();
campusLayer.addTo(map);

fetch(CONFIG.campusesUrl)
  .then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  })
  .then(function (geojson) {
    (geojson.features || []).forEach(function (feature) {
      const latlng = latLngOf(feature);
      state.campuses.push({ name: feature.properties.name, latlng: latlng });

      L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: '<div class="pin-campus"><svg class="pin-campus__icon" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M12 3 1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      })
        .bindPopup('<div class="pop"><p class="pop__no">Campus</p>' +
                   '<p class="pop__name">' + escapeHtml(feature.properties.name) + '</p></div>')
        .addTo(campusLayer);
    });
  })
  .catch(function (error) {
    console.error('Could not load ' + CONFIG.campusesUrl, error);
  });

L.control.layers(
  { 'Street map': streets, 'Aerial imagery': imagery },
  { 'Campus locations': campusLayer },
  { position: 'topright' }
).addTo(map);

L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

/* Reset view */
const ResetView = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', '', bar);
    link.href = '#';
    link.title = 'Reset the view';
    link.setAttribute('role', 'button');
    link.textContent = '⌂';
    L.DomEvent.on(link, 'click', function (e) {
      L.DomEvent.stop(e);
      map.flyTo(CONFIG.centre, CONFIG.zoom);
    });
    return bar;
  }
});
map.addControl(new ResetView());

/* Place search. While measuring, a result becomes the destination. */
L.Control.geocoder({
  position: 'topright',
  placeholder: 'Search a place',
  defaultMarkGeocode: false
})
  .on('markgeocode', function (e) {
    const centre = e.geocode.center;
    if (state.measure.on) {
      completeMeasure(centre, e.geocode.name);
    } else {
      map.flyTo(centre, 16);
      L.popup()
        .setLatLng(centre)
        .setContent('<div class="pop"><p class="pop__name">' +
                    escapeHtml(e.geocode.name) + '</p></div>')
        .openOn(map);
    }
  })
  .addTo(map);

const cluster = L.markerClusterGroup({
  maxClusterRadius: 44,
  showCoverageOnHover: false
});
map.addLayer(cluster);

const measureLayer = L.layerGroup().addTo(map);

/* --------------------------------------------------------------------------
   5. DATA
   -------------------------------------------------------------------------- */
fetch(CONFIG.dataUrl)
  .then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  })
  .then(function (geojson) { start(geojson.features || []); })
  .catch(function (error) {
    console.error('Could not load ' + CONFIG.dataUrl, error);
    el.count.textContent = 'Not available';
    el.list.innerHTML =
      '<li class="index__empty">The accommodation data could not be loaded. ' +
      'Check your connection and reload the page.</li>';
  });

function start(features) {
  state.dorms = features.map(function (feature, i) {
    feature.properties.no = pad(i + 1);
    return feature;
  });

  state.dorms.forEach(addMarker);
  renderIndex(state.dorms);

  const priced = state.dorms
    .map(function (f) { return f.properties.fee_min; })
    .filter(function (value) { return typeof value === 'number'; });

  const operators = state.dorms.reduce(function (set, f) {
    if (f.properties.operator) set[f.properties.operator] = true;
    return set;
  }, {});

  el.factCount.textContent = state.dorms.length;
  el.factRent.textContent  = priced.length
    ? '€' + Math.round(Math.min.apply(null, priced))
    : '—';
  el.factOps.textContent   = Object.keys(operators).length;
}

/* --------------------------------------------------------------------------
   6. MARKERS
   -------------------------------------------------------------------------- */
function addMarker(feature) {
  const p = feature.properties;

  const marker = L.marker(latLngOf(feature), {
    icon: L.divIcon({
      className: '',
      html: '<div class="pin"><svg class="pin__icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 2.6 1.6 11.2h3.1V21h6V14.4h2.6V21h6v-9.8h3.1z"/></svg></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    })
  });

  marker.bindPopup(popupHtml(feature), { maxWidth: 240 });
  marker.on('popupopen', function () {
    const button = document.querySelector('.pop__open');
    if (button) button.onclick = function () { openRecord(feature); };
    markActive(p.id);
  });

  state.markers[p.id] = marker;
  cluster.addLayer(marker);
}

function popupHtml(feature) {
  const p = feature.properties;
  return '<div class="pop">' +
    '<p class="pop__no">' + escapeHtml(p.locality || '') + '</p>' +
    '<p class="pop__name">' + escapeHtml(p.name) + '</p>' +
    '<p class="pop__rent">' + feeLabel(p) + '</p>' +
    '<button class="pop__open" type="button">Open record</button>' +
    '</div>';
}

/* --------------------------------------------------------------------------
   7. INDEX AND SEARCH
   -------------------------------------------------------------------------- */
function renderIndex(features) {
  el.list.innerHTML = '';

  if (!features.length) {
    el.list.innerHTML = '<li class="index__empty">Nothing matches that search. ' +
                        'Clear the field to see every residence.</li>';
    el.count.textContent = 'No results';
    return;
  }

  features.forEach(function (feature) {
    const p = feature.properties;
    const item = document.createElement('li');
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'entry';
    button.dataset.id = p.id;
    button.innerHTML =
      '<span class="entry__no">' + p.no + '</span>' +
      '<span>' +
        '<span class="entry__name">' + escapeHtml(p.name) + '</span>' +
        '<span class="entry__meta">' +
          escapeHtml(p.type) + ' · ' + escapeHtml(p.locality || '') + '<br>' +
          '<span class="entry__rent">' + feeLabel(p) + '</span>' +
        '</span>' +
      '</span>';

    button.addEventListener('click', function () { focusDorm(feature); });
    item.appendChild(button);
    el.list.appendChild(item);
  });

  el.count.textContent = features.length +
    (features.length === 1 ? ' residence' : ' residences');
}

el.search.addEventListener('input', function (event) {
  const query = event.target.value.trim().toLowerCase();

  const hits = state.dorms.filter(function (feature) {
    const p = feature.properties;
    return !query ||
      p.name.toLowerCase().indexOf(query) > -1 ||
      (p.operator || '').toLowerCase().indexOf(query) > -1 ||
      (p.type || '').toLowerCase().indexOf(query) > -1 ||
      (p.locality || '').toLowerCase().indexOf(query) > -1;
  });

  renderIndex(hits);
  cluster.clearLayers();
  hits.forEach(function (feature) {
    cluster.addLayer(state.markers[feature.properties.id]);
  });
});

function focusDorm(feature) {
  const marker = state.markers[feature.properties.id];
  map.flyTo(latLngOf(feature), 16);
  cluster.zoomToShowLayer(marker, function () { marker.openPopup(); });
  markActive(feature.properties.id);
  openRecord(feature);
}

function markActive(id) {
  el.list.querySelectorAll('.entry').forEach(function (button) {
    button.setAttribute('aria-current', String(button.dataset.id) === String(id));
  });
  document.querySelectorAll('.pin').forEach(function (pin) {
    pin.classList.remove('pin--active');
  });
  const marker = state.markers[id];
  if (marker && marker._icon) {
    const pin = marker._icon.querySelector('.pin');
    if (pin) pin.classList.add('pin--active');
  }
}

/* --------------------------------------------------------------------------
   8. RECORD PANEL
   -------------------------------------------------------------------------- */
function openRecord(feature) {
  const p = feature.properties;
  state.current = feature;

  el.recIndex.textContent    = 'Residence ' + p.no + ' · ' + (p.locality || '');
  el.recName.textContent     = p.name;
  el.recOperator.textContent = p.operator ? 'Operated by ' + p.operator : '';
  el.recText.textContent     = p.description || '';

  renderPlate(p);

  const nearest = nearestCampus(latLngOf(feature));

  let rows =
    specRow('Rooms', escapeHtml(p.type)) +
    specRow('Rent', feeLabel(p), true) +
    specRow('Nearest campus', escapeHtml(nearest.name) + '<br>' + nearest.label, true);

  if (p.eligibility) rows += specRow('Eligibility', escapeHtml(p.eligibility));

  rows += specRow('Coordinates',
    feature.geometry.coordinates[1].toFixed(5) + ' N, ' +
    feature.geometry.coordinates[0].toFixed(5) + ' E', true);

  el.spec.innerHTML = rows;

  if (p.website) {
    el.btnWebsite.href = p.website;
    el.btnWebsite.classList.remove('is-disabled');
  } else {
    el.btnWebsite.removeAttribute('href');
    el.btnWebsite.classList.add('is-disabled');
  }

  state.rating = 0;
  paintRating();
  el.reviewText.value = '';
  renderReviews();

  el.record.hidden = false;
  el.record.querySelector('.record__scroll').scrollTop = 0;
}

function specRow(label, value, isNumeric) {
  return '<div class="spec__row"><dt>' + label + '</dt>' +
         '<dd class="' + (isNumeric ? 'num' : '') + '">' + value + '</dd></div>';
}

function renderPlate(p) {
  const photos = p.photos || [];
  el.plate.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'plate__cell';

    if (photos[i]) {
      const image = document.createElement('img');
      image.src = photos[i];
      image.alt = p.name + ', photograph ' + (i + 1);
      image.loading = 'lazy';
      image.addEventListener('error', function () {
        cell.className = 'plate__cell plate__cell--empty';
        cell.dataset.label = '';
        cell.innerHTML = '';
      });
      cell.appendChild(image);
    } else {
      cell.className = 'plate__cell plate__cell--empty';
      cell.dataset.label = i === 0 ? 'No photograph' : '';
    }

    el.plate.appendChild(cell);
  }
}

el.recordClose.addEventListener('click', function () {
  el.record.hidden = true;
  state.current = null;
});

/* --------------------------------------------------------------------------
   9. DISTANCE TOOL
   -------------------------------------------------------------------------- */
el.btnMeasure.addEventListener('click', function () {
  if (state.current) beginMeasure(state.current);
});

function beginMeasure(feature) {
  state.measure.on   = true;
  state.measure.from = latLngOf(feature);
  state.measure.name = feature.properties.name;

  measureLayer.clearLayers();
  map.closePopup();
  el.measureText.textContent = 'From ' + feature.properties.name +
                               '. Click a point on the map, or search a place.';
  el.measureBar.classList.add('is-on');
  map.getContainer().style.cursor = 'crosshair';
}

function completeMeasure(destination, destinationName) {
  const from = state.measure.from;
  const metres = from.distanceTo(destination);

  measureLayer.clearLayers();

  L.polyline([from, destination], {
    color: '#367562', weight: 2, dashArray: '6 5'
  }).addTo(measureLayer);

  L.circleMarker(destination, {
    radius: 5, color: '#14181A', weight: 1, fillColor: '#FFFFFF', fillOpacity: 1
  }).addTo(measureLayer);

  const midpoint = L.latLng((from.lat + destination.lat) / 2,
                            (from.lng + destination.lng) / 2);

  L.marker(midpoint, {
    interactive: false,
    icon: L.divIcon({
      className: 'rulertag-icon',
      html: '<div class="rulertag"><b>' + formatDistance(metres) + '</b>' +
            '<span>' + walkLabel(metres) + '</span></div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    })
  }).addTo(measureLayer);

  map.fitBounds(L.latLngBounds([from, destination]).pad(0.35));

  endMeasure(false);
  showToast(destinationName
    ? 'Straight-line distance to ' + destinationName + '.'
    : 'Straight-line distance measured.');
}

function endMeasure(clearDrawing) {
  state.measure.on = false;
  el.measureBar.classList.remove('is-on');
  map.getContainer().style.cursor = '';
  if (clearDrawing !== false) measureLayer.clearLayers();
}

map.on('click', function (event) {
  if (state.measure.on) completeMeasure(event.latlng, null);
});

el.measureStop.addEventListener('click', function () { endMeasure(true); });

document.addEventListener('keydown', function (event) {
  if (event.key !== 'Escape') return;
  if (state.measure.on) endMeasure(true);
  else if (!el.record.hidden) el.recordClose.click();
});

/* --------------------------------------------------------------------------
   10. REVIEWS

   -------------------------------------------------------------------------- */
const store = (function () {
  const memory = {};
  let usable = false;

  try {
    window.localStorage.setItem('__probe', '1');
    window.localStorage.removeItem('__probe');
    usable = true;
  } catch (error) {
    usable = false;
  }

  return {
    persistent: usable,
    read: function () {
      if (!usable) return memory;
      try {
        return JSON.parse(window.localStorage.getItem(CONFIG.storageKey) || '{}');
      } catch (error) {
        return {};
      }
    },
    write: function (data) {
      if (!usable) { Object.assign(memory, data); return; }
      try {
        window.localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
      } catch (error) {
        Object.assign(memory, data);
      }
    }
  };
})();

function reviewsFor(feature) {
  const published = feature.properties.reviews || [];
  const local = store.read()[feature.properties.id] || [];
  return published.concat(local);
}

function renderReviews() {
  const reviews = reviewsFor(state.current);
  el.reviewList.innerHTML = '';

  if (!reviews.length) {
    el.reviewScore.textContent = 'No reviews';
    el.reviewList.innerHTML =
      '<li class="reviews__empty">No reviews yet. If you have lived here, ' +
      'your account will help the next student.</li>';
    return;
  }

  const average = reviews.reduce(function (sum, review) {
    return sum + review.rating;
  }, 0) / reviews.length;

  el.reviewScore.textContent = average.toFixed(1) + ' / 5 · ' + reviews.length +
                               (reviews.length === 1 ? ' review' : ' reviews');

  reviews.slice().reverse().forEach(function (review) {
    const item = document.createElement('li');
    item.className = 'review';
    item.innerHTML =
      '<div class="review__top">' + marksHtml(review.rating) +
      '<span class="review__date">' + escapeHtml(review.date || '') + '</span></div>' +
      '<p>' + escapeHtml(review.comment) + '</p>';
    el.reviewList.appendChild(item);
  });
}

function marksHtml(rating) {
  let html = '<span class="marks" aria-label="' + rating + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    html += '<i class="' + (i <= rating ? 'on' : '') + '"></i>';
  }
  return html + '</span>';
}

for (let i = 1; i <= 5; i++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.value = i;
  button.textContent = i;
  button.setAttribute('aria-label', i + ' out of 5');
  button.addEventListener('click', function () { state.rating = i; paintRating(); });
  el.ratingInput.appendChild(button);
}

function paintRating() {
  el.ratingInput.querySelectorAll('button').forEach(function (button) {
    button.classList.toggle('on', Number(button.dataset.value) <= state.rating);
  });
}

el.reviewForm.addEventListener('submit', function (event) {
  event.preventDefault();
  if (!state.current) return;
  if (el.trap.value) return;                 // honeypot: filled by bots only

  const comment = el.reviewText.value.trim();
  if (!state.rating)      { showToast('Choose a rating from 1 to 5 first.'); return; }
  if (comment.length < 5) { showToast('Add a little more detail to your review.'); return; }

  const all = store.read();
  const id = state.current.properties.id;

  all[id] = (all[id] || []).concat([{
    rating: state.rating,
    comment: comment,
    date: new Date().toISOString().slice(0, 10)
  }]);
  store.write(all);

  el.reviewText.value = '';
  state.rating = 0;
  paintRating();
  renderReviews();

  showToast(store.persistent
    ? 'Review posted. It is kept in this browser.'
    : 'Review posted for this session.');
});

/* --------------------------------------------------------------------------
   11. HELPERS
   -------------------------------------------------------------------------- */
function latLngOf(feature) {
  // GeoJSON stores [longitude, latitude]; Leaflet expects the reverse.
  return L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
}

function money(value) {
  return '€' + (value % 1 === 0 ? value.toFixed(0) : value.toFixed(2));
}

function feeLabel(properties) {
  const min = properties.fee_min;
  const max = properties.fee_max;
  if (typeof min !== 'number' || typeof max !== 'number') return 'Rent on request';
  if (min === max) return money(min) + ' per month';
  return money(min) + '–' + money(max) + ' per month';
}

function formatDistance(metres) {
  if (metres < 1000)  return Math.round(metres) + ' m';
  if (metres < 20000) return (metres / 1000).toFixed(2) + ' km';
  return Math.round(metres / 1000) + ' km';
}

function walkLabel(metres) {
  const minutes = Math.round((metres / 1000 / CONFIG.walkKmh) * 60);
  if (minutes > 90) return 'straight line';
  return 'about ' + Math.max(1, minutes) + ' min on foot';
}

function nearestCampus(latlng) {
  let best = null;
  state.campuses.forEach(function (campus) {
    const metres = latlng.distanceTo(campus.latlng);
    if (!best || metres < best.metres) best = { name: campus.name, metres: metres };
  });
  if (!best) return { name: '—', label: 'Campus data unavailable' };
  return {
    name: best.name,
    label: formatDistance(best.metres) + ' · ' + walkLabel(best.metres)
  };
}

function pad(number) {
  return number < 10 ? '0' + number : String(number);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character];
  });
}

let toastTimer;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.toast.classList.remove('is-on');
  }, 3200);
}
