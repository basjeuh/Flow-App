import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

// TCX: één bestand kan meerdere <Activity>-elementen bevatten (meestal 1 per export).
// Elke Activity heeft meerdere <Lap>-elementen die we optellen tot een totaal.
export function parseTcx(xmlString) {
  const doc = parser.parse(xmlString);
  const activities = asArray(
    doc?.TrainingCenterDatabase?.Activities?.Activity
  );

  return activities.map((act) => {
    const laps = asArray(act.Lap);
    let duration = 0;
    let distance = 0;
    let calories = 0;
    let hrSum = 0;
    let hrCount = 0;
    let hrMax = 0;

    for (const lap of laps) {
      duration += Number(lap.TotalTimeSeconds || 0);
      distance += Number(lap.DistanceMeters || 0);
      calories += Number(lap.Calories || 0);
      const avg = Number(lap.AverageHeartRateBpm?.Value);
      const max = Number(lap.MaximumHeartRateBpm?.Value);
      if (avg) {
        hrSum += avg;
        hrCount += 1;
      }
      if (max && max > hrMax) hrMax = max;
    }

    return {
      provider: "polar",
      external_id: `import-${act["@_Id"] || act.Id}`,
      sport: (act["@_Sport"] || "").toLowerCase() || null,
      source_sport: act["@_Sport"] || null,
      start_time: act["@_Id"] || act.Id,
      duration_s: duration ? Math.round(duration) : null,
      distance_m: distance || null,
      avg_hr: hrCount ? Math.round(hrSum / hrCount) : null,
      max_hr: hrMax || null,
      avg_speed_ms: null,
      elevation_gain_m: null,
      calories: calories || null,
      training_load: null,
      raw: { source: "tcx-import", activity: act },
    };
  });
}// GPX bevat meestal geen HR/calorieën (tenzij met Garmin-TPX-extensions), maar wel
// tijd en afstand via trackpoints. We reconstrueren een eenvoudige samenvatting.
export function parseGpx(xmlString) {
  const doc = parser.parse(xmlString);
  const tracks = asArray(doc?.gpx?.trk);

  return tracks.map((trk) => {
    const segments = asArray(trk.trkseg);
    const points = segments.flatMap((seg) => asArray(seg.trkpt));
    if (points.length === 0) return null;

    const times = points.map((p) => p.time).filter(Boolean);
    const startTime = times[0];
    const endTime = times[times.length - 1];
    const duration =
      startTime && endTime
        ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
        : null;

    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += haversine(
        Number(points[i - 1]["@_lat"]),
        Number(points[i - 1]["@_lon"]),
        Number(points[i]["@_lat"]),
        Number(points[i]["@_lon"])
      );
    }

    const hrValues = points
      .map((p) => Number(p.extensions?.["gpxtpx:TrackPointExtension"]?.["gpxtpx:hr"]))
      .filter((v) => v && !Number.isNaN(v));

    return {
      provider: "polar",
      external_id: `import-${trk.name || startTime}`,
      sport: (trk.type || "").toLowerCase() || null,
      source_sport: trk.type || null,
      start_time: startTime,
      duration_s: duration ? Math.round(duration) : null,
      distance_m: distance || null,
      avg_hr: hrValues.length
        ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
        : null,
      max_hr: hrValues.length ? Math.max(...hrValues) : null,
      avg_speed_ms: null,
      elevation_gain_m: null,
      calories: null,
      training_load: null,
      raw: { source: "gpx-import", name: trk.name },
    };
  }).filter(Boolean);
}

function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => Number.isNaN(v))) return 0;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
