// ==== CONFIG ====
const API_KEY = "AIzaSyD4P5R5ESGIeMbBsWFC37OBM6t_MKMJXQA";
const CHANNEL_ID = "UCwkVDkOudIxhYMG61Jv8Tww";
const TWITTER_USERNAME = "FeileacanCu";
const MAX_RESULTS = 4000;

// ==== UTILITIES ====
function parseDurationToMinutes(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = parseInt(match?.[1] || 0);
  const m = parseInt(match?.[2] || 0);
  const s = parseInt(match?.[3] || 0);
  return h * 60 + m + s / 60;
}

function parseZatsuToMinutes(value) {
  if (!value) return 0;
  const parts = value.split(":").map((n) => parseFloat(n));
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 60 + m + s / 60;
  } else if (parts.length === 2) {
    const [m, s] = parts;
    return m + s / 60;
  } else if (parts.length === 1 && !isNaN(parts[0])) {
    return parts[0];
  }
  return 0;
}

// still utils, just slider minutes
function formatMinutesShort(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}` : `${m}`;
}


function formatMinutesToHM(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ==== YOUTUBE DATA ====
async function getChannelDetails() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items?.length) return null;

  const channel = data.items[0].snippet;

  const titleEl = document.getElementById("channel-title");
  if (titleEl) titleEl.textContent = channel.title;

  const thumbEl = document.getElementById("channel-thumbnail");
  if (thumbEl) thumbEl.src = channel.thumbnails?.high?.url || "";

  const ytLinkEl = document.getElementById("youtube-link");
  if (ytLinkEl) ytLinkEl.href = `https://www.youtube.com/channel/${CHANNEL_ID}/streams`;

  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getVideosFromPlaylist(playlistId) {
  let videos = [];
  let pageToken = "";

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.search = new URLSearchParams({
      part: "snippet",
      maxResults: "50",
      playlistId,
      pageToken,
      key: API_KEY,
    }).toString();

    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) break;

    videos.push(...data.items);
    pageToken = data.nextPageToken || "";
    await new Promise((r) => setTimeout(r, 150)); // rate limit safety
  } while (pageToken);

  const videoIds = videos.map((v) => v.snippet.resourceId.videoId);
  const details = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(",");
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,liveStreamingDetails,snippet&id=${chunk}&key=${API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    details.push(...(detailsData.items || []));
    await new Promise((r) => setTimeout(r, 150));
  }

  return details
    .filter((v) => v.snippet.liveBroadcastContent === "none" && v.liveStreamingDetails)
    .map((v) => ({
      id: v.id,
      title: v.snippet.title,
      date: v.snippet.publishedAt,
      duration: v.contentDetails.duration,
      durationMinutes: parseDurationToMinutes(v.contentDetails.duration),
      thumbnail: v.snippet.thumbnails?.high?.url || "",
    }));
}


// ==== TAG FILTER HELPERS ====
function loadStreamTags() {
  const csvDataEl = document.getElementById("meta-csv");
  if (!csvDataEl) return {}; // safe for suggest.html

  const csvData = csvDataEl.textContent.trim();
  const lines = csvData.split("\n").filter((line) => line.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1);

  const tagMap = {};

  for (const row of rows) {
    const cols = row.split(",");
    const record = {};
    headers.forEach((h, i) => {
      record[h] = (cols[i] || "").trim();
    });

    const id = extractVideoId(record.stream_link);
    if (!id) continue;

    // Parse zatsu_start into minutes
    const zatsuStartMinutes = parseZatsuToMinutes(record.zatsu_start);

    tagMap[id] = { ...record, zatsuStartMinutes };
  }

  return tagMap;
}


function extractVideoId(url) {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}


// ==== TAG BUTTONS (3-state) ====
let tagStates = {};

function createTagButtons(tagNames) {
  const container = document.getElementById("tag-filters");
  if (!container) return;

  container.innerHTML = "";
  tagStates = {}; // reset on re-init

  tagNames.forEach(tag => {
    tagStates[tag] = "none";
    const btn = document.createElement("button");
    btn.className = "tag-btn";
    btn.innerHTML = `<span>${tag}</span>`;
    btn.addEventListener("click", () => cycleTagState(tag, btn));
    updateTagButtonStyle(btn, "none");
    container.appendChild(btn);
  });
}

