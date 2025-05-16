// Globe configuration and initialization
const globe = Globe()(document.getElementById('globeViz'))
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showGraticules(true)
  .polygonCapColor(() => 'rgba(30, 255, 0, 0.6)')
  .polygonStrokeColor(() => '#111')
  .polygonAltitude(() => 0.01)
  .onPolygonClick(handleCountryClick);

// Rotation control
let autoRotate = true;
const rotationSpeed = 1.2;

window.addEventListener('resize', () => {
  const globeContainer = document.getElementById('globeViz');
  globe.width(globeContainer.offsetWidth);
  globe.height(globeContainer.offsetHeight);
});

function toggleInfoPanel(show) {
  const infoPanel = document.getElementById('info-panel');
  const globe = document.getElementById('globeViz');

  if (show) {
    infoPanel.style.display = 'block';
    globe.classList.remove('fullscreen-globe');
  } else {
    infoPanel.style.display = 'none';
    globe.classList.add('fullscreen-globe');
  }
}

function initGlobeRotation() {
  const controls = globe.controls();
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = rotationSpeed;
}

function toggleRotation() {
  autoRotate = !autoRotate;
  globe.controls().autoRotate = autoRotate;
  const btn = document.getElementById('toggle-rotation');
  if (btn) btn.textContent = autoRotate ? '⏸ Pause Rotation' : '▶ Resume Rotation';
}

// Load country shapes
async function loadCountryData() {
  try {
    const res = await fetch('https://unpkg.com/world-atlas/countries-110m.json');
    const atlas = await res.json();
    const features = topojson.feature(atlas, atlas.objects.countries).features;
    globe.polygonsData(features);
  } catch (e) {
    console.error('Error loading country shapes:', e);
  }
}

// API keys
const OPENWEATHER_KEY = '2adf24789e34ea9ee195d76408780f86';
const EXCHANGE_KEY = 'a1fa6db5799747e38b4c53a8f43e2c67';

// Helpers
const fetchJSON = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.error('Fetch error:', e);
    return null;
  }
};

const getEl = (id) => document.getElementById(id);
const setText = (id, text) => {
  const el = getEl(id);
  if (el) el.textContent = text;
};

// External data fetchers
async function fetchWeather(city, code) {
  // Skip the API call if city is invalid or Antarctica
  if (!city || city === 'None' || code === 'AQ') {
    return 'Data not available for this region';
  }
  
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city},${code}&appid=${OPENWEATHER_KEY}&units=metric`;
  try {
    const data = await fetchJSON(url);
    return data ? `${data.main.temp}°C, ${data.weather[0].description}` : 'Unavailable';
  } catch (error) {
    console.warn(`Weather data unavailable for ${city}, ${code}`);
    return 'Weather data unavailable';
  }
}

async function fetchRates() {
  const url = `https://openexchangerates.org/api/latest.json?app_id=${EXCHANGE_KEY}`;
  const data = await fetchJSON(url);
  return data?.rates || {};
}

// Time formatting using Intl
function formatTime(timezone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: timezone, timeZoneName: 'short'
    }).format(new Date());
  } catch (e) {
    console.error('Time format error:', e);
    return 'N/A';
  }
}

// Wikipedia summary
async function fetchWikipedia(title) {
  if (!title) return 'No summary available.';
  
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const data = await fetchJSON(url);
    return data?.extract || 'No summary available.';
  } catch (error) {
    console.warn(`Wikipedia data unavailable for ${title}`);
    return 'Wikipedia information unavailable';
  }
}

