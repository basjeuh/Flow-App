import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

// Garmin/Polar zetten vermogen/snelheid soms achter een namespace-prefix
// (bv. <ns3:TPX><ns3:Speed>) i.p.v. de simpele naam. Deze helper zoekt op
// lokale naam, ongeacht prefix.
function extFieldValue(trackpoint, localName) {
  const ext = trackpoint?.Extensions;
  if (!ext) return null;
  for (const key of Object.keys(ext)) {
    const sub = ext[key];
    if (sub && typeof sub === "object") {
      for (const k2 of Object.keys(sub)) {
        if (k2.split(":").pop() === localName) return Number(sub[k2]);
      }
    }
  }
  return null;
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
    const lapDetails = [];
    const samples = [];
    const activityStart = new Date(act["@_Id"] || act.Id || laps[0]?.["@_StartTime"]).getTime();

    for (const lap of laps) {
      const lapDuration = Number(lap.TotalTimeSeconds || 0);
      const lapDistance = Number(lap.DistanceMeters || 0);
      const lapCalories = Number(lap.Calories || 0);
      const lapAvgHr = Number(lap.AverageHeartRateBpm?.Value) || null;
      const lapMaxHr = Number(lap.MaximumHeartRateBpm?.Value) || null;

      duration += lapDuration;
      distance += lapDistance;
      calories += lapCalories;
      if (lapAvgHr) {
        hrSum += lapAvgHr;
        hrCount += 1;
      }
      if (lapMaxHr && lapMaxHr > hrMax) hrMax = lapMaxHr;

      lapDetails.push({
        duration_s: Math.round(lapDuration) || null,
        distance_m: lapDistance || null,
        calories: lapCalories || null,
        avg_hr: lapAvgHr,
        max_hr: lapMaxHr,
      });

      // Per-seconde trackpoints, voor gedetailleerde grafieken (tempo/HR/cadans/vermogen).
      const points = asArray(lap.Track?.Trackpoint);
      for (const p of points) {
        if (!p.Time) continue;
        const t = Math.round((new Date(p.Time).getTime() - activityStart) / 1000);
        samples.push({
          t,
          dist: p.DistanceMeters != null ? Number(p.DistanceMeters) : null,
          hr: p.HeartRateBpm?.Value != null ? Number(p.HeartRateBpm.Value) : null,
          cadence: p.Cadence != null ? Number(p.Cadence) : null,
          watts: extFieldValue(p, "Watts"),
          speed_ms: extFieldValue(p, "Speed"),
        });
      }
    }

    const lightActivity = {
      ...act,
      Lap: laps.map(({ Track, ...lapRest }) => lapRest),
    };

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
      laps: lapDetails.length > 1 ? lapDetails : null,
      samples: samples.length > 0 ? samples : null,
      raw: { source: "tcx-import", activity: lightActivity },
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
