import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity, AlertTriangle, Bell, Droplets, Wind, Sun, Thermometer, Gauge,
  Map as MapIcon, ShieldCheck, LogIn, Menu, X, RefreshCw, Users, TrendingUp,
  Download, Info, Database, Building2, ChevronRight, CheckCircle2, Search,
} from 'lucide-react';
import './styles.css';
import { combined, levelColor } from './thermal';
import { loadAPMandals, districtsFromMandals, mandalsForDistrict, vulnerabilityProxy } from './apGis';

const nav = [
  ['dashboard', 'Dashboard', Activity],
  ['map', 'AP GIS Risk Map', MapIcon],
  ['vulnerability', 'Vulnerability', Users],
  ['forecast', 'Early Warning', TrendingUp],
  ['alerts', 'Alerts', Bell],
  ['analytics', 'Analytics', Gauge],
];

const AP_CENTER = [16.8, 80.6];
const AP_ZOOM = 7;
const DEFAULT_POINT = { district: 'Srikakulam', mandal: 'Ichapuram', center: [19.1136, 84.6871] };

function scoreLabel(s) { return s >= 80 ? 'Extreme' : s >= 60 ? 'High' : s >= 40 ? 'Moderate' : 'Low'; }

function MapViewport({ features }) {
  const map = useMap();
  useEffect(() => {
    if (!features?.length) return;
    const layer = L.geoJSON({ type: 'FeatureCollection', features });
    if (layer) map.fitBounds(layer.getBounds(), { padding: [18, 18], maxZoom: 10 });
  }, [features, map]);
  return null;
}

function weatherUrl(points, forecastDays = 3) {
  const latitude = points.map((p) => p.center[0]).join(',');
  const longitude = points.map((p) => p.center[1]).join(',');
  return `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,shortwave_radiation,cloud_cover,surface_pressure&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,cloud_cover,apparent_temperature&forecast_days=${forecastDays}&timezone=auto`;
}

async function fetchWeather(points) {
  if (!points.length) return [];
  const result = [];
  for (let i = 0; i < points.length; i += 30) {
    const batch = points.slice(i, i + 30);
    const response = await fetch(weatherUrl(batch));
    if (!response.ok) throw new Error('Weather service unavailable');
    const data = await response.json();
    const list = Array.isArray(data) ? data : [data];
    batch.forEach((point, j) => result.push([point.id, list[j] || null]));
  }
  return Object.fromEntries(result);
}