function cycleTagState(tag, btn) {
  const states = ["none", "include", "exclude"];
  const next = states[(states.indexOf(tagStates[tag]) + 1) % states.length];
  setTagState(tag, btn, next);
  filterAndSortStreams();
}

function setTagState(tag, btn, state) {
  tagStates[tag] = state;
  updateTagButtonStyle(btn, state);
}

function updateTagButtonStyle(btn, state) {
  btn.classList.remove("include", "exclude");
  if (state === "include") btn.classList.add("include");
  if (state === "exclude") btn.classList.add("exclude");
}


// ==== SLIDER LOGIC (GENERIC) ====
function setupDualSlider(options) {
  const {
    minId, maxId, fillId,
    minLabelId, maxLabelId,
    containerId,
    realMax,
    onChange
  } = options;

  const minInput = document.getElementById(minId);
  const maxInput = document.getElementById(maxId);
  const rangeFill = document.getElementById(fillId);
  const minLabelEl = document.getElementById(minLabelId);
  const maxLabelEl = document.getElementById(maxLabelId);

  if (!minInput || !maxInput) {
    console.warn(`[Slider ${containerId}] Elements not found — skipping.`);
    return;
  }

  const sliderMin = 0;
  const sliderMax = Math.max(1, Math.round(realMax));
  const STEP = 1;

  [minInput, maxInput].forEach((input) => {
    input.min = sliderMin;
    input.max = sliderMax;
    input.step = STEP;
  });

  minInput.value = sliderMin;
  maxInput.value = sliderMax;

function updateFill(minV, maxV) {
  const cont = document.getElementById(containerId);
  if (!cont || !rangeFill) return;

  // ✅ Always read the *current* slider range dynamically
  const sliderMin = parseFloat(minInput.min);
  const sliderMax = parseFloat(maxInput.max);

  // Guard: avoid divide-by-zero if something odd happens
  const range = Math.max(1, sliderMax - sliderMin);

  const percentMin = ((minV - sliderMin) / range) * 100;
  const percentMax = ((maxV - sliderMin) / range) * 100;

  rangeFill.style.left = percentMin + "%";
  rangeFill.style.width = Math.max(0, percentMax - percentMin) + "%";
}


  const handleInput = () => {
    let minVal = parseInt(minInput.value);
    let maxVal = parseInt(maxInput.value);
    if (minVal > maxVal - STEP) minVal = maxVal - STEP;
    if (maxVal < minVal + STEP) maxVal = minVal + STEP;

    minInput.value = minVal;
    maxInput.value = maxVal;
    updateFill(minVal, maxVal);

    // ✅ Format labels nicely
    if (minLabelEl) minLabelEl.textContent = formatMinutesShort(minVal);
    if (maxLabelEl) maxLabelEl.textContent = formatMinutesShort(maxVal);

    if (onChange) onChange(minVal, maxVal);
  };

  // Attach events
  minInput.addEventListener("input", handleInput);
  maxInput.addEventListener("input", handleInput);
  window.addEventListener("resize", () =>
    updateFill(parseInt(minInput.value), parseInt(maxInput.value))
  );

  // Initialize
  handleInput();
}





// ==== STREAM DISPLAY & FILTERING ====
let allStreams = [];

function displayStreams(streams) {
  const grid = document.getElementById("video-grid");
  if (!grid) return;

  if (streams.length === 0) {
    grid.innerHTML = "<p style='text-align:center;color:#aaa;'>No streams found.</p>";
    return;
  }

grid.innerHTML = streams.map((s) => {
const isTagged = s.tags && Object.keys(s.tags).some(k => k && k !== "stream_link" && k !== "zatsu_start");
const untaggedLabel = !isTagged ? `<span class="untagged-label">Untagged</span>` : "";

// ✅ Proper date formatting: "July 4 '25"
const d = new Date(s.date);
const options = { month: 'long', day: 'numeric' };
const formattedDate = d.toLocaleDateString('en-GB', options) + " '" + String(d.getFullYear()).slice(-2);

return `
  <div class="video-card">
    <a href="https://youtu.be/${s.id}" target="_blank" class="thumb-link">
      <img src="${s.thumbnail}" alt="${escapeHtml(s.title)}" loading="lazy" />
    </a>

    <div class="video-info">
      <h3>${escapeHtml(s.title)}</h3>
      <div class="video-meta">
        <p class="video-date">${formattedDate}</p>
        <p class="video-duration">${formatMinutesToHM(s.durationMinutes)}</p>
        ${untaggedLabel}
      </div>
    </div>
  </div>
`;
}).join("");

}

