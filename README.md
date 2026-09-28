# TAARA — SIH 26083 Complete AP Prototype

This build is designed to run across Andhra Pradesh at the mandal level.

## What is included
- Government/Public prototype login
- Live weather from Open-Meteo
- Thermal screening: Heat Index, estimated wet-bulb, solar load and wind relief
- Combined risk score
- Andhra Pradesh mandal GIS loaded from the AP State GIS FeatureServer
- District selector -> all mandals returned by the AP GIS service
- District-level live risk loading: each mandal in the selected district is coloured independently
- 72-hour early warning view
- Vulnerability prototype proxy (replace with validated datasets)
- Local prototype alerts
- CSV analytics export

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## GIS source
The app loads the Andhra Pradesh mandal boundary layer at runtime from:
https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/AP_Mandals_688/FeatureServer/0

The GIS layer supports GeoJSON and contains district/mandal fields. Risk colours are calculated by TAARA using live weather plus a clearly labelled prototype vulnerability proxy.

## Important
For SIH demonstration, say that the GIS geometry is sourced from the AP state GIS service. The vulnerability score is a prototype placeholder until validated demographic/health/exposure datasets are integrated. Ward-level geometry is not fabricated; it is marked as the next integration step.
# TAARA_FINAL