// Update UI
async function updateCountryInfo({ name, capital, population, flags, cca2, currencies }) {
  setText('country-name', name?.common || 'Unknown Region');
  setText('country-code', cca2 || 'N/A');
  setText('population', population?.toLocaleString() || 'N/A');
  setText('capital', capital?.[0] || 'N/A');

  const flag = getEl('country-flag');
  if (flag && flags?.png) {
    flag.src = flags.png;
    flag.alt = `Flag of ${name?.common || 'Selected Region'}`;
    flag.style.display = 'block';
  } else if (flag) {
    flag.style.display = 'none';
  }

  const meta = (typeof countryMetadata !== 'undefined' && Array.isArray(countryMetadata))
    ? countryMetadata.find(c => c.cca2 === cca2) || {}
    : {};

  try {
    // Use Promise.allSettled to ensure all promises complete regardless of success/failure
    const [summaryResult, weatherResult, ratesResult] = await Promise.allSettled([
      fetchWikipedia(name?.common),
      capital?.[0] ? fetchWeather(capital[0], cca2) : Promise.resolve('N/A'),
      fetchRates()
    ]);

    setText('wikipedia-summary', summaryResult.status === 'fulfilled' ? summaryResult.value : 'Summary unavailable');
    setText('temperature', weatherResult.status === 'fulfilled' ? weatherResult.value : 'Weather data unavailable');

    const rates = ratesResult.status === 'fulfilled' ? ratesResult.value : {};
    const currencyCode = Object.keys(currencies || {})[0] || '';
    const currencyName = currencies?.[currencyCode]?.name || 'N/A';
    setText('currency-name', `${currencyName}${currencyCode ? ` (${currencyCode})` : ''}`);

    const rate = rates[currencyCode];
    setText('exchange-rate-usd', rate ? `1 ${currencyCode} = ${(1 / rate).toFixed(4)} USD` : 'N/A');
  } catch (error) {
    console.error('Error updating country information:', error);
    setText('wikipedia-summary', 'Information temporarily unavailable');
    setText('temperature', 'Weather data unavailable');
    setText('currency-name', 'N/A');
    setText('exchange-rate-usd', 'N/A');
  }

  const map = getEl('country-map');
  if (map && name?.common) {
    map.src = `https://maps.google.com/maps?q=${encodeURIComponent(name.common)}&z=5&output=embed`;
  } else if (map) {
    map.src = 'about:blank';
  }

  setText('national-animal', meta?.nationalAnimal || 'N/A');
  setText('national-dish', meta?.nationalDish || 'N/A');
  setText('national-tree', meta?.nationalTree || 'N/A');
  setText('national-bird', meta?.nationalBird || 'N/A');
  setText('national-flower', meta?.nationalFlower || 'N/A');

  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (meta?.timezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: meta.timezone }); // validate
      timezone = meta.timezone;
    } catch (e) {
      console.warn('Invalid time zone:', meta.timezone);
    }
  }
  setText('current-time', formatTime(timezone));
  setText('localTime', formatTime(timezone));

  setText('tourist-spots', (meta?.touristSpots || []).join(', ') || 'N/A');
}

// Handle polygon click
async function handleCountryClick(polygon) {
  const panel = getEl('info-panel');
  if (!panel) return;
  panel.style.display = 'block';

  // Special handling for Antarctica
  if (polygon.properties?.name === 'Antarctica') {
    updateCountryInfo({
      name: { common: 'Antarctica' },
      capital: null, // No capital for Antarctica
      population: 1000, // Approximate research station population
      flags: { png: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/True_South_Antarctica_Flag.svg/320px-True_South_Antarctica_Flag.svg.png' },
      cca2: 'AQ',
      currencies: {} // No official currency
    });
    
    document.body.classList.add('globe-right-layout');
    return;
  }

  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${polygon.id}`);
    
    if (!res.ok) {
      throw new Error(`Country API error: ${res.status}`);
    }
    
    const [countryData] = await res.json();
    if (countryData) {
      await updateCountryInfo(countryData);
    } else {
      throw new Error('No data returned from countries API');
    }
  } catch (e) {
    console.error('Country fetch error:', e);
    setText('country-name', 'Data unavailable');
    setText('wikipedia-summary', 'Information not available for this region');
  }

  document.body.classList.add('globe-right-layout');
    
  // Show the info panel
  const infoPanel = document.getElementById('info-panel');
  infoPanel.style.display = 'block';
}

// Function to handle going back to the globe view
function hideInfoPanel() {
  // Remove the "globe-right-layout" class from the body
  document.body.classList.remove('globe-right-layout');
  
  // Hide the info panel
  const infoPanel = document.getElementById('info-panel');
  if (infoPanel) infoPanel.style.display = 'none';
}

// Make hideInfoPanel accessible globally
window.hideInfoPanel = hideInfoPanel;

function init() {
  initGlobeRotation();
  loadCountryData();
  
  const rotationButton = document.getElementById('toggle-rotation');
  if (rotationButton) {
    rotationButton.addEventListener('click', toggleRotation);
  }
  
  const backArrow = document.getElementById('back-arrow');
  if (backArrow) {
    backArrow.addEventListener('click', hideInfoPanel);
  }
  
  console.log('3D Globe initialized.');
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideInfoPanel();
});