function streamHasTagValue(stream, tagName) {
  if (!stream.tags) return false;
  const val = stream.tags[tagName];
  if (!val) return false;
  const t = String(val).trim();
  if (t === "") return false;
  if (!Number.isNaN(Number(t))) return Number(t) > 0;
  return true;
}

function filterAndSortStreams() {
  if (!allStreams?.length) return;

  const searchTerm = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const sortOrder = document.getElementById("sortOrder")?.value || "newest";
  const minVal = parseInt(document.getElementById("durationMin")?.value || 0);
  const maxVal = parseInt(document.getElementById("durationMax")?.value || 9999);

  const useGame = document.getElementById("filterGame")?.checked;
  const useZatsu = document.getElementById("filterZatsu")?.checked;

  const includeTags = Object.entries(tagStates)
    .filter(([_, v]) => v === "include")
    .map(([k]) => k);

  const excludeTags = Object.entries(tagStates)
    .filter(([_, v]) => v === "exclude")
    .map(([k]) => k);

  const filtered = allStreams.filter((s) => {
    const duration = useGame
      ? s.gameDuration || 0
      : useZatsu
      ? s.zatsuDuration || 0
      : s.durationMinutes || 0;

    const inDurationRange = duration >= minVal && duration <= maxVal;
    const matchesText = s.title.toLowerCase().includes(searchTerm);
    const hasIncluded = includeTags.every((t) => streamHasTagValue(s, t));
    const hasExcluded = excludeTags.some((t) => streamHasTagValue(s, t));

    return inDurationRange && matchesText && hasIncluded && !hasExcluded;
  });

  filtered.sort((a, b) => {
    switch (sortOrder) {
      case "oldest": return new Date(a.date) - new Date(b.date);
      case "shortest": return a.durationMinutes - b.durationMinutes;
      case "longest": return b.durationMinutes - a.durationMinutes;
      default: return new Date(b.date) - new Date(a.date);
    }
  });

  displayStreams(filtered);
}





