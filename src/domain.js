import { AREAS, ATTRACTIONS, AREA_TRANSFER_RANGES, ATTRACTION_TRANSFER_RANGES, PERIOD_BUDGET_MINUTES, PERIODS, SAME_AREA_TRAVEL_RANGES, TRIP_DATES, VISIT_CLUSTERS } from "./data.js";

export function allowedAreas(areaId) {
  const area = AREAS.find((item) => item.id === areaId);
  return area ? [area.id, ...area.adjacent] : [];
}

export function allowedAreasForSlot(plan, dateId, periodId) {
  const slot = plan[`${dateId}:${periodId}`];
  const index = PERIODS.findIndex((period) => period.id === periodId);
  const neighboringAreas = [PERIODS[index - 1], PERIODS[index + 1]]
    .filter(Boolean)
    .map((period) => plan[`${dateId}:${period.id}`]?.areaId)
    .filter(Boolean);
  let allowed = AREAS.map((area) => area.id);
  for (const anchor of [...neighboringAreas, slot?.areaId].filter(Boolean)) {
    const adjacent = allowedAreas(anchor);
    allowed = allowed.filter((id) => adjacent.includes(id));
  }
  return allowed;
}

export function areaTransferMinutes(fromAreaId, toAreaId) {
  const range = areaTransferRange(fromAreaId, toAreaId);
  return range ? Math.round((range[0] + range[1]) / 2) : null;
}

export function areaTransferRange(fromAreaId, toAreaId) {
  if (!fromAreaId || !toAreaId) return null;
  if (fromAreaId === toAreaId) return SAME_AREA_TRAVEL_RANGES[fromAreaId] ?? [10, 25];
  const key = [fromAreaId, toAreaId].sort().join("|");
  return AREA_TRANSFER_RANGES[key] ?? null;
}

export function travelRange(fromAttractionId, toAttractionId) {
  const from = ATTRACTIONS.find((item) => item.id === fromAttractionId);
  const to = ATTRACTIONS.find((item) => item.id === toAttractionId);
  if (!from || !to) return null;
  const key = [from.id, to.id].sort().join("|");
  return ATTRACTION_TRANSFER_RANGES[key] ?? areaTransferRange(from.areaId, to.areaId);
}

export function travelMinutes(fromAttractionId, toAttractionId) {
  const range = travelRange(fromAttractionId, toAttractionId);
  return range ? Math.round((range[0] + range[1]) / 2) : 0;
}

function routeOptions(attractionIds) {
  const ids = [...new Set(attractionIds)].filter((id) => ATTRACTIONS.some((item) => item.id === id)).sort();
  if (ids.length <= 1) return ids.length ? [{ ids, lower: 0, upper: 0, center: 0 }] : [];
  const routes = [];
  const visit = (remaining, route, lower, upper, center) => {
    if (remaining.length === 0) { routes.push({ ids: route, lower, upper, center }); return; }
    for (const id of remaining) {
      const range = route.length ? travelRange(route.at(-1), id) : [0, 0];
      if (!range) continue;
      visit(remaining.filter((candidate) => candidate !== id), [...route, id], lower + range[0], upper + range[1], center + (range[0] + range[1]) / 2);
    }
  };
  visit(ids, [], 0, 0, 0);
  return routes;
}

export function bestRoute(attractionIds) {
  return routeOptions(attractionIds).sort((a, b) => a.center - b.center || a.upper - b.upper || a.ids.join("|").localeCompare(b.ids.join("|")))[0] ?? { ids: [], lower: 0, upper: 0, center: 0 };
}

export function estimateTravelRange(attractionIds) {
  const routes = routeOptions(attractionIds);
  if (routes.length === 0) return [0, 0];
  const best = routes.sort((a, b) => a.center - b.center || a.upper - b.upper || a.ids.join("|").localeCompare(b.ids.join("|")))[0];
  return [best.lower, best.upper];
}

export function estimateTravelMinutes(attractionIds) {
  return bestRoute(attractionIds).center;
}

export function activeClusters(attractionIds) {
  const chosen = new Set(attractionIds);
  const matches = VISIT_CLUSTERS
    .filter((cluster) => cluster.attractionIds.every((id) => chosen.has(id)))
    .sort((a, b) => b.attractionIds.length - a.attractionIds.length || a.togetherMinutes - b.togetherMinutes);
  const used = new Set();
  const picked = [];
  for (const cluster of matches) {
    if (cluster.attractionIds.some((id) => used.has(id))) continue;
    cluster.attractionIds.forEach((id) => used.add(id));
    picked.push(cluster);
  }
  return picked;
}

function linkRange(coveredIds, soloIds) {
  if (coveredIds.size === 0 || soloIds.length === 0) return [0, 0];
  let low = Infinity;
  let high = Infinity;
  for (const fromId of coveredIds) {
    for (const toId of soloIds) {
      const range = travelRange(fromId, toId);
      if (!range) continue;
      low = Math.min(low, range[0]);
      high = Math.min(high, range[1]);
    }
  }
  return Number.isFinite(high) ? [low, high] : [0, 0];
}

