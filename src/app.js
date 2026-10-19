import { AREAS, ATTRACTIONS, ATTRACTION_ACTIVITIES, PERIODS, ROUTE_SUGGESTIONS, TRIP_DATES, PERIOD_BUDGET_MINUTES, TRAVEL_ESTIMATE_NOTE } from "./data.js";
import { allowedAreas, allowedAreasForSlot, areaTransferRange, bestRoute, canAddAttraction, decodeShare, emptyPlan, encodeShare, mergeParticipant, normalizeParticipant, selectionEstimate, travelRange } from "./domain.js";

const STORAGE_KEY = "nanjing-choice-book-v1";
const one = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const slotKey = (dateId, periodId) => `${dateId}:${periodId}`;

function defaultState() {
  const id = crypto.randomUUID?.() ?? `traveler-${Math.random().toString(36).slice(2, 10)}`;
  return { meId: id, name: "我", days: [TRIP_DATES[0].id, TRIP_DATES[1].id], plan: emptyPlan(), people: [] };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return defaultState();
    const me = normalizeParticipant({ ...saved, id: saved.meId, updatedAt: saved.updatedAt });
    return {
      ...defaultState(),
      ...saved,
      meId: String(saved.meId || me?.id || crypto.randomUUID?.() || "local-user"),
      name: String(saved.name || me?.name || "我").slice(0, 24),
      days: me?.days ?? [TRIP_DATES[0].id, TRIP_DATES[1].id],
      plan: me?.plan ?? emptyPlan(),
      people: Array.isArray(saved.people) ? saved.people.map(normalizeParticipant).filter(Boolean).slice(-10) : [],
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
let activeDate = state.days[0] || TRIP_DATES[0].id;
let activePeriod = PERIODS[0].id;
let toastTimer;
let photoManifestPromise;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { showToast("此浏览器无法保存本机草稿。"); }
}

function currentSlot() {
  return state.plan[slotKey(activeDate, activePeriod)] ?? { areaId: null, attractionIds: [] };
}

function selectedElsewhere(currentKey) {
  return Object.entries(state.plan).filter(([key]) => key !== currentKey).flatMap(([, slot]) => slot.attractionIds);
}

function ownParticipant() {
  return normalizeParticipant({ id: state.meId, name: state.name, days: state.days, plan: state.plan, updatedAt: Date.now() });
}

function boardParticipants() {
  const merged = [...state.people];
  const own = ownParticipant();
  return own ? mergeParticipant(merged, own) : merged;
}

function minutesLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}小时${remainder ? `${remainder}分` : ""}` : `${minutes}分钟`;
}

async function setPhoto(frame, key, alt, position, photoEntry) {
  const files = photoEntry?.files || [];
  if (!files.length) return;
  frame.photoFiles = files;
  frame.photoFolder = photoEntry.folder;
  frame.photoAlt = alt;
  frame.photoPosition = position;
  frame.dataset.photoIndex = "0";
  await showPhoto(frame, 0);
}

async function showPhoto(frame, index) {
  const files = frame.photoFiles || [];
  if (!files.length) return;
  const safeIndex = (index + files.length) % files.length;
  frame.dataset.photoIndex = String(safeIndex);
  frame.querySelector("img")?.remove();
  const image = document.createElement("img");
  image.alt = frame.photoAlt;
  image.loading = "eager";
  image.style.objectPosition = frame.photoPosition;
  image.addEventListener("load", () => {
    frame.querySelector(".photo-placeholder-label")?.remove();
    frame.querySelector(".photo-placeholder-note")?.remove();
    frame.setAttribute("aria-label", frame.photoAlt);
    const counter = frame.querySelector(".photo-count");
    if (counter) {
      counter.hidden = files.length < 2;
      counter.textContent = `${safeIndex + 1} / ${files.length}`;
    }
    frame.querySelectorAll(".photo-nav").forEach((button) => { button.hidden = files.length < 2; });
  }, { once: true });
  image.addEventListener("error", () => {
    frame.querySelector(".photo-placeholder-label")?.remove();
    const note = frame.querySelector(".photo-placeholder-note");
    if (note) note.textContent = "照片读取失败";
  }, { once: true });
  image.src = `photos/${encodeURIComponent(frame.photoFolder)}/${encodeURIComponent(files[safeIndex])}`;
  frame.append(image);
}

async function renderPhotos() {
  const frames = all(".spot-detail-photo .photo-frame[data-photo-key]").filter((frame) => !frame.dataset.loaded && !frame.dataset.loading);
  if (frames.length === 0) return;
  for (const frame of frames) frame.dataset.loading = "true";
  photoManifestPromise ??= fetch("photos/manifest.json").then((response) => {
    if (!response.ok) throw new Error("Photo manifest unavailable");
    return response.json();
  }).catch(() => ({}));
  const manifest = await photoManifestPromise;
  for (const frame of frames) {
    const photoEntry = manifest[frame.dataset.photoKey];
    await setPhoto(frame, frame.dataset.photoKey, frame.dataset.photoAlt || "景点实景照片", frame.dataset.photoPosition || "50% 50%", photoEntry);
    frame.dataset.loaded = "true";
    delete frame.dataset.loading;
  }
}

function renderProfile() {
  const name = one("#traveler-name");
  if (document.activeElement !== name) name.value = state.name;
  one("#attendance-days").innerHTML = TRIP_DATES.map((day) => `
    <label class="day-check"><input type="checkbox" value="${day.id}" ${state.days.includes(day.id) ? "checked" : ""} />
      <span>${day.date} ${day.label}</span></label>`).join("");
  const attended = state.days.map((id) => TRIP_DATES.find((day) => day.id === id)?.label).filter(Boolean).join("、");
  one("#attendance-hint").textContent = attended ? `已标记：${attended}参加` : "先勾选你会参加的日期。";
}

function renderDays() {
  one("#day-tabs").innerHTML = TRIP_DATES.map((day) => {
    const daySlots = PERIODS.map((period) => state.plan[slotKey(day.id, period.id)]);
    const slotCount = daySlots.reduce((count, slot) => count + (slot?.attractionIds.length || 0), 0);
    const areaCount = daySlots.filter((slot) => slot?.areaId).length;
    const status = slotCount ? `${slotCount}处` : areaCount ? `${areaCount}段已定` : "待选";
    return `<button class="day-button ${day.id === activeDate ? "is-active" : ""}" type="button" role="tab" aria-selected="${day.id === activeDate}" data-date="${day.id}" ${state.days.includes(day.id) ? "" : "disabled"}>
      <span class="day-button-copy"><b>${day.date}</b><small>${day.label}</small></span><em>${status}</em></button>`;
  }).join("");
  if (!state.days.includes(activeDate)) activeDate = state.days[0] || TRIP_DATES[0].id;
}

function renderPeriods() {
  one("#period-tabs").innerHTML = PERIODS.map((period) => `<button type="button" class="period-button ${period.id === activePeriod ? "is-active" : ""}" data-period="${period.id}" role="tab" aria-selected="${period.id === activePeriod}"><span>${period.label}</span><small>${period.range}</small></button>`).join("");
  const day = TRIP_DATES.find((item) => item.id === activeDate);
  const period = PERIODS.find((item) => item.id === activePeriod);
  one("#slot-title").textContent = `${day?.label || ""} · ${period?.label || ""}`;
}

function renderAreas() {
  const slot = currentSlot();
  const permitted = allowedAreasForSlot(state.plan, activeDate, activePeriod);
  one("#area-list").innerHTML = AREAS.map((area) => `
    <button class="area-option ${slot.areaId === area.id ? "is-active" : ""} ${permitted.includes(area.id) ? "" : "is-disabled"}" type="button" data-area="${area.id}" aria-pressed="${slot.areaId === area.id}" ${slot.areaId === area.id && slot.attractionIds.length === 0 ? "title=\"再次点选可清空此时段片区\"" : ""} ${permitted.includes(area.id) ? "" : "disabled"}>
      <span class="area-option-index">${String(AREAS.indexOf(area) + 1).padStart(2, "0")}</span>
      <span class="area-option-copy"><b>${area.name}</b><small>${area.descriptor}</small></span>
      ${slot.areaId === area.id && slot.attractionIds.length === 0 ? "<span class=\"area-option-clear\" title=\"清空此时段片区\" aria-hidden=\"true\">×</span>" : ""}
    </button>`).join("");
  one("#route-state").textContent = slot.areaId ? `起点 · ${AREAS.find((area) => area.id === slot.areaId)?.shortName}` : "尚未选片区";
  one("#route-state").classList.toggle("is-locked", Boolean(slot.areaId));
  const index = PERIODS.findIndex((period) => period.id === activePeriod);
  const neighbor = [PERIODS[index - 1], PERIODS[index + 1]].filter(Boolean)
    .map((period) => state.plan[slotKey(activeDate, period.id)]).find((item) => item?.areaId);
  one("#route-guidance").textContent = slot.areaId
    ? `${AREAS.find((area) => area.id === slot.areaId)?.pace || ""} 列表只含本区与紧邻片区。`
    : neighbor?.areaId
      ? `为衔接相邻时段路线，此时段只能选${AREAS.find((area) => area.id === neighbor.areaId)?.shortName}片区或紧邻片区。`
      : "选定片区后，景点列表会收窄到本区和紧邻片区。";
  renderDayTransition();
}

function renderDayTransition() {
  const note = one("#day-transition");
  const transitions = [];
  for (let index = 0; index < PERIODS.length - 1; index += 1) {
    const fromPeriod = PERIODS[index];
    const toPeriod = PERIODS[index + 1];
    const from = state.plan[slotKey(activeDate, fromPeriod.id)];
    const to = state.plan[slotKey(activeDate, toPeriod.id)];
    if (!from?.areaId || !to?.areaId) continue;
    const fromAttraction = from.attractionIds.at(-1);
    const toAttraction = to.attractionIds[0];
    const range = fromAttraction && toAttraction
      ? travelRange(fromAttraction, toAttraction)
      : areaTransferRange(from.areaId, to.areaId);
    if (range) transitions.push(`${fromPeriod.label} → ${toPeriod.label} 转场约 ${range[0]}–${range[1]} 分钟`);
  }
  if (transitions.length === 0) { note.hidden = true; return; }
  note.hidden = false;
  note.textContent = `${transitions.join("；")}。时段间约有 60 分钟；估算不含候车与步行到站。`;
}

function renderBudget() {
  const slot = currentSlot();
  if (!slot.areaId || slot.attractionIds.length === 0) {
    one("#budget-row").hidden = true;
    return;
  }
  const estimate = selectionEstimate(slot.attractionIds);
  const route = bestRoute(slot.attractionIds);
  one("#budget-row").hidden = false;
  one("#budget-text").textContent = `游览约 ${minutesLabel(estimate.visit)} + 移动约 ${minutesLabel(estimate.travelLow)}–${minutesLabel(estimate.travelHigh)} = ${minutesLabel(estimate.visit + estimate.travelLow)}–${minutesLabel(estimate.totalHigh)} / 4小时`;
  one("#budget-text").title = TRAVEL_ESTIMATE_NOTE;
  one("#budget-fill").style.width = `${Math.min(100, (estimate.totalHigh / PERIOD_BUDGET_MINUTES) * 100)}%`;
  const routeNames = route.ids.map((id) => ATTRACTIONS.find((item) => item.id === id)?.name).filter(Boolean);
  const clusterNote = estimate.clusters[0]?.note;
  one("#route-guidance").textContent = routeNames.length > 1
    ? `建议游览顺序：${routeNames.join(" → ")}。${clusterNote || "不按加入顺序计算。"} ${TRAVEL_ESTIMATE_NOTE}`
    : slot.areaId
      ? `${AREAS.find((area) => area.id === slot.areaId)?.pace || ""} 列表只含本区与紧邻片区。${TRAVEL_ESTIMATE_NOTE}`
      : "选定片区后，景点列表会收窄到本区和紧邻片区。";
}

function renderAttractionCard(attraction, slot = null, elsewhere = []) {
  const selected = Boolean(slot?.attractionIds.includes(attraction.id));
  const alreadyScheduled = elsewhere.includes(attraction.id);
  const canAdd = slot && (selected || (!alreadyScheduled && canAddAttraction(slot, attraction.id, elsewhere)));
  const route = slot ? bestRoute(slot.attractionIds) : { ids: [] };
  const selectedIndex = route.ids.indexOf(attraction.id);
  const previousId = selectedIndex > 0 ? route.ids[selectedIndex - 1] : null;
  const range = previousId ? travelRange(previousId, attraction.id) : null;
  const routeLabel = selected ? ` · 建议第 ${selectedIndex + 1} 站${range ? `，转场 ${range[0]}–${range[1]} 分` : ""}` : "";
  const activities = ATTRACTION_ACTIVITIES[attraction.id] || [];
  const pickAction = slot ? `<button class="pick-button ${selected ? "is-selected" : ""}" type="button" data-pick="${attraction.id}" aria-pressed="${selected}" ${canAdd ? "" : "disabled"}>${selected ? "已选 · 移除" : alreadyScheduled ? "已安排其他时段" : "加入时段"}</button>` : "";
  return `<article class="attraction-card ${selected ? "is-selected" : ""}">
    <div class="attraction-copy">
      <div class="attraction-topline"><button class="attraction-name" type="button" data-detail="${attraction.id}">${attraction.name}</button><span class="attraction-price">${attraction.price}</span></div>
      <div class="activity-tags">${activities.map((activity) => `<span>${activity}</span>`).join("")}</div>
      <p class="attraction-description">${attraction.description}</p>
      <div class="attraction-bottom"><span class="attraction-time">适合${attraction.best} · 游览约${minutesLabel(attraction.duration)}${routeLabel}</span>
        <span class="attraction-actions"><button class="preview-button" type="button" data-detail="${attraction.id}">预览</button>${pickAction}</span>
      </div>
    </div>
  </article>`;
}

function renderAttractions() {
  const slot = currentSlot();
  const list = one("#attraction-list");
  if (!slot.areaId) {
    one("#result-count").textContent = "";
    list.innerHTML = `<div class="empty-slot">先点选上方片区，景点清单就会出现在这里。</div>`;
    return;
  }
  const areaIds = allowedAreas(slot.areaId);
  const visibleAttraction = (attraction) => activePeriod === "night"
    ? Boolean(attraction.night || attraction.alsoNight)
    : !attraction.night;
  const groups = areaIds.map((areaId) => ({
    area: AREAS.find((area) => area.id === areaId),
    attractions: ATTRACTIONS.filter((attraction) => attraction.areaId === areaId && visibleAttraction(attraction)),
    isAnchor: areaId === slot.areaId,
    transfer: areaId === slot.areaId ? null : areaTransferRange(slot.areaId, areaId),
  })).filter((group) => group.attractions.length > 0);
  const options = groups.flatMap((group) => group.attractions);
  const elsewhere = selectedElsewhere(slotKey(activeDate, activePeriod));
  one("#result-count").textContent = `${options.length} 处 · ${groups.length} 个片区`;
  one("#attraction-heading").textContent = "片区内与附近景点";
  list.innerHTML = groups.map((group) => `<section class="attraction-group ${group.isAnchor ? "is-anchor" : "is-adjacent"}">
    <header class="attraction-group-head">
      <div><span class="group-role">${group.isAnchor ? "起点片区" : "相邻可串联"}</span><h4>${group.area.name}</h4></div>
      <span class="group-meta">${group.attractions.length} 处${group.transfer ? ` · 转场约 ${group.transfer[0]}–${group.transfer[1]} 分` : ""}</span>
    </header>
    <div class="attraction-group-cards">${group.attractions.map((attraction) => renderAttractionCard(attraction, slot, elsewhere)).join("")}</div>
  </section>`).join("") || `<div class="empty-slot">这个时段的片区暂无已收录景点。</div>`;
  renderPhotos();
}

function renderCatalog() {
  renderRouteSuggestions();
  const areaSelect = one("#catalog-area");
  if (areaSelect.options.length === 1) {
    areaSelect.insertAdjacentHTML("beforeend", AREAS.map((area) => `<option value="${area.id}">${area.name}</option>`).join(""));
  }
  const search = one("#catalog-search").value.trim().toLocaleLowerCase("zh-CN");
  const areaFilter = one("#catalog-area").value;
  const matches = (attraction) => {
    if (areaFilter !== "all" && attraction.areaId !== areaFilter) return false;
    if (!search) return true;
    const activities = ATTRACTION_ACTIVITIES[attraction.id] || [];
    return [attraction.name, attraction.category, attraction.description, ...activities].join(" ").toLocaleLowerCase("zh-CN").includes(search);
  };
  const groups = AREAS.map((area) => ({ area, attractions: ATTRACTIONS.filter((item) => item.areaId === area.id && matches(item)) }))
    .filter((group) => group.attractions.length > 0);
  const count = groups.reduce((total, group) => total + group.attractions.length, 0);
  one("#catalog-count").textContent = `全部 ${ATTRACTIONS.length} 处 · 当前 ${count} 处`;
  one("#catalog-list").innerHTML = groups.length ? groups.map((group) => `<section class="catalog-area-section">
    <header class="catalog-area-heading"><div><p class="section-kicker">片区 · ${group.attractions.length} 处</p><h3>${group.area.name}</h3><span>${group.area.descriptor}</span></div></header>
    <div class="attraction-group-cards">${group.attractions.map((attraction) => renderAttractionCard(attraction)).join("")}</div>
  </section>`).join("") : `<div class="empty-slot">没有找到符合条件的景点。</div>`;
}

function routeStop(id) {
  const attraction = ATTRACTIONS.find((item) => item.id === id);
  if (!attraction) return "";
  return `<button class="route-stop" type="button" data-detail="${attraction.id}">${attraction.name}<small>预览</small></button>`;
}

function routeForDate(route, dateId) {
  const override = route.dateOverrides?.[dateId];
  if (!override) return route;
  return { ...route, ...override, slots: override.slots ?? route.slots };
}

function routeClosedOn(route, dateId) {
  return route.slots.flatMap((slot) => slot.attractionIds).some((id) => ATTRACTIONS.find((item) => item.id === id)?.closedOn?.includes(dateId));
}

function applyTargets(route) {
  return TRIP_DATES.filter((day) => state.days.includes(day.id) && !routeClosedOn(route, day.id));
}

function renderRouteSuggestions() {
  one("#route-suggestions").innerHTML = `
    <div class="route-heading">
      <div>
        <p class="section-kicker">可以先看一条线</p>
        <h3>推荐路线</h3>
      </div>
      <span class="result-count">${ROUTE_SUGGESTIONS.length} 条 · 可套用到参加的开放日</span>
    </div>
    <div class="route-card-list">${ROUTE_SUGGESTIONS.map((item) => {
      const targets = applyTargets(item);
      return `
      <article class="route-card">
        <div class="route-card-top"><b>${item.title}</b><span>${item.fit}</span></div>
        <p>${item.summary}</p>
        ${item.orders?.length ? `<ol class="route-orders">${item.orders.map((order, index) => `<li><span>${index + 1}</span>${order}</li>`).join("")}</ol>` : ""}
        <div class="route-stops">${item.slots.map((slot) => {
          const period = PERIODS.find((periodItem) => periodItem.id === slot.periodId);
          return `<div class="route-stop-row"><span>${period?.label || ""}</span><div>${slot.attractionIds.map(routeStop).join("")}</div></div>`;
        }).join("")}</div>
        <p class="route-card-note">${item.caution}</p>
        <div class="route-apply">${targets.length
          ? targets.map((day) => `<button class="button button-secondary" type="button" data-apply-route="${item.id}" data-apply-date="${day.id}">套用到${day.label}</button>`).join("")
          : `<span class="route-apply-empty">参加的日期里，这条线没有可开放的一天</span>`}</div>
      </article>`;
    }).join("")}
    </div>`;
}

function applyRoute(routeId, dateId) {
  const source = ROUTE_SUGGESTIONS.find((item) => item.id === routeId);
  const day = TRIP_DATES.find((item) => item.id === dateId);
  if (!source || !day || !state.days.includes(dateId) || routeClosedOn(source, dateId)) return;
  const route = routeForDate(source, dateId);
  const blocked = [];
  for (const slot of route.slots) {
    const key = slotKey(dateId, slot.periodId);
    const existing = state.plan[key];
    if (existing.attractionIds.some((id) => !slot.attractionIds.includes(id))) blocked.push(PERIODS.find((item) => item.id === slot.periodId)?.label);
    for (const id of slot.attractionIds) {
      const owner = Object.entries(state.plan).find(([keyName, item]) => keyName !== key && item.attractionIds.includes(id));
      if (owner) blocked.push(ATTRACTIONS.find((item) => item.id === id)?.name);
    }
  }
  if (blocked.length) {
    showToast(`${[...new Set(blocked)].join("、")}已经有安排，这条路线没有写入。`);
    return;
  }
  for (const slot of route.slots) {
    state.plan[slotKey(dateId, slot.periodId)] = { areaId: slot.areaId || route.areaId, attractionIds: [...slot.attractionIds] };
  }
  activeDate = dateId;
  activePeriod = route.slots[0].periodId;
  persist();
  switchView("planner");
  showToast(`已写入${day.date}${day.label}。可以再改。`);
}

function renderPlanner() {
  renderProfile();
  renderDays();
  renderPeriods();
  renderAreas();
  renderBudget();
  renderAttractions();
}

function personSlotLabel(person, date, period) {
  if (!person.days.includes(date.id)) return null;
  const slot = person.plan[slotKey(date.id, period.id)];
  if (!slot?.attractionIds.length) return "尚未选择";
  return slot.attractionIds.map((id) => ATTRACTIONS.find((attraction) => attraction.id === id)?.name).filter(Boolean).join("、");
}

function personSlotEstimate(person, date, period) {
  const ids = person.plan[slotKey(date.id, period.id)]?.attractionIds || [];
  if (ids.length === 0) return "";
  const estimate = selectionEstimate(ids);
  return `游览 ${minutesLabel(estimate.visit)} + 移动 ${minutesLabel(estimate.travelLow)}–${minutesLabel(estimate.travelHigh)}，合计约 ${minutesLabel(estimate.visit + estimate.travelLow)}–${minutesLabel(estimate.totalHigh)}`;
}

function renderSummary() {
  const participants = boardParticipants();
  one("#shared-count").textContent = String(Math.max(0, participants.length - (ownParticipant() ? 1 : 0)));
  one("#summary-empty").hidden = participants.length > 0;
  one("#summary-list").innerHTML = participants.map((person) => {
    const isSelf = person.id === state.meId;
    const days = TRIP_DATES.filter((day) => person.days.includes(day.id));
    const dayMarkup = days.map((day) => `<div class="participant-day">
      <div class="participant-day-head"><span>${day.date} · ${day.label}</span><span>${PERIODS.reduce((sum, period) => sum + (person.plan[slotKey(day.id, period.id)]?.attractionIds.length || 0), 0)} 处</span></div>
      ${PERIODS.map((period) => `<div class="participant-period"><strong>${period.label}</strong><span>${personSlotLabel(person, day, period) || "尚未选择"}${personSlotEstimate(person, day, period) ? `<small>${personSlotEstimate(person, day, period)}</small>` : ""}</span></div>`).join("")}
    </div>`).join("");
    return `<article class="participant-card">
      <header class="participant-head"><div><h3>${escapeHTML(person.name)}${isSelf ? " <small>(我)</small>" : ""}</h3><p class="participant-meta">参加 ${days.map((day) => day.label).join("、")}</p></div>
      ${isSelf ? "" : `<button class="remove-person" type="button" data-remove="${escapeAttribute(person.id)}" aria-label="移除 ${escapeAttribute(person.name)}">×</button>`}</header>
      <div class="participant-slots">${dayMarkup || `<div class="participant-day"><span class="participant-meta">尚未标记参加日期</span></div>`}</div>
    </article>`;
  }).join("");

  const votes = new Map();
  for (const person of participants) {
    for (const date of person.days) {
      for (const period of PERIODS) {
        const slot = person.plan[slotKey(date, period.id)];
        for (const attractionId of slot?.attractionIds || []) {
          const key = `${date}:${period.id}:${attractionId}`;
          votes.set(key, (votes.get(key) || 0) + 1);
        }
      }
    }
  }
  const overlap = [...votes.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  one("#interest-summary").hidden = overlap.length === 0;
  one("#interest-list").innerHTML = overlap.slice(0, 12).map(([key, count]) => {
    const [dateId, periodId, attractionId] = key.split(":");
    const date = TRIP_DATES.find((day) => day.id === dateId);
    const period = PERIODS.find((item) => item.id === periodId);
    const attraction = ATTRACTIONS.find((item) => item.id === attractionId);
    return `<div class="interest-item"><b>${date?.date} ${period?.label} · ${attraction?.name}</b><span>${count} 人同选</span></div>`;
  }).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }

function render() {
  renderPlanner();
  renderCatalog();
  renderSummary();
  renderPhotos();
}

function showToast(message) {
  const toast = one("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function exportPayload(kind) {
  const people = boardParticipants();
  if (kind === "person") {
    const own = ownParticipant();
    if (!own) throw new Error("请先填写昵称和游玩日期。");
    if (!Object.values(own.plan).some((slot) => slot.attractionIds.length)) throw new Error("至少选一处景点，再下载选择文件。");
    return encodeShare(own, "person");
  }
  if (!people.some((person) => Object.values(person.plan).some((slot) => slot.attractionIds.length))) throw new Error("还没有景点选择可以汇总。");
  return encodeShare({ participants: people }, "board");
}

function downloadShare(kind) {
  const payload = exportPayload(kind);
  const label = kind === "person" ? (payload.data.name || "我的选择") : "同行汇总";
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `南京旅行-${label}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(kind === "person" ? "选择文件已下载，可以发到群里。" : "汇总文件已下载。");
}