// ==== MAIN INITIALIZATION LOGIC ====
async function initMainPage() {
  try {
    const playlistId = await getChannelDetails();
    if (!playlistId) {
      document.getElementById("video-grid").innerHTML =
        "<p style='text-align:center;color:#aaa;'>Channel not found.</p>";
      return;
    }

    const tagMap = loadStreamTags();
    const fetched = await getVideosFromPlaylist(playlistId);

    const sample = Object.keys(Object.values(tagMap)[0] || {});
    const tagNames = sample.filter(
      (t) => !["stream_link", "zatsu_start", "zatsuStartMinutes"].includes(t)
    );
    createTagButtons(tagNames);

allStreams = fetched.map((s) => {
  const tags = tagMap[s.id] || {};
  const zatsuStart = tags.zatsuStartMinutes || 0;
  const total = s.durationMinutes || 0;
  const zatsuDuration = Math.max(0, total - zatsuStart);
  const gameDuration = Math.max(0, zatsuStart);

  return {
    ...s,
    tags,
    zatsuStartMinutes: zatsuStart,
    zatsuDuration,
    gameDuration,
  };
});


// ==== Initialize slider ====
let currentDurationType = "full"; // "full", "game", or "zatsu"
let currentMinVal = 0;
let currentMaxVal = 0;

function getDurationMaxForType(type) {
  switch (type) {
    case "game":
      return Math.max(10, Math.ceil(Math.max(...allStreams.map(s => s.gameDuration))));
    case "zatsu":
      return Math.max(10, Math.ceil(Math.max(...allStreams.map(s => s.zatsuDuration))));
    default:
      return Math.max(30, Math.ceil(Math.max(...allStreams.map(s => s.durationMinutes))));
  }
}

function updateSliderBounds(preserve = true) {
  const realMax = getDurationMaxForType(currentDurationType);

  // Preserve old slider state if requested
  let newMin = 0, newMax = realMax;

if (preserve && currentMaxVal > 0) {
  const prevMax = getDurationMaxForType("full");
  const atFull = Math.abs(currentMaxVal - prevMax) <= 1;
  if (atFull) newMax = realMax;
  else {
    newMin = currentMinVal;
    newMax = Math.min(currentMaxVal, realMax);
  }
}


  setupDualSlider({
    minId: "durationMin",
    maxId: "durationMax",
    fillId: "durationRangeFill",
    minLabelId: "durationMinLabel",
    maxLabelId: "durationMaxLabel",
    containerId: "durationSliderContainer",
    realMax,
    onChange: (min, max) => {
      currentMinVal = min;
      currentMaxVal = max;
      filterAndSortStreams();
    },
  });

  // Restore slider positions AFTER setupDualSlider rebuilds them
  const minEl = document.getElementById("durationMin");
  const maxEl = document.getElementById("durationMax");
  const fill = document.getElementById("durationRangeFill");
  const minLbl = document.getElementById("durationMinLabel");
  const maxLbl = document.getElementById("durationMaxLabel");

  if (minEl && maxEl && fill) {
    minEl.value = newMin;
    maxEl.value = newMax;

    // ✅ Properly recalc fill position with the new max bounds
    const sliderMin = parseFloat(minEl.min);
    const sliderMax = parseFloat(maxEl.max);
    const range = Math.max(1, sliderMax - sliderMin);
    const percentMin = ((newMin - sliderMin) / range) * 100;
    const percentMax = ((newMax - sliderMin) / range) * 100;
    fill.style.left = percentMin + "%";
    fill.style.width = Math.max(0, percentMax - percentMin) + "%";

    if (minLbl) minLbl.textContent = formatMinutesShort(newMin);
    if (maxLbl) maxLbl.textContent = formatMinutesShort(newMax);
  }

}


// Initial setup (default full stream duration)
const fullMax = getDurationMaxForType("full");
currentMinVal = 0;
currentMaxVal = fullMax;
updateSliderBounds(false);
  // --- wire up the three mode buttons (Full / Game / Zatsu) ---
  const modeButtons = document.querySelectorAll("#durationSection .mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // visual toggle
      modeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // set mode and update slider bounds (preserve absolute unless previously max)
      const newMode = btn.dataset.mode || (btn.id === "modeGame" ? "game" : btn.id === "modeZatsu" ? "zatsu" : "full");
      currentDurationType = newMode;
      // update slider bounds and refresh UI
      updateSliderBounds(true);
      // ensure fill & labels redraw (slider's handler will do this, but force one frame)
      requestAnimationFrame(() => {
        const minEl = document.getElementById("durationMin");
        const maxEl = document.getElementById("durationMax");
        if (minEl && maxEl) {
          minEl.dispatchEvent(new Event("input", { bubbles: true }));
          maxEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      filterAndSortStreams();
    });
  });


// ==== DURATION MODE TOGGLE (Full / Game / Zatsu) ====

const durationModes = ["full", "game", "zatsu"];
let currentMode = "full";

function renderDurationHeader() {
  const container = document.getElementById("durationHeader");
  if (!container) return;

  container.innerHTML = `
    <div class="duration-header-title">Duration</div>
    <div class="duration-header-options">
      ${durationModes
        .map(
          (m) =>
            `<span class="duration-option ${m === currentMode ? "active" : ""}" data-mode="${m}">
              ${m.charAt(0).toUpperCase() + m.slice(1)}
            </span>`
        )
        .join(" ")}
    </div>
  `;

  container.querySelectorAll(".duration-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const newMode = opt.dataset.mode;
      if (newMode === currentMode) return; // no change
      currentMode = newMode;
      updateDurationMode();
    });
  });
}

function updateDurationMode() {
  // Update visuals
  renderDurationHeader();

  // Map mode to type
  currentDurationType = currentMode;

  // Trigger slider update
  updateSliderBounds(true);
  filterAndSortStreams();
}

// Initialize header after slider setup
renderDurationHeader();



    document.getElementById("searchInput")?.addEventListener("input", filterAndSortStreams);
    document.getElementById("sortOrder")?.addEventListener("change", filterAndSortStreams);

    filterAndSortStreams();
  } catch (err) {
    console.error("[Init] Error:", err);
    document.getElementById("video-grid").innerHTML =
      "<p style='text-align:center;color:#aaa;'>Error loading data.</p>";
  }
}



// ==== CONDITIONAL INIT ====
if (!window.location.pathname.includes("suggest")) {
  console.log("[Main] Initializing main UI...");
  initMainPage();
} else {
  console.log("[Suggest] Suggest Tag page detected — skipping main init.");
}

document.getElementById("suggestTagBtn")?.addEventListener("click", () => {
  window.location.href = "suggest.html";
});