export function selectionEstimate(attractionIds) {
  const known = attractionIds.map((id) => ATTRACTIONS.find((item) => item.id === id)).filter(Boolean);
  const ids = known.map((item) => item.id);
  const clusters = activeClusters(ids);
  const covered = new Set(clusters.flatMap((cluster) => cluster.attractionIds));
  const solo = known.filter((item) => !covered.has(item.id));
  const visit = solo.reduce((total, item) => total + item.duration, 0) + clusters.reduce((total, cluster) => total + cluster.togetherMinutes, 0);
  const [soloLow, soloHigh] = estimateTravelRange(solo.map((item) => item.id));
  const [linkLow, linkHigh] = linkRange(covered, solo.map((item) => item.id));
  return { visit, travelLow: soloLow + linkLow, travelHigh: soloHigh + linkHigh, totalHigh: visit + soloHigh + linkHigh, clusters };
}

export function estimateMinutes(attractionIds) {
  return selectionEstimate(attractionIds).totalHigh;
}

export function canAddAttraction(slot, attractionId, plannedElsewhere = []) {
  const attraction = ATTRACTIONS.find((item) => item.id === attractionId);
  if (!attraction || !slot?.areaId || !allowedAreas(slot.areaId).includes(attraction.areaId)) return false;
  if (slot.attractionIds?.includes(attractionId)) return false;
  if (plannedElsewhere.includes(attractionId)) return false;
  if ((slot.attractionIds?.length ?? 0) >= 4) return false;
  return estimateMinutes([...(slot.attractionIds ?? []), attractionId]) <= PERIOD_BUDGET_MINUTES;
}

export function emptyPlan() {
  return Object.fromEntries(TRIP_DATES.flatMap((day) => PERIODS.map((period) => [`${day.id}:${period.id}`, { areaId: null, attractionIds: [] }])));
}

export function normalizeParticipant(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name ?? "").trim().slice(0, 24);
  const days = Array.isArray(value.days) ? value.days.filter((day) => TRIP_DATES.some((item) => item.id === day)) : [];
  if (!name || days.length === 0) return null;
  const plan = emptyPlan();
  const seenAttractions = new Set();
  if (value.plan && typeof value.plan === "object") {
    for (const [key, slot] of Object.entries(value.plan)) {
      const [dateId, periodId] = key.split(":");
      if (!TRIP_DATES.some((item) => item.id === dateId) || !PERIODS.some((item) => item.id === periodId)) continue;
      const validIds = Array.isArray(slot?.attractionIds)
        ? slot.attractionIds.filter((id) => ATTRACTIONS.some((item) => item.id === id) && !seenAttractions.has(id))
        : [];
      const areaId = AREAS.some((area) => area.id === slot?.areaId) ? slot.areaId : null;
      const uniqueValidIds = areaId ? validIds.filter((id) => allowedAreas(areaId).includes(ATTRACTIONS.find((item) => item.id === id).areaId)).slice(0, 4) : [];
      uniqueValidIds.forEach((id) => seenAttractions.add(id));
      plan[key] = areaId ? { areaId, attractionIds: uniqueValidIds } : { areaId: null, attractionIds: [] };
    }
  }
  return { id: String(value.id ?? name).slice(0, 40), name, days, plan, updatedAt: Number(value.updatedAt) || Date.now() };
}

function compactSlot(slot) {
  return slot?.areaId && slot.attractionIds?.length ? { areaId: slot.areaId, attractionIds: slot.attractionIds } : undefined;
}

function compactParticipant(person) {
  const plan = {};
  for (const [key, slot] of Object.entries(person.plan || {})) {
    const compact = compactSlot(slot);
    if (compact) plan[key] = compact;
  }
  return { id: person.id, name: person.name, days: person.days, plan, updatedAt: person.updatedAt };
}

export function encodeShare(value, kind = "person") {
  const normalized = kind === "person" ? normalizeParticipant(value) : value;
  if (!normalized) throw new Error("请先填写昵称和游玩日期。");
  const data = kind === "person"
    ? compactParticipant(normalized)
    : { participants: (normalized.participants || []).map((person) => compactParticipant(normalizeParticipant(person))).filter((person) => person.name) };
  return { v: 1, kind, data };
}

export function decodeShare(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || parsed.v !== 1 || !["person", "board"].includes(parsed.kind)) throw new Error("这个选择文件版本不受支持。");
  if (parsed.kind === "person") {
    const participant = normalizeParticipant(parsed.data);
    if (!participant) throw new Error("选择文件缺少昵称或游玩日期。");
    return { kind: "person", data: participant };
  }
  const participants = Array.isArray(parsed.data?.participants)
    ? parsed.data.participants.map(normalizeParticipant).filter(Boolean).slice(0, 10)
    : [];
  if (participants.length === 0) throw new Error("汇总文件里没有有效的同行选择。");
  return { kind: "board", data: { participants } };
}

export function mergeParticipant(participants, incoming) {
  const next = [...participants];
  const index = next.findIndex((item) => item.id === incoming.id || item.name === incoming.name);
  if (index === -1) next.push(incoming);
  else next[index] = incoming;
  return next.slice(-10);
}
