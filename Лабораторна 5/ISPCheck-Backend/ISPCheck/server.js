'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (error) {
    error.message = `Не вдалося прочитати JSON-базу ${DB_PATH}: ${error.message}`;
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('uk-UA');
}

function includesQuery(value, query) {
  return !query || normalize(value).includes(normalize(query));
}

function findById(items, id) {
  return items.find((item) => item.id === id);
}

function averageCenter(items, fallback = { lat: 50.4388, lng: 30.5988 }) {
  if (!items.length) return fallback;
  const sum = items.reduce((acc, item) => ({
    lat: acc.lat + Number(item.lat),
    lng: acc.lng + Number(item.lng)
  }), { lat: 0, lng: 0 });
  return { lat: sum.lat / items.length, lng: sum.lng / items.length };
}

function routeApi(req, res, url) {
  const db = readDatabase();
  const pathname = url.pathname;
  const q = url.searchParams.get('q') || '';

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Для цього маршруту дозволено лише GET.' });
    return true;
  }

  if (pathname === '/api/address/cities') {
    const items = db.cities
      .filter((city) => includesQuery(city.name, q))
      .map((city) => ({
        id: city.id,
        label: city.region && normalize(city.region) !== normalize(city.name) ? `${city.name} (${city.region})` : city.name,
        name: city.name,
        region: city.region || null,
        lat: city.lat,
        lng: city.lng
      }));
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === '/api/address/streets') {
    const cityId = url.searchParams.get('cityId');
    if (!cityId) {
      sendJson(res, 400, { error: 'city_id_required', message: 'Параметр cityId є обов’язковим.' });
      return true;
    }
    const city = findById(db.cities, cityId);
    if (!city) {
      sendJson(res, 404, { error: 'city_not_found', message: 'Місто не знайдено.' });
      return true;
    }
    const items = db.streets
      .filter((street) => street.cityId === cityId && includesQuery(street.name, q))
      .map((street) => ({ id: street.id, label: street.name, cityId: street.cityId }));
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === '/api/address/buildings') {
    const streetId = url.searchParams.get('streetId');
    if (!streetId) {
      sendJson(res, 400, { error: 'street_id_required', message: 'Параметр streetId є обов’язковим.' });
      return true;
    }
    if (!findById(db.streets, streetId)) {
      sendJson(res, 404, { error: 'street_not_found', message: 'Вулицю не знайдено.' });
      return true;
    }
    const items = db.buildings
      .filter((building) => building.streetId === streetId && includesQuery(building.houseNumber, q))
      .map((building) => ({
        id: building.id,
        label: building.houseNumber,
        lat: building.lat,
        lng: building.lng
      }));
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === '/api/address/entrances') {
    const buildingId = url.searchParams.get('buildingId');
    if (!buildingId) {
      sendJson(res, 400, { error: 'building_id_required', message: 'Параметр buildingId є обов’язковим.' });
      return true;
    }
    if (!findById(db.buildings, buildingId)) {
      sendJson(res, 404, { error: 'building_not_found', message: 'Будинок не знайдено.' });
      return true;
    }
    const items = db.entrances
      .filter((entrance) => entrance.buildingId === buildingId && includesQuery(entrance.number, q))
      .map((entrance) => ({ id: entrance.id, label: entrance.number, buildingId: entrance.buildingId }));
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === '/api/providers/suggest') {
    const providers = db.providers
      .filter((provider) => includesQuery(provider.name, q))
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        slug: provider.slug || null,
        connectionTypes: provider.supportedConnectionTypes || [],
        maxSpeedMbps: provider.maxAvailableSpeedMbps ?? null
      }));
    sendJson(res, 200, { providers });
    return true;
  }

  if (pathname === '/api/meta/filters') {
    const connectionTypes = [...new Set(db.coverageOffers.map((offer) => offer.connectionType))].sort();
    const speedValues = [...new Set(db.coverageOffers.map((offer) => Number(offer.maxSpeedMbps)))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    sendJson(res, 200, { connectionTypes, speedValues, energyIndependentAvailable: db.coverageOffers.some((offer) => offer.energyIndependent === true) });
    return true;
  }

  if (pathname === '/api/map/providers') {
    const cityId = url.searchParams.get('cityId');
    const streetId = url.searchParams.get('streetId');
    const buildingId = url.searchParams.get('buildingId');
    const entranceId = url.searchParams.get('entranceId');
    const providerId = url.searchParams.get('providerId');
    const providerName = url.searchParams.get('providerName');
    const connectionType = url.searchParams.get('connectionType');
    const minSpeedRaw = url.searchParams.get('minMaxSpeedMbps');
    const energyIndependent = url.searchParams.get('energyIndependent');

    const isAddressMode = Boolean(cityId || streetId || buildingId || entranceId);
    const isProviderMode = Boolean(providerId || providerName);
    if (isAddressMode === isProviderMode) {
      sendJson(res, 400, {
        error: 'search_mode_required',
        message: 'Передайте параметри адреси або providerId/providerName (лише один режим за запит).'
      });
      return true;
    }

    let minSpeed = null;
    if (minSpeedRaw !== null && minSpeedRaw !== '') {
      minSpeed = Number(minSpeedRaw);
      if (!Number.isInteger(minSpeed) || minSpeed < 0) {
        sendJson(res, 400, { error: 'invalid_speed', message: 'minMaxSpeedMbps має бути невід’ємним цілим числом.' });
        return true;
      }
    }

    const selectedEntrance = entranceId ? findById(db.entrances, entranceId) : null;
    const selectedBuilding = buildingId ? findById(db.buildings, buildingId) : null;
    const selectedStreet = streetId ? findById(db.streets, streetId) : null;
    const selectedCity = cityId ? findById(db.cities, cityId) : null;

    if (entranceId && !selectedEntrance) {
      sendJson(res, 404, { error: 'entrance_not_found', message: 'Під’їзд не знайдено.' });
      return true;
    }
    if (buildingId && !selectedBuilding) {
      sendJson(res, 404, { error: 'building_not_found', message: 'Будинок не знайдено.' });
      return true;
    }
    if (streetId && !selectedStreet) {
      sendJson(res, 404, { error: 'street_not_found', message: 'Вулицю не знайдено.' });
      return true;
    }
    if (cityId && !selectedCity) {
      sendJson(res, 404, { error: 'city_not_found', message: 'Місто не знайдено.' });
      return true;
    }
    if ((selectedStreet && cityId && selectedStreet.cityId !== cityId) ||
        (selectedBuilding && streetId && selectedBuilding.streetId !== streetId) ||
        (selectedBuilding && cityId && selectedBuilding.cityId !== cityId) ||
        (selectedEntrance && buildingId && selectedEntrance.buildingId !== buildingId) ||
        (selectedEntrance && selectedStreet && findById(db.buildings, selectedEntrance.buildingId)?.streetId !== streetId)) {
      sendJson(res, 400, { error: 'address_hierarchy_mismatch', message: 'Передані ідентифікатори не належать одній адресі.' });
      return true;
    }
    if (providerId && !findById(db.providers, providerId)) {
      sendJson(res, 404, { error: 'provider_not_found', message: 'Провайдера не знайдено.' });
      return true;
    }

    let offers = db.coverageOffers.slice();
    if (isAddressMode) {
      if (cityId) offers = offers.filter((offer) => offer.cityId === cityId);
      if (streetId) offers = offers.filter((offer) => offer.streetId === streetId);
      if (buildingId) offers = offers.filter((offer) => offer.buildingId === buildingId);
      // Пропозиція з entranceId=null діє для всього будинку.
      if (entranceId) {
        offers = offers.filter((offer) => offer.buildingId === selectedEntrance.buildingId &&
          (!offer.entranceId || offer.entranceId === entranceId));
      }
    } else {
      if (providerId) offers = offers.filter((offer) => offer.providerId === providerId);
      if (providerName) offers = offers.filter((offer) => {
        const provider = findById(db.providers, offer.providerId);
        return provider && normalize(provider.name).includes(normalize(providerName));
      });
    }

    if (connectionType) offers = offers.filter((offer) => normalize(offer.connectionType) === normalize(connectionType));
    if (minSpeed !== null) offers = offers.filter((offer) => Number(offer.maxSpeedMbps) >= minSpeed);
    if (energyIndependent === 'true' || energyIndependent === '1') {
      offers = offers.filter((offer) => offer.energyIndependent === true);
    }

    const items = offers.map((offer) => {
      const provider = findById(db.providers, offer.providerId);
      const building = findById(db.buildings, offer.buildingId);
      const street = building ? findById(db.streets, building.streetId) : null;
      const city = building ? findById(db.cities, building.cityId) : null;
      return {
        coverageId: offer.id,
        providerId: offer.providerId,
        providerName: provider ? provider.name : 'Невідомий провайдер',
        address: building && street && city ? `${street.name}, ${building.houseNumber}, ${city.name}` : null,
        lat: offer.lat,
        lng: offer.lng,
        connectionType: offer.connectionType,
        maxSpeedMbps: offer.maxSpeedMbps,
        energyIndependent: offer.energyIndependent === true,
        buildingId: offer.buildingId,
        entranceId: offer.entranceId || null
      };
    });

    let fallbackCenter = { lat: 50.4388, lng: 30.5988 };
    if (buildingId) {
      const building = findById(db.buildings, buildingId);
      fallbackCenter = { lat: building.lat, lng: building.lng };
    } else if (cityId) {
      const city = findById(db.cities, cityId);
      fallbackCenter = { lat: city.lat, lng: city.lng };
    } else if (streetId) {
      const streetBuildings = db.buildings.filter((building) => building.streetId === streetId);
      fallbackCenter = averageCenter(streetBuildings);
    }

    sendJson(res, 200, { center: averageCenter(items, fallbackCenter), items });
    return true;
  }

  const providerMatch = pathname.match(/^\/api\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = decodeURIComponent(providerMatch[1]);
    const provider = findById(db.providers, providerId);
    if (!provider) {
      sendJson(res, 404, { error: 'provider_not_found', message: 'Провайдера не знайдено.' });
      return true;
    }
    sendJson(res, 200, {
      id: provider.id,
      name: provider.name,
      description: provider.description || null,
      website: provider.website || null,
      phone: provider.phone || null,
      connectionTypes: provider.supportedConnectionTypes || [],
      maxSpeedMbps: provider.maxAvailableSpeedMbps ?? null
    });
    return true;
  }

  return false;
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Дозволено лише GET та HEAD.' });
    return;
  }

  let requestedPath = decodeURIComponent(url.pathname);
  if (requestedPath === '/') requestedPath = '/index.html';
  const normalizedPath = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.resolve(ROOT, `.${normalizedPath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== ROOT) {
    sendJson(res, 403, { error: 'forbidden', message: 'Доступ до цього шляху заборонено.' });
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendJson(res, 404, { error: 'not_found', message: 'Файл не знайдено.' });
      return;
    }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Некоректна адреса запиту.' });
    return;
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      if (!routeApi(req, res, url)) {
        sendJson(res, 404, { error: 'api_route_not_found', message: 'API-маршрут не знайдено.' });
      }
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_server_error', message: 'Внутрішня помилка сервера.' });
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, () => {
  console.log(`ISPCheck запущено: http://localhost:${PORT}`);
  console.log(`JSON-база: ${DB_PATH}`);
});
