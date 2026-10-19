/**
 * City / IANA zone search. Pure, synchronous, ~0.2 ms for the bundled catalogue.
 * Matches: city name, country, aliases (abbreviations, old names), IANA id,
 * live abbreviation (EDT, BST) and offsets typed as "+5:30", "utc-3", "gmt+8".
 */
import { CITIES, City, cityFromZone } from './cities';
import { formatOffset, offsetMinutes, zoneAbbreviation } from './time';

export interface SearchResult {
  city: City;
  /** why it matched — shown as a hint in the result row */
  match: 'name' | 'country' | 'alias' | 'zone' | 'offset' | 'abbr';
  score: number;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Legacy tz link names that duplicate a canonical zone in the catalogue.
const LEGACY = /^(Etc\/|SystemV|US\/|Canada\/|Brazil\/|Chile\/|Mexico\/)|^(Asia\/(Calcutta|Katmandu|Saigon|Rangoon|Dacca|Thimbu|Ulan_Bator|Chongqing|Chungking|Harbin|Kashgar|Tel_Aviv|Macao|Ujung_Pandang|Ashkhabad)|Europe\/(Kiev|Belfast|Nicosia|Tiraspol|Uzhgorod|Zaporozhye)|America\/(Buenos_Aires|Catamarca|Cordoba|Jujuy|Mendoza|Indianapolis|Fort_Wayne|Louisville|Knox_IN|Godthab|Montreal|Shiprock|Ensenada|Santa_Isabel|Porto_Acre|Rosario|Virgin|Atka)|Australia\/(ACT|NSW|North|Queensland|South|Tasmania|Victoria|West|Yancowinna|LHI|Canberra)|Pacific\/(Samoa|Yap|Truk|Ponape|Enderbury|Johnston)|Africa\/(Asmera|Timbuktu)|Atlantic\/(Faeroe|Jan_Mayen)|Antarctica\/South_Pole)$|^[A-Z0-9+-]+$|^(GB|NZ|PRC|ROC|ROK|UCT|Zulu|Universal|Greenwich|Cuba|Egypt|Eire|Iceland|Iran|Israel|Jamaica|Japan|Libya|Navajo|Poland|Portugal|Singapore|Turkey|Hongkong|Kwajalein|GB-Eire|NZ-CHAT|GMT0|GMT-0|GMT\+0)$/;

let allZones: string[] | null = null;
function zones(): string[] {
  if (!allZones) {
    try {
      allZones = (Intl as unknown as { supportedValuesOf(k: string): string[] })
        .supportedValuesOf('timeZone')
        .filter((z) => !LEGACY.test(z));
    } catch {
      allZones = Array.from(new Set(CITIES.map((c) => c.zone)));
    }
  }
  return allZones;
}

function parseOffsetQuery(q: string): number | null {
  const m = /^(?:utc|gmt)?\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?$/.exec(q.replace(/\s+/g, ''));
  if (!m) return null;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (+m[2] * 60 + (m[3] ? +m[3] : 0));
}

export function searchCities(query: string, at: number, limit = 12): SearchResult[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: SearchResult[] = [];
  const offsetQ = parseOffsetQuery(q);

  for (const city of CITIES) {
    const name = fold(city.name);
    let score = 0;
    let match: SearchResult['match'] = 'name';
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.split(/[\s-]/).some((w) => w.startsWith(q))) score = 65;
    else if (name.includes(q)) score = 50;
    else if (city.aliases?.some((a) => fold(a) === q)) { score = 70; match = 'alias'; }
    else if (city.aliases?.some((a) => fold(a).startsWith(q) && q.length > 1)) { score = 45; match = 'alias'; }
    else if (fold(city.country).startsWith(q)) { score = 40; match = 'country'; }
    else if (fold(city.zone).includes(q.replace(/\s+/g, '_'))) { score = 35; match = 'zone'; }
    else if (q.length >= 2 && fold(zoneAbbreviation(city.zone, at)) === q) { score = 60; match = 'abbr'; }
    else if (offsetQ !== null && offsetMinutes(city.zone, at) === offsetQ) { score = 55; match = 'offset'; }
    if (score) out.push({ city, match, score });
  }

  // Bare IANA zones that no catalogue city covers.
  if (q.length >= 3) {
    const known = new Set(CITIES.map((c) => c.zone));
    for (const z of zones()) {
      if (known.has(z)) continue;
      const fz = fold(z);
      const hit = fz.includes(q.replace(/\s+/g, '_')) || (offsetQ !== null && offsetMinutes(z, at) === offsetQ);
      if (hit) out.push({ city: cityFromZone(z, at), match: offsetQ !== null ? 'offset' : 'zone', score: 20 });
    }
  }

  out.sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name));
  return out.slice(0, limit);
}

export function describeMatch(r: SearchResult, at: number): string {
  switch (r.match) {
    case 'zone': return r.city.zone;
    case 'offset': return formatOffset(offsetMinutes(r.city.zone, at));
    case 'abbr': return zoneAbbreviation(r.city.zone, at);
    default: return r.city.country;
  }
}