function App() {
  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState('Authority');
  const [tab, setTab] = useState('dashboard');
  const [mandals, setMandals] = useState([]);
  const [district, setDistrict] = useState('');
  const [mandalId, setMandalId] = useState('');
  const [weather, setWeather] = useState(null);
  const [districtWeather, setDistrictWeather] = useState({});
  const [loading, setLoading] = useState(false);
  const [gisLoading, setGisLoading] = useState(false);
  const [gisError, setGisError] = useState('');
  const [mobile, setMobile] = useState(false);
  const [alerts, setAlerts] = useState(() => JSON.parse(localStorage.getItem('taara_alerts') || '[]'));

  const districts = useMemo(() => districtsFromMandals(mandals), [mandals]);
  const districtMandals = useMemo(() => mandalsForDistrict(mandals, district), [mandals, district]);
  const selectedMandal = useMemo(() => mandals.find((m) => String(m.id) === String(mandalId)) || districtMandals[0] || null, [mandals, mandalId, districtMandals]);

  useEffect(() => {
    if (!logged) return;
    setGisLoading(true);
    setGisError('');
    loadAPMandals()
      .then((items) => {
        setMandals(items);
        const firstDistrict = items.some((m) => m.district === DEFAULT_POINT.district) ? DEFAULT_POINT.district : items[0].district;
        setDistrict(firstDistrict);
      })
      .catch((e) => setGisError(e.message))
      .finally(() => setGisLoading(false));
  }, [logged]);

  useEffect(() => {
    if (!districtMandals.length) return;
    const preferred = districtMandals.find((m) => m.mandal.toLowerCase() === DEFAULT_POINT.mandal.toLowerCase());
    setMandalId(String((preferred || districtMandals[0]).id));
  }, [district]);

  const loadSelectedWeather = async () => {
    const point = selectedMandal || DEFAULT_POINT;
    setLoading(true);
    try {
      const [data] = await fetchWeather([point]);
      setWeather(data);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const loadDistrictWeather = async () => {
    if (!districtMandals.length) return;
    setGisLoading(true);
    try {
      const data = await fetchWeather(districtMandals);
      setDistrictWeather(data);
      const point = selectedMandal || districtMandals[0];
      setWeather(data[point.id] || null);
    } catch (e) {
      console.error(e);
      setGisError('Could not load live weather for this district. Try Refresh district risk.');
    } finally { setGisLoading(false); }
  };

  useEffect(() => {
    if (!logged || !selectedMandal) return;
    loadSelectedWeather();
  }, [logged, mandalId]);

  useEffect(() => {
    if (!logged) return;
    const id = setInterval(loadSelectedWeather, 300000);
    return () => clearInterval(id);
  }, [logged, mandalId]);

  useEffect(() => localStorage.setItem('taara_alerts', JSON.stringify(alerts)), [alerts]);

  const vulnerability = selectedMandal ? vulnerabilityProxy(selectedMandal) : 60;
  const c = weather?.current;
  const risk = c ? combined(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m, c.shortwave_radiation || 0, vulnerability) : null;
  const forecast = useMemo(() => weather?.hourly?.time?.map((time, i) => ({
    time,
    t: weather.hourly.temperature_2m[i],
    h: weather.hourly.relative_humidity_2m[i],
    w: weather.hourly.wind_speed_10m[i],
    s: weather.hourly.shortwave_radiation?.[i] || 0,
  })).slice(0, 72) || [], [weather]);

  const createAlert = () => {
    const a = {
      id: Date.now(), district, zone: selectedMandal?.mandal || 'Selected mandal', ward: 'Ward-level prototype',
      level: risk?.level || 'Moderate', score: risk?.score || 0,
      text: `Heat-risk screening is ${risk?.level || 'pending'} for ${selectedMandal?.mandal || 'the selected mandal'}. Review local heat-action measures.`,
      time: new Date().toLocaleTimeString(),
    };
    setAlerts((x) => [a, ...x]);
  };

  const exportData = () => {
    const rows = [['District', 'Mandal', 'Risk', 'Score', 'Temperature', 'Humidity', 'Wind', 'Vulnerability']];
    districtMandals.forEach((m) => {
      const w = districtWeather[m.id];
      const rc = w?.current ? combined(w.current.temperature_2m, w.current.relative_humidity_2m, w.current.wind_speed_10m, w.current.shortwave_radiation || 0, vulnerabilityProxy(m)) : null;
      rows.push([m.district, m.mandal, rc?.level || 'Pending', rc?.score ?? '', w?.current?.temperature_2m ?? '', w?.current?.relative_humidity_2m ?? '', w?.current?.wind_speed_10m ?? '', vulnerabilityProxy(m)]);
    });
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `taara-${district || 'ap'}-risk.csv`; a.click();
  };

  if (!logged) return <Login onLogin={(r) => { setRole(r); setLogged(true); }} />;

  return <div className="app">
    <header><div className="brand"><div className="logo">T</div><div><b>TAARA</b><small>Thermal Alert & Risk Analytics • SIH 26083</small></div></div><div className="live"><span /> LIVE WEATHER • {role} • ANDHRA PRADESH</div><button className="menu" onClick={() => setMobile(!mobile)}>{mobile ? <X /> : <Menu />}</button></header>
    <div className="layout"><aside className={mobile ? 'open' : ''}><nav>{nav.map(([id, label, I]) => <button className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMobile(false); }} key={id}><I size={18} />{label}<ChevronRight size={14} /></button>)}</nav><div className="sidebox"><ShieldCheck /><b>AP Heat Action Mode</b><p>Live mandal monitoring across Andhra Pradesh using official AP GIS boundaries.</p></div><button className="logout" onClick={() => setLogged(false)}><LogIn size={16} /> Sign out</button></aside>
      <main>
        {tab === 'dashboard' && <Dashboard district={district} setDistrict={setDistrict} districts={districts} districtMandals={districtMandals} selectedMandal={selectedMandal} setMandalId={setMandalId} c={c} risk={risk} loading={loading} load={loadSelectedWeather} forecast={forecast} gisLoading={gisLoading} />}
        {tab === 'map' && <MapPage mandals={mandals} districts={districts} district={district} setDistrict={setDistrict} districtMandals={districtMandals} selectedMandal={selectedMandal} setMandalId={setMandalId} districtWeather={districtWeather} loadDistrictWeather={loadDistrictWeather} gisLoading={gisLoading} gisError={gisError} setTab={setTab} />}
        {tab === 'vulnerability' && <Vulnerability mandal={selectedMandal} risk={risk} />}
        {tab === 'forecast' && <Forecast mandal={selectedMandal} forecast={forecast} />}
        {tab === 'alerts' && <Alerts alerts={alerts} createAlert={createAlert} setMandalId={setMandalId} setTab={setTab} mandals={mandals} />}
        {tab === 'analytics' && <Analytics district={district} districtMandals={districtMandals} districtWeather={districtWeather} exportData={exportData} />}
      </main>
    </div>
    <footer>TAARA • AP mandal boundaries: Andhra Pradesh State Disaster Management / AP GIS service • Weather: Open-Meteo • Vulnerability is a prototype proxy until validated datasets are connected.</footer>
  </div>;
}

