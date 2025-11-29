// ==== suggest.js ====

document.addEventListener("DOMContentLoaded", initSuggest);
console.log("In suggest.js, emailjs is:", typeof emailjs);

// ---- Robust CSV parser (handles quotes, empty columns, spacing) ----
function parseCSV(csv) {
  return csv
    .trim()
    .split("\n")
    .map(line => {
      const result = [];
      let current = "";
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            current += '"';  // escaped quote
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === "," && !insideQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }

      result.push(current.trim());
      return result;
    });
}

async function initSuggest() {
  console.log("Suggest Tag page initializing...");

  // Core elements
  const input = document.getElementById("tagNameInput");
  const list = document.getElementById("streamList");
  const submit = document.getElementById("submitTag");
  const searchBox = document.getElementById("searchStreams");

  let existingTags = [];
  let metadataRows = [];

  if (!input || !list || !submit) {
    console.warn("Missing essential DOM elements on suggest.html — skipping setup.");
    return;
  }

  // --- Load metadata.csv ---
  try {
    const res = await fetch("metadata.csv");
    const csvText = await res.text();
    metadataRows = parseCSV(csvText);

    const header = metadataRows[0];

    // structure:
    // stream_link | tags... | zatsu_start | stream_title
    existingTags = header.slice(1, -2);  // everything between stream_link and zatsu_start

    console.log("Loaded existing tags:", existingTags);

  } catch (err) {
    console.error("Failed to load metadata.csv:", err);
    alert("⚠️ Could not load stream data — suggestion cannot be sent.");
    return;
  }

  // --- Tag input behavior ---
  function handleTagInput() {
    const value = input.value.trim();
    if (!value) return;

    input.blur();
    input.classList.add("filled");
    input.disabled = true;

    showTagBanner(value);
    submit.disabled = false;
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTagInput();
    }
  });

  input.addEventListener("change", handleTagInput);

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
    submit.disabled = true;
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

    // Build header
    const header = [
      "stream_link",
      ...existingTags,
      tagName,
      "zatsu_start",
      "stream_title"
    ];
    const rows = [header.join(",")];

    // Build lookup map
    const metadataMap = {};
    for (let i = 1; i < metadataRows.length; i++) {
      const row = metadataRows[i];
      metadataMap[row[0]] = row;
    }

    // Merge playlist videos with metadata
    for (const v of videos) {
      const id = v.id;
      const metaRow = metadataMap[id] || [];

      const existingTagValues = existingTags.map((_, idx) =>
        metaRow[idx + 1] || ""
      );

      let newTagValue = "";
      if (yesSelections.has(id)) newTagValue = "1";
      else if (noSelections.has(id)) newTagValue = "0";

      const zatsu = metaRow[existingTags.length + 1] || "";
      const title = v.title.replace(/"/g, '""');

      rows.push([
        id,
        ...existingTagValues,
        newTagValue,
        zatsu,
        `"${title}"`
      ].join(","));
    }

    const csvText = rows.join("\n");

    // Send email
    try {
      const response = await emailjs.send(
        "service_wk26mhd",
        "template_6eyzp4i",
        { tag_name: tagName, csv_text: csvText }
      );

      console.log("EmailJS response:", response);
      alert(`📨 Suggestion sent! Thank you for helping to improve Cuudex.`);
    } catch (error) {
      console.error("EmailJS error:", error);
      alert("❌ Failed to send suggestion. Please try again later.");
    }
  });
}

// ---- Render video list ----
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
    }

    else if (e.target.classList.contains("btn-no")) {
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
