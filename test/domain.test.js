import assert from "node:assert/strict";
import test from "node:test";
import { ATTRACTIONS, PERIOD_BUDGET_MINUTES, PERIODS, ROUTE_SUGGESTIONS, VISIT_CLUSTERS } from "../src/data.js";
import { allowedAreas, allowedAreasForSlot, areaTransferMinutes, bestRoute, canAddAttraction, decodeShare, emptyPlan, encodeShare, estimateMinutes, estimateTravelMinutes, estimateTravelRange, mergeParticipant, normalizeParticipant, travelMinutes } from "../src/domain.js";

test("a half-day only offers its selected area and direct neighboring areas", () => {
  assert.deepEqual(allowedAreas("qinhuai"), ["qinhuai", "city-center", "xuanwu", "west"]);
  const slot = { areaId: "qinhuai", attractionIds: [] };
  assert.equal(canAddAttraction(slot, "laomendong"), true);
  assert.equal(canAddAttraction(slot, "presidential-palace"), true);
  assert.equal(canAddAttraction(slot, "ming-xiaoling"), false);
});

test("morning and afternoon areas stay connected, and duplicate visits are rejected", () => {
  const plan = emptyPlan();
  plan["2026-10-24:am"].areaId = "zhongshan";
  assert.deepEqual(allowedAreasForSlot(plan, "2026-10-24", "pm"), ["zhongshan", "xuanwu", "city-center"]);
  plan["2026-10-24:pm"].areaId = "xuanwu";
  assert.deepEqual(allowedAreasForSlot(plan, "2026-10-24", "am"), ["zhongshan", "xuanwu", "city-center"]);
  plan["2026-10-24:am"].attractionIds = ["ming-xiaoling"];
  assert.equal(canAddAttraction(plan["2026-10-24:pm"], "ming-xiaoling", plan["2026-10-24:am"].attractionIds), false);
  assert.equal(canAddAttraction(plan["2026-10-24:pm"], "jimingsi"), true);
  assert.equal(areaTransferMinutes("zhongshan", "xuanwu"), 35);
  plan["2026-10-24:am"].areaId = "xuanwu";
  plan["2026-10-24:night"].areaId = "qinhuai";
  assert.deepEqual(allowedAreasForSlot(plan, "2026-10-24", "pm"), ["xuanwu", "city-center", "west", "qinhuai"]);
});

test("time budget counts travel buffers and rejects an overfull half-day", () => {
  const chosen = ["ming-xiaoling", "music-stage"];
  assert.equal(estimateTravelMinutes(chosen), 27.5);
  assert.deepEqual(estimateTravelRange(chosen), [20, 35]);
  assert.equal(estimateMinutes(chosen), 150 + 40 + 35);
  assert.ok(estimateMinutes(chosen) <= PERIOD_BUDGET_MINUTES);
  assert.equal(canAddAttraction({ areaId: "zhongshan", attractionIds: chosen }, "sun-yat-sen"), false);
  assert.equal(travelMinutes("jimingsi", "presidential-palace"), 28);
  assert.equal(travelMinutes("laomendong", "qinhuai-cruise"), 15);
  assert.deepEqual(bestRoute(["music-stage", "ming-xiaoling"]).ids, bestRoute(["ming-xiaoling", "music-stage"]).ids);
});

test("nearby attractions on one walking line share a combined visit time", () => {
  const line = ["wutong-avenue", "meiling-palace", "sun-yat-sen", "music-stage"];
  assert.equal(canAddAttraction({ areaId: "zhongshan", attractionIds: line.slice(0, 3) }, "music-stage"), true);
  assert.ok(estimateMinutes(line) <= PERIOD_BUDGET_MINUTES);
  assert.ok(estimateMinutes(line) < line.reduce((total, id) => total + ATTRACTIONS.find((item) => item.id === id).duration, 0));
  assert.equal(canAddAttraction({ areaId: "zhongshan", attractionIds: ["ming-xiaoling", "meiling-palace"] }, "sun-yat-sen"), false);
  assert.equal(canAddAttraction({ areaId: "xuanwu", attractionIds: ["jimingsi", "taicheng"] }, "xuanwu-lake"), true);
  assert.equal(canAddAttraction({ areaId: "qinhuai", attractionIds: ["laomendong", "zhonghua-gate"] }, "confucius-temple"), true);
  assert.equal(canAddAttraction({ areaId: "zhongshan", attractionIds: ["ming-xiaoling"] }, "linggu-temple"), false);
});