function LocationSelectors({ district, setDistrict, districts, districtMandals, selectedMandal, setMandalId }) {
  return <div className="locationSelectors"><div><label>STATE</label><div className="staticSelect">Andhra Pradesh</div></div><div><label>DISTRICT</label><select value={district} onChange={(e) => setDistrict(e.target.value)}>{districts.map((d) => <option key={d}>{d}</option>)}</select></div><div><label>MANDAL</label><select value={selectedMandal ? String(selectedMandal.id) : ''} onChange={(e) => setMandalId(e.target.value)}>{districtMandals.map((m) => <option key={m.id} value={m.id}>{m.mandal}</option>)}</select></div></div>;
}

function Dashboard({ district, setDistrict, districts, districtMandals, selectedMandal, setMandalId, c, risk, loading, load, forecast, gisLoading }) {
  return <><section className="hero"><div><span className="eyebrow">SIH 26083 • ANDHRA PRADESH • EXTREME HEAT EARLY WARNING</span><h1>Know the heat.<br /><em>Protect the people.</em></h1><p>Monitor every district and mandal in Andhra Pradesh from one hyper-local heat-risk dashboard.</p></div><div className="selector"><label>MONITOR LOCATION</label><LocationSelectors {...{ district, setDistrict, districts, districtMandals, selectedMandal, setMandalId }} /><small>{districtMandals.length} mandals loaded for {district || 'selected district'}</small><button onClick={load}><RefreshCw className={loading ? 'spin' : ''} size={15} /> Refresh live weather</button></div></section>
    <div className="cards"><div className="bigRisk" style={{ '--accent': levelColor(risk?.level) }}><span>COMBINED LOCAL RISK</span><div><strong>{risk?.score ?? '—'}</strong><small>/100</small></div><b>{risk?.level || 'Waiting'}</b><p>{selectedMandal?.mandal || 'Select a mandal'}, {district || 'Andhra Pradesh'}</p></div><div className="weather"><div className="cardhead"><span>LIVE CONDITIONS</span><i>Open-Meteo</i></div><div className="metrics">{[[Thermometer, 'Temperature', c ? c.temperature_2m.toFixed(1) + '°C' : '—'], [Droplets, 'Humidity', c ? c.relative_humidity_2m + '%' : '—'], [Wind, 'Wind', c ? c.wind_speed_10m.toFixed(1) + ' km/h' : '—'], [Sun, 'Solar', c ? Math.round(c.shortwave_radiation || 0) + ' W/m²' : '—'], [Thermometer, 'Feels like', c ? c.apparent_temperature.toFixed(1) + '°C' : '—'], [Gauge, 'Cloud cover', c ? c.cloud_cover + '%' : '—']].map(([I, l, v]) => <div className="metric" key={l}><I size={17} /><small>{l}</small><b>{v}</b></div>)}</div></div></div>
    <section className="panel"><div className="panelhead"><div><span className="eyebrow">STAGE 3 • THERMAL ENGINE</span><h2>Thermal stress analysis</h2></div><Activity /></div>{risk ? <div className="analysis"><div className="index"><span>Heat Index</span><strong>{risk.heatIndex.toFixed(1)}°C</strong><small>NOAA/NWS screening method</small></div><div className="index"><span>Estimated wet-bulb</span><strong>{risk.wetBulb.toFixed(1)}°C</strong><small>Stull approximation</small></div><div className="index"><span>Environmental burden</span><strong>{Math.round(risk.env)}/92</strong><small>heat + humidity + solar − wind relief</small></div><div className="index"><span>Vulnerability</span><strong>{risk.vulnerability}/100</strong><small>prototype local proxy</small></div></div> : <div className="loading">{gisLoading ? 'Loading AP GIS and weather…' : 'Waiting for live weather…'}</div>}<div className="method"><Info size={16} /><span>Weather-based screening indicator. It is not a medical diagnosis and not a measured WBGT.</span></div></section>
    <section className="grid2"><div className="panel"><div className="panelhead"><div><span className="eyebrow">24–72 HOUR OUTLOOK</span><h2>Early warning signal</h2></div><TrendingUp /></div><div className="bars">{forecast.filter((_, i) => i % 4 === 0).slice(0, 18).map((x) => { const r = combined(x.t, x.h, x.w, x.s, selectedMandal ? vulnerabilityProxy(selectedMandal) : 60); return <div className="baritem" key={x.time}><span>{new Date(x.time).getHours().toString().padStart(2, '0')}</span><div className="bar" style={{ height: `${Math.max(15, r.score)}%`, background: levelColor(r.level) }} /><b>{Math.round(x.t)}°</b></div>; })}</div></div><div className="panel"><div className="panelhead"><div><span className="eyebrow">LOCATION</span><h2>{selectedMandal?.mandal || '—'}, {district || 'Andhra Pradesh'}</h2></div><MapIcon /></div><p className="mapnote">The map uses official AP mandal boundaries. Select any district to load its mandals and then refresh district risk to colour each mandal using live weather.</p><div className="statline"><b>{districts.length}</b><span>districts available</span><b>{districtMandals.length}</b><span>mandals in selected district</span></div></div></section></>;
}

