/**
 * City catalogue — names, countries, IANA zones and coordinates only.
 * No offsets are stored: every offset is computed live from the zone.
 *
 * Production: replace or extend with a GeoNames cities15000 extract
 * (≈ 25k rows) shipped as a static JSON asset and indexed off the main thread.
 */
import { isValidZone, offsetMinutes } from './time';

export interface City {
  id: string; // stable slug
  name: string;
  country: string;
  zone: string; // IANA
  lat: number;
  lon: number;
  aliases?: string[];
  /** true when lat/lon are estimated (bare IANA zone) — sky shading is approximate */
  coordsApprox?: boolean;
}

type Row = [name: string, country: string, zone: string, lat: number, lon: number, aliases?: string];

const ROWS: Row[] = [
  ['Manila', 'Philippines', 'Asia/Manila', 14.6, 121.0, 'PHT PH Quezon Makati'],
  ['Baguio', 'Philippines', 'Asia/Manila', 16.41, 120.6],
  ['Cebu', 'Philippines', 'Asia/Manila', 10.32, 123.9],
  ['Singapore', 'Singapore', 'Asia/Singapore', 1.29, 103.85, 'SGT SG'],
  ['Kuala Lumpur', 'Malaysia', 'Asia/Kuala_Lumpur', 3.14, 101.69, 'KL MYT'],
  ['Jakarta', 'Indonesia', 'Asia/Jakarta', -6.2, 106.85, 'WIB'],
  ['Bangkok', 'Thailand', 'Asia/Bangkok', 13.75, 100.5, 'ICT'],
  ['Ho Chi Minh City', 'Vietnam', 'Asia/Ho_Chi_Minh', 10.82, 106.63, 'Saigon'],
  ['Hong Kong', 'China', 'Asia/Hong_Kong', 22.3, 114.17, 'HKT HK'],
  ['Shanghai', 'China', 'Asia/Shanghai', 31.23, 121.47, 'CST Beijing China'],
  ['Beijing', 'China', 'Asia/Shanghai', 39.9, 116.4],
  ['Taipei', 'Taiwan', 'Asia/Taipei', 25.03, 121.56],
  ['Seoul', 'South Korea', 'Asia/Seoul', 37.57, 126.98, 'KST Korea'],
  ['Tokyo', 'Japan', 'Asia/Tokyo', 35.68, 139.69, 'JST Japan'],
  ['Osaka', 'Japan', 'Asia/Tokyo', 34.69, 135.5],
  ['Mumbai', 'India', 'Asia/Kolkata', 19.08, 72.88, 'IST India Bombay'],
  ['Bengaluru', 'India', 'Asia/Kolkata', 12.97, 77.59, 'Bangalore'],
  ['New Delhi', 'India', 'Asia/Kolkata', 28.61, 77.21, 'Delhi'],
  ['Kathmandu', 'Nepal', 'Asia/Kathmandu', 27.72, 85.32, 'NPT'],
  ['Dhaka', 'Bangladesh', 'Asia/Dhaka', 23.81, 90.41],
  ['Colombo', 'Sri Lanka', 'Asia/Colombo', 6.93, 79.86],
  ['Karachi', 'Pakistan', 'Asia/Karachi', 24.86, 67.0, 'PKT'],
  ['Kabul', 'Afghanistan', 'Asia/Kabul', 34.53, 69.17],
  ['Tehran', 'Iran', 'Asia/Tehran', 35.69, 51.39],
  ['Dubai', 'United Arab Emirates', 'Asia/Dubai', 25.2, 55.27, 'GST UAE'],
  ['Riyadh', 'Saudi Arabia', 'Asia/Riyadh', 24.71, 46.68],
  ['Doha', 'Qatar', 'Asia/Qatar', 25.29, 51.53],
  ['Tel Aviv', 'Israel', 'Asia/Jerusalem', 32.09, 34.78, 'Jerusalem'],
  ['Istanbul', 'Türkiye', 'Europe/Istanbul', 41.01, 28.98, 'Turkey'],
  ['Moscow', 'Russia', 'Europe/Moscow', 55.76, 37.62, 'MSK'],
  ['Athens', 'Greece', 'Europe/Athens', 37.98, 23.73],
  ['Helsinki', 'Finland', 'Europe/Helsinki', 60.17, 24.94],
  ['Kyiv', 'Ukraine', 'Europe/Kyiv', 50.45, 30.52, 'Kiev'],
  ['Warsaw', 'Poland', 'Europe/Warsaw', 52.23, 21.01],
  ['Berlin', 'Germany', 'Europe/Berlin', 52.52, 13.4, 'CET CEST Germany'],
  ['Munich', 'Germany', 'Europe/Berlin', 48.14, 11.58],
  ['Amsterdam', 'Netherlands', 'Europe/Amsterdam', 52.37, 4.9],
  ['Paris', 'France', 'Europe/Paris', 48.86, 2.35],
  ['Madrid', 'Spain', 'Europe/Madrid', 40.42, -3.7],
  ['Rome', 'Italy', 'Europe/Rome', 41.9, 12.5],
  ['Zurich', 'Switzerland', 'Europe/Zurich', 47.37, 8.54],
  ['Stockholm', 'Sweden', 'Europe/Stockholm', 59.33, 18.07],
  ['London', 'United Kingdom', 'Europe/London', 51.51, -0.13, 'GMT BST UK'],
  ['Dublin', 'Ireland', 'Europe/Dublin', 53.35, -6.26],
  ['Lisbon', 'Portugal', 'Europe/Lisbon', 38.72, -9.14],
  ['Reykjavík', 'Iceland', 'Atlantic/Reykjavik', 64.15, -21.94, 'Reykjavik'],
  ['Lagos', 'Nigeria', 'Africa/Lagos', 6.52, 3.38, 'WAT'],
  ['Cairo', 'Egypt', 'Africa/Cairo', 30.04, 31.24],
  ['Nairobi', 'Kenya', 'Africa/Nairobi', -1.29, 36.82, 'EAT'],
  ['Johannesburg', 'South Africa', 'Africa/Johannesburg', -26.2, 28.05, 'SAST'],
  ['Casablanca', 'Morocco', 'Africa/Casablanca', 33.57, -7.59],
  ['São Paulo', 'Brazil', 'America/Sao_Paulo', -23.55, -46.63, 'Sao Paulo BRT'],
  ['Buenos Aires', 'Argentina', 'America/Argentina/Buenos_Aires', -34.6, -58.38, 'ART'],
  ['Santiago', 'Chile', 'America/Santiago', -33.45, -70.67],
  ['Bogotá', 'Colombia', 'America/Bogota', 4.71, -74.07, 'Bogota'],
  ['Lima', 'Peru', 'America/Lima', -12.05, -77.04],
  ['Mexico City', 'Mexico', 'America/Mexico_City', 19.43, -99.13, 'CDMX'],
  ['St. John’s', 'Canada', 'America/St_Johns', 47.56, -52.71, "St Johns Newfoundland NST"],
  ['Halifax', 'Canada', 'America/Halifax', 44.65, -63.58, 'AST Atlantic'],
  ['Toronto', 'Canada', 'America/Toronto', 43.65, -79.38],
  ['Montréal', 'Canada', 'America/Toronto', 45.5, -73.57, 'Montreal'],
  ['New York', 'United States', 'America/New_York', 40.71, -74.01, 'NYC EST EDT Eastern'],
  ['Boston', 'United States', 'America/New_York', 42.36, -71.06],
  ['Washington, D.C.', 'United States', 'America/New_York', 38.9, -77.04, 'DC'],
  ['Miami', 'United States', 'America/New_York', 25.76, -80.19],
  ['Atlanta', 'United States', 'America/New_York', 33.75, -84.39],
  ['Chicago', 'United States', 'America/Chicago', 41.88, -87.63, 'CST CDT Central'],
  ['Dallas', 'United States', 'America/Chicago', 32.78, -96.8],
  ['Houston', 'United States', 'America/Chicago', 29.76, -95.37],
  ['Denver', 'United States', 'America/Denver', 39.74, -104.99, 'MST MDT Mountain'],
  ['Phoenix', 'United States', 'America/Phoenix', 33.45, -112.07, 'Arizona'],
  ['Los Angeles', 'United States', 'America/Los_Angeles', 34.05, -118.24, 'LA PST PDT Pacific'],
  ['San Francisco', 'United States', 'America/Los_Angeles', 37.77, -122.42, 'SF Bay Area'],
  ['Seattle', 'United States', 'America/Los_Angeles', 47.61, -122.33],
  ['Vancouver', 'Canada', 'America/Vancouver', 49.28, -123.12],
  ['Anchorage', 'United States', 'America/Anchorage', 61.22, -149.9, 'AKST Alaska'],
  ['Honolulu', 'United States', 'Pacific/Honolulu', 21.31, -157.86, 'HST Hawaii'],
  ['Sydney', 'Australia', 'Australia/Sydney', -33.87, 151.21, 'AEST AEDT'],
  ['Melbourne', 'Australia', 'Australia/Melbourne', -37.81, 144.96],
  ['Brisbane', 'Australia', 'Australia/Brisbane', -27.47, 153.03],
  ['Adelaide', 'Australia', 'Australia/Adelaide', -34.93, 138.6, 'ACST ACDT'],
  ['Darwin', 'Australia', 'Australia/Darwin', -12.46, 130.84],
  ['Perth', 'Australia', 'Australia/Perth', -31.95, 115.86, 'AWST'],
  ['Eucla', 'Australia', 'Australia/Eucla', -31.68, 128.88],
  ['Auckland', 'New Zealand', 'Pacific/Auckland', -36.85, 174.76, 'NZST NZDT NZ'],
  ['Chatham Islands', 'New Zealand', 'Pacific/Chatham', -43.95, -176.55],
  ['Fiji', 'Fiji', 'Pacific/Fiji', -18.14, 178.44, 'Suva'],
  ['Kiritimati', 'Kiribati', 'Pacific/Kiritimati', 1.87, -157.4, 'Christmas Island'],
  ['UTC', 'Coordinated Universal Time', 'UTC', 51.48, 0, 'GMT Zulu Z'],
];

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const CITIES: City[] = ROWS.filter((r) => isValidZone(r[2])).map(([name, country, zone, lat, lon, aliases]) => ({
  id: slug(name),
  name,
  country,
  zone,
  lat,
  lon,
  aliases: aliases ? aliases.split(' ') : undefined,
}));

const BY_ID = new Map(CITIES.map((c) => [c.id, c]));
export function cityById(id: string): City | undefined {
  return BY_ID.get(id);
}

/** City-like record for a bare IANA zone that has no catalogue row. */
export function cityFromZone(zone: string, at: number = Date.now()): City {
  const leaf = zone.split('/').pop()!.replace(/_/g, ' ');
  const region = zone.includes('/') ? zone.split('/')[0] : 'Zone';
  // Longitude estimated from the current offset; latitude unknown (equator).
  const lon = Math.max(-180, Math.min(180, (offsetMinutes(zone, at) / 60) * 15));
  return { id: 'tz-' + slug(zone), name: leaf, country: region, zone, lat: 0, lon, coordsApprox: true };
}