test("suggested days connect neighboring areas and fit each half-day", () => {
  assert.deepEqual(ROUTE_SUGGESTIONS.map((route) => route.id), ["xuanwu-to-qinhuai", "zhongshan-to-xinjiekou", "museum-to-qinhuai", "wutong-lake-xinjiekou", "museum-memorial-temple"]);
  for (const route of ROUTE_SUGGESTIONS) {
    const plan = emptyPlan();
    for (const slot of route.slots) {
      assert.ok(estimateMinutes(slot.attractionIds) <= PERIOD_BUDGET_MINUTES);
      plan[`2026-10-24:${slot.periodId}`] = { areaId: slot.areaId, attractionIds: [...slot.attractionIds] };
    }
    for (const slot of route.slots) {
      assert.ok(allowedAreasForSlot(plan, "2026-10-24", slot.periodId).includes(slot.areaId));
    }
  }
  for (const cluster of VISIT_CLUSTERS) assert.ok(cluster.attractionIds.length >= 2);
  const memorialDay = ROUTE_SUGGESTIONS.find((route) => route.id === "museum-memorial-temple");
  assert.deepEqual(memorialDay.slots[1].attractionIds, ["massacre-memorial"]);
  assert.deepEqual(memorialDay.slots[2].attractionIds, ["laomendong", "confucius-temple", "qinhuai-cruise"]);
  assert.equal(memorialDay.dateOverrides, undefined);
  const closedOnDate = (route, dateId) => route.slots.flatMap((slot) => slot.attractionIds).some((id) => ATTRACTIONS.find((item) => item.id === id)?.closedOn?.includes(dateId));
  assert.equal(closedOnDate(memorialDay, "2026-10-24"), false);
  assert.equal(closedOnDate(memorialDay, "2026-10-25"), false);
  assert.equal(closedOnDate(memorialDay, "2026-10-26"), true);
  assert.equal(closedOnDate(ROUTE_SUGGESTIONS.find((route) => route.id === "museum-to-qinhuai"), "2026-10-26"), true);
  assert.equal(closedOnDate(ROUTE_SUGGESTIONS.find((route) => route.id === "zhongshan-to-xinjiekou"), "2026-10-26"), true);
  const lakeDay = ROUTE_SUGGESTIONS.find((route) => route.id === "xuanwu-to-qinhuai");
  assert.deepEqual(lakeDay.slots[0].attractionIds, ["jimingsi", "taicheng"]);
  assert.deepEqual(lakeDay.slots[1].attractionIds, ["xuanwu-lake", "xuanwu-gate"]);
  assert.equal(closedOnDate(lakeDay, "2026-10-26"), false);
});

test("night period contains evening experiences and Wutong Avenue is available", () => {
  assert.equal(PERIODS.at(-1).id, "night");
  assert.equal(ATTRACTIONS.find((item) => item.id === "wutong-avenue").areaId, "zhongshan");
  assert.ok(ATTRACTIONS.filter((item) => item.night).length >= 4);
});

test("Zhongshan Mausoleum and Meiling Palace describe who each visit suits", () => {
  for (const id of ["sun-yat-sen", "meiling-palace"]) {
    const attraction = ATTRACTIONS.find((item) => item.id === id);
    assert.ok(attraction.description.length > 40);
    assert.ok(attraction.suitableFor);
    assert.ok(attraction.lessSuitableFor);
  }
});

test("every attraction has audience guidance for its preview", () => {
  for (const attraction of ATTRACTIONS) {
    assert.ok(attraction.suitableFor, `${attraction.id} is missing suitableFor`);
    assert.ok(attraction.lessSuitableFor, `${attraction.id} is missing lessSuitableFor`);
  }
});