function MapPage({ mandals, districts, district, setDistrict, districtMandals, selectedMandal, setMandalId, districtWeather, loadDistrictWeather, gisLoading, gisError, setTab }) {
  const selectedFeatures = districtMandals;
  const weatherFor = (m) => districtWeather[m.id]?.current;
  return <section className="page"><div className="pagehead"><div><span className="eyebrow">OFFICIAL AP GIS • MANDAL LEVEL</span><h1>Andhra Pradesh heat-risk map</h1><p>Choose any AP district. Its mandal boundaries are loaded from the state GIS service and each mandal can receive an independent live risk colour.</p></div></div>
    <div className="maptoolbar"><div><label>DISTRICT</label><select value={district} onChange={(e) => setDistrict(e.target.value)}>{districts.map((d) => <option key={d}>{d}</option>)}</select></div><div><label>MANDAL</label><select value={selectedMandal ? String(selectedMandal.id) : ''} onChange={(e) => setMandalId(e.target.value)}>{districtMandals.map((m) => <option key={m.id} value={m.id}>{m.mandal}</option>)}</select></div><button className="primary" onClick={loadDistrictWeather} disabled={gisLoading}><RefreshCw size={16} className={gisLoading ? 'spin' : ''} /> {gisLoading ? 'Loading district risk…' : 'Load district live risk'}</button></div>
    {gisError && <div className="errorbox"><AlertTriangle size={16} />{gisError}</div>}
    <div className="legend">{['Low', 'Moderate', 'High', 'Extreme'].map((l) => <span key={l}><i style={{ background: levelColor(l) }} />{l}</span>)}<span><i style={{ background: '#94a3b8' }} />Not loaded</span></div>
    <div className="mapwrap"><MapContainer center={AP_CENTER} zoom={AP_ZOOM} className="map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapViewport features={selectedFeatures} />
      {selectedFeatures.length > 0 && <GeoJSON key={district} data={{ type: 'FeatureCollection', features: selectedFeatures }} style={(feature) => { const m = selectedFeatures.find((x) => x.id === feature.id) || selectedFeatures.find((x) => x.mandalLgd === feature.properties?.mandal_lgd); const c = m ? weatherFor(m) : null; const r = c ? combined(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m, c.shortwave_radiation || 0, vulnerabilityProxy(m)) : null; return { color: r ? levelColor(r.level) : '#64748b', fillColor: r ? levelColor(r.level) : '#94a3b8', fillOpacity: r ? 0.48 : 0.22, weight: 1.5 }; }} onEachFeature={(feature, layer) => { const m = selectedFeatures.find((x) => x.id === feature.id) || selectedFeatures.find((x) => x.mandalLgd === feature.properties?.mandal_lgd); const c = m ? weatherFor(m) : null; const r = c ? combined(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m, c.shortwave_radiation || 0, vulnerabilityProxy(m)) : null; layer.bindPopup(`<b>${m?.mandal || 'Mandal'}</b><br/>${m?.district || district}<br/>Risk: <b>${r ? `${r.score}/100 • ${r.level}` : 'Click Load district live risk'}</b>`); layer.on('click', () => { if (m) setMandalId(String(m.id)); }); }} />}
      {selectedMandal && <CircleMarker center={selectedMandal.center} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#111827', fillOpacity: 1 }}><Popup><b>{selectedMandal.mandal}</b><br />{selectedMandal.district}<br />{selectedMandal.division || 'Revenue division'}<br /><button onClick={() => setTab('dashboard')}>Open dashboard</button></Popup></CircleMarker>}
    </MapContainer><div className="mapnote"><Info size={15} /> Boundaries are sourced from the Andhra Pradesh GIS mandal layer. Risk colours are TAARA calculations using live weather plus a prototype vulnerability proxy.</div></div>
  </section>;
}

function Vulnerability({ mandal, risk }) { const v = mandal ? vulnerabilityProxy(mandal) : 60; const factors = [['Population exposure', Math.min(100, v + 4)], ['Outdoor-worker exposure', Math.min(100, v + 8)], ['Built-environment pressure', Math.min(100, v + 3)], ['Health/cooling access gap', Math.max(0, 100 - v + 10)]]; return <section className="page"><div className="pagehead"><div><span className="eyebrow">VULNERABILITY + COMBINED RISK</span><h1>{mandal?.mandal || 'Selected mandal'} vulnerability profile</h1><p>{mandal?.district || 'Andhra Pradesh'} • prototype exposure factors pending validated local datasets.</p></div></div><div className="scorehero"><div><span>Vulnerability score</span><strong>{v}</strong><small>/100</small></div><div><span>Combined risk</span><strong>{risk?.score ?? '—'}</strong><small>/100</small></div><div><span>Administrative level</span><strong>MANDAL</strong><small>{mandal?.district || 'AP'}</small></div></div><div className="factorgrid">{factors.map(([n, val]) => <div className="factor" key={n}><div><span>{n}</span><b>{val}</b></div><div className="progress"><i style={{ width: val + '%' }} /></div></div>)}</div><div className="panel"><div className="panelhead"><div><span className="eyebrow">WARD-READY ARCHITECTURE</span><h2>Ward-level alerts</h2></div><Building2 /></div><p className="mapnote">Ward boundaries can be connected next from official municipal/ward GeoJSON. The current build keeps the mandal workflow ready without inventing official ward geometry.</p></div></section>; }

function Forecast({ mandal, forecast }) { return <section className="page"><div className="pagehead"><div><span className="eyebrow">EARLY WARNING</span><h1>72-hour thermal outlook</h1><p>{mandal?.mandal || 'Selected mandal'} • forecast conditions converted into a preparation signal.</p></div></div><div className="forecastgrid">{forecast.map((x) => { const r = combined(x.t, x.h, x.w, x.s, mandal ? vulnerabilityProxy(mandal) : 60); return <div className="hour" key={x.time}><small>{new Date(x.time).toLocaleString([], { weekday: 'short', hour: '2-digit' })}</small><strong>{Math.round(x.t)}°</strong><span style={{ color: levelColor(r.level) }}>{r.level}</span><em>{r.score}/100</em></div>; })}</div></section>; }

function Alerts({ alerts, createAlert, setMandalId, setTab, mandals }) { return <section className="page"><div className="pagehead"><div><span className="eyebrow">TARGETED ALERTS</span><h1>Mandal / ward alert centre</h1><p>Prototype records are stored locally. Connect an approved SMS/email/push provider for production delivery.</p></div><button className="primary" onClick={createAlert}><Bell size={16} /> Create live alert</button></div>{alerts.length === 0 ? <div className="empty"><CheckCircle2 />No alerts yet.</div> : <div className="alertlist">{alerts.map((a) => <div className="alert" key={a.id}><div className="alerticon" style={{ background: levelColor(a.level) }}><AlertTriangle size={20} /></div><div><b>{a.district} • {a.zone}</b><span style={{ color: levelColor(a.level) }}>{a.level} • {a.score}/100</span><p>{a.text}</p><small>{a.time}</small></div><button onClick={() => { const m = mandals.find((x) => x.mandal === a.zone && x.district === a.district); if (m) setMandalId(String(m.id)); setTab('dashboard'); }}>View</button></div>)}</div>}</section>; }

function Analytics({ district, districtMandals, districtWeather, exportData }) { const rows = districtMandals.map((m) => { const c = districtWeather[m.id]?.current; const r = c ? combined(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m, c.shortwave_radiation || 0, vulnerabilityProxy(m)) : null; return { ...m, r }; }).sort((a, b) => (b.r?.score || 0) - (a.r?.score || 0)); return <section className="page"><div className="pagehead"><div><span className="eyebrow">AUTHORITY ANALYTICS</span><h1>{district || 'Andhra Pradesh'} mandal overview</h1><p>Load district live risk from the GIS page, then export the current snapshot.</p></div><button className="primary" onClick={exportData}><Download size={16} /> Export CSV</button></div><div className="table"><div className="tr head"><span>Mandal</span><span>Risk</span><span>Score</span><span>Heat Index</span><span>Vulnerability</span></div>{rows.map((m) => <div className="tr" key={m.id}><span><b>{m.mandal}</b></span><span style={{ color: levelColor(m.r?.level) }}>{m.r?.level || 'Pending'}</span><span>{m.r?.score ?? '—'}</span><span>{m.r ? m.r.heatIndex.toFixed(1) + '°C' : '—'}</span><span>{vulnerabilityProxy(m)}/100</span></div>)}</div><div className="architecture"><Database /><div><b>Production architecture</b><p>Official AP GIS → mandal geometry → weather ingestion → thermal engine → validated vulnerability data → ward GIS → alert service.</p></div></div></section>; }

function Login({ onLogin }) { const [role, setRole] = useState('Authority'); return <div className="login"><div className="loginbox"><div className="logo large">T</div><span className="eyebrow">SIH 26083</span><h1>TAARA</h1><p>Thermal Alert & Risk Analytics</p><div className="roles"><button className={role === 'Authority' ? 'sel' : ''} onClick={() => setRole('Authority')}>Government Authority</button><button className={role === 'Public' ? 'sel' : ''} onClick={() => setRole('Public')}>Public</button></div><input placeholder="Official email / phone" /><input placeholder="Password" type="password" /><button className="loginbtn" onClick={() => onLogin(role)}><LogIn size={17} /> Enter TAARA</button><small>Prototype mode • authentication is mocked</small></div></div>; }

createRoot(document.getElementById('root')).render(<App />);
