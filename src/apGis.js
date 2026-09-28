export const AP_MANDAL_GEOJSON_URL =
  'https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/AP_Mandals_688/FeatureServer/0/query?where=1%3D1&outFields=district_lgd,district_name,mandal_lgd,mandal_name,revenue_division&returnGeometry=true&outSR=4326&f=geojson';

export async function loadAPMandals() {
  const response = await fetch(AP_MANDAL_GEOJSON_URL);
  if (!response.ok) throw new Error('Andhra Pradesh GIS service is unavailable');
  const geojson = await response.json();
  if (!geojson?.features?.length) throw new Error('No AP mandal features were returned');

  return geojson.features.map((feature, index) => ({
    ...feature,
    id: feature.properties?.mandal_lgd ?? `${feature.properties?.district_name}-${feature.properties?.mandal_name}-${index}`,
    district: feature.properties?.district_name || 'Unknown district',
    districtLgd: feature.properties?.district_lgd,
    mandal: feature.properties?.mandal_name || 'Unknown mandal',
    mandalLgd: feature.properties?.mandal_lgd,
    division: feature.properties?.revenue_division || '',
    center: centroid(feature.geometry),
  }));
}

function centroid(geometry) {
  const points = [];
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push(value);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry?.coordinates);
  if (!points.length) return [17.385, 78.486];
  const lon = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [lat, lon];
}

export function districtsFromMandals(mandals) {
  return [...new Set(mandals.map((m) => m.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function mandalsForDistrict(mandals, district) {
  return mandals.filter((m) => m.district === district).sort((a, b) => a.mandal.localeCompare(b));
}

// A stable prototype vulnerability proxy so every mandal can be rendered immediately.
// Replace with validated census/health/exposure datasets for operational deployment.
export function vulnerabilityProxy(mandal) {
  const text = `${mandal.district}-${mandal.mandal}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return 45 + (hash % 41);
}
