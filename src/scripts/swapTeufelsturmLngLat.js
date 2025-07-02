const fs = require('fs');

const filePath = 'data/teufelsturm/teufelsturm-gps.json';

function swapLngLat() {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let swapped = 0;
  for (const entry of data) {
    if (entry.lng != null && entry.lat != null) {
      const oldLng = entry.lng;
      entry.lng = entry.lat;
      entry.lat = oldLng;
      swapped++;
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Swapped lng/lat for ${swapped} entries in ${filePath}`);
}

swapLngLat(); 