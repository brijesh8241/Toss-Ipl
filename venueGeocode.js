const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'venue_geocode_cache.json');

function loadGeocodeCache() {
    try {
        const raw = fs.readFileSync(CACHE_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * If GOOGLE_MAPS_API_KEY is set, fetch missing stadium coordinates via
 * Google Maps Geocoding API and persist to venue_geocode_cache.json.
 */
async function refreshVenueGeocodesIfConfigured(db) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    try {
        const cache = loadGeocodeCache();
        
        // Fetch distinct stadiums from Supabase
        const { data: rows, error } = await db
            .from('matches')
            .select('stadium');

        if (error) throw error;

        // Get unique stadiums
        const stadiums = [...new Set(rows.map(r => r.stadium).filter(Boolean))];
        let changed = false;

        for (const stadium of stadiums) {
            if (cache[stadium]) continue;
            
            const url =
                'https://maps.googleapis.com/maps/api/geocode/json?' +
                new URLSearchParams({ address: stadium, key: apiKey }).toString();
            
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.status === 'OK' && data.results && data.results[0]) {
                const loc = data.results[0].geometry.location;
                cache[stadium] = { 
                    lat: loc.lat, 
                    lng: loc.lng, 
                    formatted: data.results[0].formatted_address 
                };
                changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
        }
    } catch (err) {
        console.error('Error in refreshVenueGeocodes:', err.message);
    }
}

function attachGeocodes(matches) {
    const cache = loadGeocodeCache();
    return matches.map((m) => {
        const g = cache[m.stadium];
        if (!g) return m;
        return { ...m, geo_lat: g.lat, geo_lng: g.lng, geo_formatted: g.formatted };
    });
}

module.exports = { refreshVenueGeocodesIfConfigured, attachGeocodes, loadGeocodeCache };
