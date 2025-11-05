// ==== suggest.js ====

document.addEventListener("DOMContentLoaded", initSuggest);

async function initSuggest() {
  console.log("Suggest Tag page initializing...");

  // Core elements
  const input = document.getElementById("tagNameInput");
  const list = document.getElementById("streamList");
  const submit = document.getElementById("submitTag");
  const tagBanner = document.getElementById("tagBanner");
  const searchBox = document.getElementById("searchStreams");

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
        input.blur(); // deselect input
        input.classList.add("filled");
        input.disabled = true; // lock input
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
    const input = document.getElementById("tagNameInput");
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

    console.log("✅ Suggested tag:", tagName);
    console.log("Yes selections:", [...yesSelections]);
    console.log("No selections:", [...noSelections]);

    alert(`✅ Your tag suggestion "${tagName}" was recorded (locally).`);
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
