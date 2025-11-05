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
  const headers = lines[0].split(",");
  const rows = lines.slice(1);

  const tagMap = {};
  for (const row of rows) {
    const cols = row.split(",");
    const record = {};
    headers.forEach((h, i) => {
      record[h.trim()] = (cols[i] || "").trim();
    });
    const id = extractVideoId(record.stream_link);
    if (id) tagMap[id] = record;
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
    btn.textContent = tag;
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


// ==== DURATION SLIDER LOGIC ====
let minInput, maxInput, rangeFill, minLabelEl, maxLabelEl;
let sliderMin = 0;
let sliderMax = 600;
const STEP = 1;

function setupDualSlider(realMax) {
  minInput = document.getElementById("minDuration");
  maxInput = document.getElementById("maxDuration");
  rangeFill = document.getElementById("rangeFill");
  minLabelEl = document.getElementById("minLabel");
  maxLabelEl = document.getElementById("maxLabel");

  if (!minInput || !maxInput) {
    console.warn("[Slider] Elements not found — skipping setup.");
    return;
  }

  sliderMin = 0;
  sliderMax = Math.max(1, Math.round(realMax));

  [minInput, maxInput].forEach((input) => {
    input.min = sliderMin;
    input.max = sliderMax;
    input.step = STEP;
  });

  minInput.value = sliderMin;
  maxInput.value = sliderMax;
  updateFill(sliderMin, sliderMax);
  minLabelEl.textContent = sliderMin;
  maxLabelEl.textContent = sliderMax;

  const handleInput = () => {
    let minVal = parseInt(minInput.value);
    let maxVal = parseInt(maxInput.value);
    if (minVal > maxVal - STEP) minVal = maxVal - STEP;
    if (maxVal < minVal + STEP) maxVal = minVal + STEP;

    minInput.value = minVal;
    maxInput.value = maxVal;
    updateFill(minVal, maxVal);
    minLabelEl.textContent = minVal;
    maxLabelEl.textContent = maxVal;
    filterAndSortStreams();
  };

  minInput.addEventListener("input", handleInput);
  maxInput.addEventListener("input", handleInput);
  window.addEventListener("resize", () =>
    updateFill(parseInt(minInput.value), parseInt(maxInput.value))
  );
}

function updateFill(minV, maxV) {
  const cont = document.getElementById("sliderContainer");
  if (!cont || !rangeFill) return;
  const percentMin = ((minV - sliderMin) / (sliderMax - sliderMin)) * 100;
  const percentMax = ((maxV - sliderMin) / (sliderMax - sliderMin)) * 100;
  rangeFill.style.left = percentMin + "%";
  rangeFill.style.width = percentMax - percentMin + "%";
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

  grid.innerHTML = streams.map((s) => `
    <div class="video-card">
      <a href="https://youtu.be/${s.id}" target="_blank" class="thumb-link">
        <img src="${s.thumbnail}" alt="${escapeHtml(s.title)}" loading="lazy" />
      </a>
      <div class="video-info">
        <h3>${escapeHtml(s.title)}</h3>
        <p>${formatMinutesToHM(s.durationMinutes)} — ${new Date(s.date).toLocaleDateString()}</p>
      </div>
    </div>
  `).join("");
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
  if (!allStreams.length) return;

  const searchTerm = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const sortOrder = document.getElementById("sortOrder")?.value || "newest";
  const minVal = parseInt(document.getElementById("minDuration")?.value || 0);
  const maxVal = parseInt(document.getElementById("maxDuration")?.value || 9999);

  const includeTags = Object.entries(tagStates).filter(([_, v]) => v === "include").map(([k]) => k);
  const excludeTags = Object.entries(tagStates).filter(([_, v]) => v === "exclude").map(([k]) => k);

  const filtered = allStreams.filter((s) => {
    const inRange = s.durationMinutes >= minVal && s.durationMinutes <= maxVal;
    const matchesText = s.title.toLowerCase().includes(searchTerm);
    const hasIncluded = includeTags.every((t) => streamHasTagValue(s, t));
    const hasExcluded = excludeTags.some((t) => streamHasTagValue(s, t));
    return inRange && matchesText && hasIncluded && !hasExcluded;
  });

  filtered.sort((a, b) => {
    if (sortOrder === "oldest") return new Date(a.date) - new Date(b.date);
    if (sortOrder === "shortest") return a.durationMinutes - b.durationMinutes;
    if (sortOrder === "longest") return b.durationMinutes - a.durationMinutes;
    return new Date(b.date) - new Date(a.date);
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
    if (!sample.length) {
      console.warn("[Tags] No tag columns found in CSV.");
    }
    const tagNames = sample.filter((t) => t !== "stream_link" && t !== "zatsu_start");
    createTagButtons(tagNames);

    allStreams = fetched.map((s) => ({ ...s, tags: tagMap[s.id] || {} }));

    const realMax = Math.max(30, Math.ceil(Math.max(...allStreams.map((s) => s.durationMinutes), 1)));
    setupDualSlider(realMax);

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
