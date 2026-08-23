import { RouteRef } from "./pirep-schema";

// Mirrors the web portal's src/data/routes.ts exactly (same ids, same
// distances) so a booking's routeId resolves to the same flight the pilot
// sees on the website. Update alongside the portal's route list.
const ROUTES: RouteRef[] = [
  { id: "af008", flightNumber: "AF008", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "KJFK", arrivalLat: 40.6413, arrivalLon: -73.7781, distanceNm: 3167, aircraftTypes: ["B777", "A350"] },
  { id: "af032", flightNumber: "AF032", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "KATL", arrivalLat: 33.6407, arrivalLon: -84.4277, distanceNm: 4390, aircraftTypes: ["B787"] },
  { id: "af350", flightNumber: "AF350", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "CYUL", arrivalLat: 45.4706, arrivalLon: -73.7408, distanceNm: 3020, aircraftTypes: ["A350", "B787"] },
  { id: "af276", flightNumber: "AF276", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "RJAA", arrivalLat: 35.7719, arrivalLon: 140.3928, distanceNm: 6039, aircraftTypes: ["B777"] },
  { id: "af654", flightNumber: "AF654", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "OMDB", arrivalLat: 25.2532, arrivalLon: 55.3657, distanceNm: 2680, aircraftTypes: ["A350"] },
  { id: "af1680", flightNumber: "AF1680", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "EGLL", arrivalLat: 51.4700, arrivalLon: -0.4543, distanceNm: 185, aircraftTypes: ["A220", "A320neo"] },
  { id: "af1218", flightNumber: "AF1218", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "LIRF", arrivalLat: 41.8003, arrivalLon: 12.2389, distanceNm: 690, aircraftTypes: ["A320neo", "A220"] },
  { id: "af1400", flightNumber: "AF1400", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "LEMD", arrivalLat: 40.4983, arrivalLon: -3.5676, distanceNm: 655, aircraftTypes: ["A320neo"] },
  { id: "af445", flightNumber: "AF445", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "SBGR", arrivalLat: -23.4356, arrivalLon: -46.4731, distanceNm: 5680, aircraftTypes: ["B777", "A350"] },
  { id: "af184", flightNumber: "AF184", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "RJTT", arrivalLat: 35.5494, arrivalLon: 139.7798, distanceNm: 6040, aircraftTypes: ["B787"] },
  { id: "af256", flightNumber: "AF256", departureIcao: "LFPG", departureLat: 49.0097, departureLon: 2.5479, arrivalIcao: "WSSS", arrivalLat: 1.3644, arrivalLon: 103.9915, distanceNm: 6060, aircraftTypes: ["A350"] },
  { id: "af7620", flightNumber: "AF7620", departureIcao: "LFPO", departureLat: 48.7233, departureLon: 2.3794, arrivalIcao: "LFMN", arrivalLat: 43.6584, arrivalLon: 7.2159, distanceNm: 400, aircraftTypes: ["A220", "A320neo"] },
  { id: "af640", flightNumber: "AF640", departureIcao: "LFPO", departureLat: 48.7233, departureLon: 2.3794, arrivalIcao: "TFFF", arrivalLat: 14.5910, arrivalLon: -61.0032, distanceNm: 3980, aircraftTypes: ["A350", "B787"] },
  { id: "af3610", flightNumber: "AF3610", departureIcao: "KJFK", departureLat: 40.6413, departureLon: -73.7781, arrivalIcao: "CYUL", arrivalLat: 45.4706, arrivalLon: -73.7408, distanceNm: 340, aircraftTypes: ["A220"] },
];

export const ROUTE_LOOKUP: Record<string, RouteRef> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
