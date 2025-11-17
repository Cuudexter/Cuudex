// ==== suggest.js ====

document.addEventListener("DOMContentLoaded", initSuggest);

async function initSuggest() {
  console.log("Suggest Tag page initializing...");

  // Core elements
  const input = document.getElementById("tagNameInput");
  const list = document.getElementById("streamList");
  const submit = document.getElementById("submitTag");
  const searchBox = document.getElementById("searchStreams");

  let chosenTag = "";
  let existingTags = [];
  let metadataRows = []; // full CSV data including existing tags

  // Safety check
  if (!input || !list || !submit) {
    console.warn("Missing essential DOM elements on suggest.html — skipping setup.");
    return;
  }

  // --- Load metadata.csv ---
  try {
    const res = await fetch("metadata.csv");
    const csvText = await res.text();
    metadataRows = parseCSV(csvText);

    const header = metadataRows[0]; // first row
    existingTags = header.slice(2); // skip stream_link + zatsu_start

    // Remove stream_title if present at the end
    const last = existingTags[existingTags.length - 1];
    if (last && last.toLowerCase().includes("title")) {
      existingTags.pop();
    }

    console.log("Loaded existing tags:", existingTags);
  } catch (err) {
    console.error("Failed to load metadata.csv", err);
    alert("⚠️ Could not load metadata.csv — suggestion cannot be sent.");
    return;
  }

  // --- Tag input behavior ---
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        chosenTag = value;
        input.blur();
        input.classList.add("filled");
        input.disabled = true;
        showTagBanner(chosenTag);
        submit.disabled = false;
      }
    }
  });

  function showTagBanner(tagName) {
    const tagBanner = document.getElementById("tagBanner");
    const tagBannerText = document.getElementById("tagBannerText");
    const changeBtn = document.getElementById("changeTagBtn");

    tagBannerText.textContent = `Tagging "${tagName}"`;
    tagBanner.classList.remove("hidden");

    changeBtn.onclick = () => {
      input.disabled = false;
      input.focus();
      input.classList.remove("filled");
      tagBanner.classList.add("hidden");
    };
  }

  // --- Search filter ---
  if (searchBox) {
    searchBox.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll(".stream-item").forEach((item) => {
        const title = item.querySelector("span").textContent.toLowerCase();
        item.style.display = title.includes(query) ? "" : "none";
      });
    });
  }

  // --- Stream loading ---
  let videos = [];
  const yesSelections = new Set();
  const noSelections = new Set();

  try {
    const playlistId = await getChannelDetails();
    videos = await getVideosFromPlaylist(playlistId);
    renderStreams(videos, list, yesSelections, noSelections);
    submit.disabled = true; // stays disabled until tag entered
  } catch (err) {
    console.error("Error loading videos:", err);
  }

  // --- Submit handler ---
  submit.addEventListener("click", async () => {
    const tagName = input.value.trim();
    if (!tagName) {
      alert("Please enter a tag name first!");
      return;
    }

    // ===== Build CSV header =====
    const header = [
      "stream_link",
      "zatsu_start",
      ...existingTags,
      tagName,
      "stream_title"
    ];
    const rows = [header.join(",")];

    // Build a map for fast metadata lookup by stream link
    const metadataMap = {};
    for (let i = 1; i < metadataRows.length; i++) {
      const row = metadataRows[i];
      metadataMap[row[0]] = row; // key: stream_link
    }

    // Merge videos from playlist with metadata
    for (const v of videos) {
      const link = `https://www.youtube.com/watch?v=${v.id}`;
      const title = v.title.replace(/"/g, '""');
      const metaRow = metadataMap[link] || [];

      // Existing tags preserved
      const existingTagValues = existingTags.map((_, idx) => metaRow[idx + 2] || "");

      let newTagValue = "";
      if (yesSelections.has(v.id)) newTagValue = "1";
      else if (noSelections.has(v.id)) newTagValue = "0";

      const row = [
        metaRow[0] || link,     // stream_link
        metaRow[1] || "",       // zatsu_start
        ...existingTagValues,   // existing tags
        newTagValue,            // suggested tag
        `"${title}"`            // stream title
      ];

      rows.push(row.join(","));
    }

    const csvText = rows.join("\n");
    console.log("CSV length:", csvText.length);

    // ===== Email via EmailJS =====
    try {
      const response = await emailjs.send(
        "service_wk26mhd",
        "template_6eyzp4i",
        {
          tag_name: tagName,
          csv_text: csvText
        }
      );

      console.log("EmailJS response:", response);
      alert(`📨 Suggestion sent! Thank you for helping improve the Cuudex.`);
    } catch (error) {
      console.error("EmailJS error:", error);
      alert("❌ Failed to send suggestion. Please try again later.");
    }
  });
}

// ---- Helper: Render video list ----
function renderStreams(videos, container, yesSelections, noSelections) {
  container.innerHTML = "";

  for (const v of videos) {
    const item = document.createElement("div");
    item.className = "stream-item";
    item.innerHTML = `
      <img src="${v.thumbnail}" alt="${v.title}">
      <span>${v.title}</span>
      <div class="buttons">
        <button class="btn-yes" data-id="${v.id}">✅</button>
        <button class="btn-no" data-id="${v.id}">❌</button>
      </div>
    `;
    container.appendChild(item);
  }

  // --- Selection handlers ---
  container.addEventListener("click", (e) => {
    const item = e.target.closest(".stream-item");
    if (!item) return;

    if (e.target.classList.contains("btn-yes")) {
      const id = e.target.dataset.id;
      yesSelections.add(id);
      noSelections.delete(id);
      item.classList.add("yes");
      item.classList.remove("no");
      e.target.classList.add("selected");
      e.target.nextElementSibling.classList.remove("selected");
    } else if (e.target.classList.contains("btn-no")) {
      const id = e.target.dataset.id;
      noSelections.add(id);
      yesSelections.delete(id);
      item.classList.add("no");
      item.classList.remove("yes");
      e.target.classList.add("selected");
      e.target.previousElementSibling.classList.remove("selected");
    }
  });
}

// ---- Simple CSV parser helper ----
function parseCSV(csvText) {
  return csvText
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}
