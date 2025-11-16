// ==== suggest.js ====

document.addEventListener("DOMContentLoaded", initSuggest);

async function initSuggest() {
  console.log("Suggest Tag page initializing...");

  // Core elements
  const input = document.getElementById("tagNameInput");
  const list = document.getElementById("streamList");
  const submit = document.getElementById("submitTag");
  const searchBox = document.getElementById("searchStreams");

  // --- Hardcoded existing tag list ---
  const existingTags = [
    "One-Shot",
    "Existential",
    "Funny",
    "Horror",
    "Visual Novel",
    "Interactive",
    "Lore",
    "Roleplay",
    "Collab",
    "BL/GL",
    "Story-Driven"
  ];

  let chosenTag = "";

  // Safety check
  if (!input || !list || !submit) {
    console.warn("Missing essential DOM elements on suggest.html — skipping setup.");
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
  submit.addEventListener("click", () => {
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
      tagName,         // the new suggested tag
      "stream_title"   // always last
    ];

    const rows = [header.join(",")];

    // ===== Build CSV rows =====
    for (const v of videos) {
      const link = `https://www.youtube.com/watch?v=${v.id}`;
      const title = v.title.replace(/"/g, '""');

      // Existing tags are empty for now
      const existingTagValues = existingTags.map(() => "");

      let newTagValue = "";
      if (yesSelections.has(v.id)) newTagValue = "1";
      else if (noSelections.has(v.id)) newTagValue = "0";

      const row = [
        link,
        "",                  // zatsu_start placeholder
        ...existingTagValues,
        newTagValue,
        `"${title}"`         // stream title last
      ];

      rows.push(row.join(","));
    }

    // ===== Export CSV =====
    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `tag_suggestion_${tagName}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    alert(`✅ CSV for "${tagName}" generated!`);
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