function applyImported(decoded) {
  const incoming = decoded.kind === "person" ? [decoded.data] : decoded.data.participants;
  for (const person of incoming) state.people = mergeParticipant(state.people, person).filter((item) => item.id !== state.meId);
  persist();
  renderSummary();
  switchView("summary");
  showToast(`已导入 ${incoming.length} 份选择。`);
}

function importShareText(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("这个文件不是有效的 JSON。"); }
  applyImported(decodeShare(parsed));
}

function switchView(view) {
  for (const panel of ["catalog", "planner", "summary"]) one(`#${panel}-view`).hidden = panel !== view;
  for (const button of all(".view-tab")) {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  if (view === "catalog") renderCatalog();
  if (view === "planner") renderPlanner();
  if (view === "summary") renderSummary();
  window.scrollTo({ top: one(".view-tabs").offsetTop - 5, behavior: "smooth" });
}

function showSpot(attractionId) {
  const attraction = ATTRACTIONS.find((item) => item.id === attractionId);
  if (!attraction) return;
  const area = AREAS.find((item) => item.id === attraction.areaId);
  const isSelected = currentSlot().attractionIds.includes(attractionId);
  const alreadyScheduled = selectedElsewhere(slotKey(activeDate, activePeriod)).includes(attractionId);
  const canAdd = isSelected || (!alreadyScheduled && canAddAttraction(currentSlot(), attractionId, selectedElsewhere(slotKey(activeDate, activePeriod))));
  const suitability = attraction.suitableFor || attraction.lessSuitableFor
    ? `<div class="spot-suitability">
      ${attraction.suitableFor ? `<section><b>适合</b><p>${attraction.suitableFor}</p></section>` : ""}
      ${attraction.lessSuitableFor ? `<section><b>可能不太适合</b><p>${attraction.lessSuitableFor}</p></section>` : ""}
    </div>`
    : "";
  const nearby = (attraction.nearbyIds || []).map((id) => ATTRACTIONS.find((item) => item.id === id)).filter(Boolean);
  const nearbyMarkup = nearby.length ? `<section class="spot-nearby">
    <div class="spot-nearby-heading"><h3>附近可顺游</h3><span>${area?.shortName || "同片区"}</span></div>
    <p>${attraction.nearbyNote || "都在同一片区，可按体力接着安排。"}</p>
    <div class="spot-nearby-links">${nearby.map((item) => `<button type="button" data-nearby-detail="${item.id}">${item.name}<span>预览 →</span></button>`).join("")}</div>
  </section>` : "";
  one("#spot-detail").innerHTML = `<div class="spot-detail">
    <div class="spot-detail-photo">
      <span class="photo-frame" data-photo-key="${attraction.id}" data-photo-alt="${attraction.name}实景照片" data-photo-position="${attraction.photoPosition || "50% 50%"}"><span class="photo-placeholder-label">${attraction.name}</span><span class="photo-placeholder-note">照片尚未添加</span><button class="photo-nav photo-nav-prev" type="button" data-photo-step="-1" aria-label="上一张照片" hidden>‹</button><button class="photo-nav photo-nav-next" type="button" data-photo-step="1" aria-label="下一张照片" hidden>›</button><span class="photo-count" hidden></span></span>
    </div>
    <div class="spot-detail-meta"><span class="detail-tag">${area?.name || "南京"}</span><span class="detail-tag">${attraction.category}</span><span class="detail-tag">适合${attraction.best}</span><span class="detail-tag">约 ${minutesLabel(attraction.duration)}</span></div>
    <h2>${attraction.name}</h2><p class="spot-detail-copy">${attraction.description}</p>
    ${nearbyMarkup}
    ${suitability}
    ${attraction.transportNote ? `<p class="spot-transit-note">${attraction.transportNote} <a href="${attraction.transportSourceUrl}" target="_blank" rel="noreferrer">${attraction.transportSource} ↗</a></p>` : ""}
    <p class="spot-reservation"><b>${attraction.price}</b>　${attraction.reservation}<br />预计游览 ${minutesLabel(attraction.duration)}。成人参考价；出发前请在景区官方渠道确认票价、开放与预约安排。</p>
    <p class="spot-travel-note">${TRAVEL_ESTIMATE_NOTE}</p>
    <div class="spot-detail-actions">${isSelected ? `<button class="pick-button is-selected" type="button" data-detail-pick="${attraction.id}">已加入当前时段 · 移除</button>` : `<button class="pick-button" type="button" data-detail-pick="${attraction.id}" ${canAdd ? "" : "disabled"}>${alreadyScheduled ? "已安排在其他时段" : canAdd ? "加入当前时段" : "先选片区或腾出时间"}</button>`}<a class="spot-source" href="${attraction.sourceUrl}" target="_blank" rel="noreferrer">${attraction.source} ↗</a></div>
  </div>`;
  const dialog = one("#spot-dialog");
  if (!dialog.open) dialog.showModal();
  renderPhotos();
}

function bindEvents() {
  one("#catalog-search").addEventListener("input", renderCatalog);
  one("#catalog-area").addEventListener("change", renderCatalog);
  one("#catalog-list").addEventListener("click", (event) => {
    const detail = event.target.closest("[data-detail]");
    if (detail) showSpot(detail.dataset.detail);
  });
  one("#route-suggestions").addEventListener("click", (event) => {
    const detail = event.target.closest("[data-detail]");
    if (detail) { showSpot(detail.dataset.detail); return; }
    const button = event.target.closest("[data-apply-route]");
    if (button) applyRoute(button.dataset.applyRoute, button.dataset.applyDate);
  });
  one("#traveler-name").addEventListener("input", (event) => {
    state.name = event.target.value.slice(0, 24);
    persist();
    renderSummary();
  });
  one("#attendance-days").addEventListener("change", (event) => {
    if (event.target.type !== "checkbox") return;
    const id = event.target.value;
    state.days = event.target.checked ? [...new Set([...state.days, id])] : state.days.filter((item) => item !== id);
    if (state.days.length === 0) {
      state.days = [id];
      event.target.checked = true;
      showToast("至少保留一个参加日期。");
    }
    persist();
    render();
  });
  one("#day-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button || button.disabled) return;
    activeDate = button.dataset.date;
    render();
  });
  one("#period-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-period]");
    if (!button) return;
    activePeriod = button.dataset.period;
    render();
  });
  one("#area-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-area]");
    if (!button || button.disabled) return;
    const slot = currentSlot();
    const areaId = button.dataset.area;
    if (!allowedAreasForSlot(state.plan, activeDate, activePeriod).includes(areaId)) return;
    if (slot.areaId === areaId) {
      if (slot.attractionIds.length > 0) { showToast("请先移除此时段的景点，再清空片区。"); return; }
      slot.areaId = null;
      state.plan[slotKey(activeDate, activePeriod)] = slot;
      persist();
      render();
      return;
    }
    if (slot.areaId && !allowedAreas(slot.areaId).includes(areaId)) return;
    slot.areaId = areaId;
    slot.attractionIds = slot.attractionIds.filter((id) => allowedAreas(areaId).includes(ATTRACTIONS.find((item) => item.id === id)?.areaId));
    state.plan[slotKey(activeDate, activePeriod)] = slot;
    persist();
    render();
  });
  one("#attraction-list").addEventListener("click", (event) => {
    const detail = event.target.closest("[data-detail]");
    if (detail) { showSpot(detail.dataset.detail); return; }
    const button = event.target.closest("[data-pick]");
    if (!button) return;
    const id = button.dataset.pick;
    const slot = currentSlot();
    if (slot.attractionIds.includes(id)) slot.attractionIds = slot.attractionIds.filter((item) => item !== id);
    else if (canAddAttraction(slot, id, selectedElsewhere(slotKey(activeDate, activePeriod)))) slot.attractionIds.push(id);
    else { showToast("这个时段已接近 4 小时，先移除一处再选。"); return; }
    state.plan[slotKey(activeDate, activePeriod)] = slot;
    persist();
    render();
  });
  for (const button of all("[data-view]")) button.addEventListener("click", () => switchView(button.dataset.view));
  one("#share-open").addEventListener("click", () => {
    try { downloadShare("person"); }
    catch (error) { showToast(error.message); }
  });
  one("#board-share").addEventListener("click", () => {
    try { downloadShare("board"); }
    catch (error) { showToast(error.message); }
  });
  one("#import-open").addEventListener("click", () => {
    one("#import-file").value = "";
    one("#import-dialog").showModal();
  });
  one("#import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importShareText(await file.text());
      one("#import-dialog").close();
    } catch (error) {
      showToast(error.message || "导入失败，请确认文件完整。");
    } finally {
      event.target.value = "";
    }
  });
  one("#summary-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    state.people = state.people.filter((person) => person.id !== button.dataset.remove);
    persist();
    renderSummary();
    showToast("已从本机汇总移除。");
  });
  one("#spot-detail").addEventListener("click", (event) => {
    const photoButton = event.target.closest("[data-photo-step]");
    if (photoButton) {
      const frame = photoButton.closest(".photo-frame");
      if (frame?.photoFiles?.length > 1) showPhoto(frame, Number(frame.dataset.photoIndex) + Number(photoButton.dataset.photoStep));
      return;
    }
    const nearbyButton = event.target.closest("[data-nearby-detail]");
    if (nearbyButton) { showSpot(nearbyButton.dataset.nearbyDetail); return; }
    const button = event.target.closest("[data-detail-pick]");
    if (!button) return;
    const id = button.dataset.detailPick;
    const slot = currentSlot();
    if (slot.attractionIds.includes(id)) slot.attractionIds = slot.attractionIds.filter((item) => item !== id);
    else if (canAddAttraction(slot, id, selectedElsewhere(slotKey(activeDate, activePeriod)))) slot.attractionIds.push(id);
    else { showToast("请先选择片区；或这个景点已排在其他时段 / 本时段已接近 4 小时。"); return; }
    state.plan[slotKey(activeDate, activePeriod)] = slot;
    persist();
    one("#spot-dialog").close();
    render();
  });
}

bindEvents();
render();