test("Jimingsi, Taicheng and Xuanwu Gate cross-link as nearby sights", () => {
  const byId = new Map(ATTRACTIONS.map((item) => [item.id, item]));
  for (const id of ["jimingsi", "taicheng", "xuanwu-gate"]) {
    const attraction = byId.get(id);
    assert.ok(attraction.nearbyNote);
    assert.ok(attraction.nearbyIds.length >= 2);
    for (const nearbyId of attraction.nearbyIds) assert.equal(byId.get(nearbyId).areaId, "xuanwu");
  }
});

test("shared files preserve Chinese names, dates and choices", () => {
  const plan = emptyPlan();
  plan["2026-10-25:pm"] = { areaId: "qinhuai", attractionIds: ["laomendong", "qinhuai-cruise"] };
  const person = normalizeParticipant({ id: "p-1", name: "小林", days: ["2026-10-25", "2026-10-26"], plan });
  const encoded = encodeShare(person);
  assert.equal(encoded.kind, "person");
  assert.equal(encoded.data.plan["2026-10-24:am"], undefined);
  const decoded = decodeShare(JSON.parse(JSON.stringify(encoded)));
  assert.equal(decoded.kind, "person");
  assert.equal(decoded.data.name, "小林");
  assert.deepEqual(decoded.data.plan["2026-10-25:pm"].attractionIds, ["laomendong", "qinhuai-cruise"]);
  assert.deepEqual(decoded.data.plan["2026-10-24:am"].attractionIds, []);
});

test("import normalization drops unknown attractions and merge replaces by nickname", () => {
  const clean = normalizeParticipant({
    id: "p-2", name: "阿宁", days: ["2026-10-24", "2099-01-01"],
    plan: {
      "2026-10-24:am": { areaId: "xuanwu", attractionIds: ["jimingsi", "not-a-place"] },
      "2026-10-24:pm": { areaId: "xuanwu", attractionIds: ["jimingsi", "xuanwu-lake"] },
    },
  });
  assert.deepEqual(clean.days, ["2026-10-24"]);
  assert.deepEqual(clean.plan["2026-10-24:am"].attractionIds, ["jimingsi"]);
  assert.deepEqual(clean.plan["2026-10-24:pm"].attractionIds, ["xuanwu-lake"]);
  assert.equal(mergeParticipant([clean], { ...clean, name: "阿宁", updatedAt: Date.now() }).length, 1);
  assert.ok(ATTRACTIONS.length >= 15);
});

test("Yihe Road and the memorial sit in a west area beside the city center", () => {
  const yihe = ATTRACTIONS.find((item) => item.id === "yihe-road");
  const memorial = ATTRACTIONS.find((item) => item.id === "massacre-memorial");
  assert.equal(yihe.areaId, "west");
  assert.equal(memorial.areaId, "west");
  assert.deepEqual(allowedAreas("west"), ["west", "city-center", "xuanwu", "qinhuai"]);
  assert.equal(canAddAttraction({ areaId: "west", attractionIds: [] }, "yihe-road"), true);
  assert.equal(canAddAttraction({ areaId: "west", attractionIds: ["yihe-road"] }, "massacre-memorial"), false);
  assert.equal(ATTRACTIONS.find((item) => item.id === "pioneer-bookstore").areaId, "xuanwu");
  assert.equal(ATTRACTIONS.find((item) => item.id === "pioneer-wutaishan").areaId, "west");
  assert.equal(canAddAttraction({ areaId: "xuanwu", attractionIds: ["xuanwu-gate"] }, "pioneer-bookstore"), true);
  assert.equal(canAddAttraction({ areaId: "west", attractionIds: [] }, "pioneer-wutaishan"), true);
  assert.equal(canAddAttraction({ areaId: "west", attractionIds: ["yihe-road"] }, "pioneer-wutaishan"), false);
  assert.equal(areaTransferMinutes("west", "city-center"), 33);
  const plan = emptyPlan();
  plan["2026-10-24:am"].areaId = "west";
  assert.deepEqual(allowedAreasForSlot(plan, "2026-10-24", "pm"), ["xuanwu", "city-center", "west", "qinhuai"]);
});
