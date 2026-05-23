const listingRows = document.querySelector("#listingRows");
const bestDeal = document.querySelector("#bestDeal");
const resultsGrid = document.querySelector("#resultsGrid");
const summary = document.querySelector("#summary");
const searchLinks = document.querySelector("#searchLinks");
const productForm = document.querySelector("#productForm");
const searchStatus = document.querySelector("#searchStatus");
const autoSearchButton = document.querySelector("#autoSearch");
const voiceSearchButton = document.querySelector("#voiceSearch");
const voiceStatus = document.querySelector("#voiceStatus");
const emptyState = document.querySelector("#emptyState");
const serverDot = document.querySelector("#serverDot");
const serverStatus = document.querySelector("#serverStatus");
const publicLink = document.querySelector("#publicLink");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
const defaultWeights = {
  priceWeight: 6,
  matchWeight: 5,
  trustWeight: 3,
};
const sizeOptions = {
  clothing: ["XS", "S", "M", "L", "XL"],
  shoes: ["6", "7", "8", "9", "10", "11", "12", "13"],
  accessories: ["One size"],
};
const typeOptions = {
  clothing: ["", "shirt", "t-shirt", "polo", "hoodie", "sweatshirt", "shorts", "pants", "jeans", "jacket", "dress", "skirt"],
  shoes: ["", "sneakers", "running shoes", "basketball shoes", "loafers", "sandals", "boots"],
  accessories: ["", "hat", "belt", "backpack", "sunglasses", "wallet", "bag"],
};
const colorOptions = ["black", "white", "navy", "gray", "grey", "blue", "green", "red", "pink", "cream", "khaki", "brown", "purple", "yellow", "orange"];
const sizeAliases = new Map([
  ["extra small", "XS"],
  ["small", "S"],
  ["medium", "M"],
  ["large", "L"],
  ["extra large", "XL"],
  ["one size", "One size"],
]);

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAgentWeights() {
  return {
    priceWeight: Number(document.querySelector("#priceWeight").value || defaultWeights.priceWeight),
    matchWeight: Number(document.querySelector("#matchWeight").value || defaultWeights.matchWeight),
    trustWeight: Number(document.querySelector("#trustWeight").value || defaultWeights.trustWeight),
  };
}

function saveAgentWeights() {
  localStorage.setItem("dealScoutWeights", JSON.stringify(getAgentWeights()));
}

function loadAgentWeights() {
  const saved = JSON.parse(localStorage.getItem("dealScoutWeights") || "{}");
  Object.entries({ ...defaultWeights, ...saved }).forEach(([id, value]) => {
    const input = document.querySelector(`#${id}`);
    if (input) {
      input.value = value;
    }
  });
}

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeVoiceText(text) {
  return text
    .toLowerCase()
    .replace(/\btee shirt\b/g, "t-shirt")
    .replace(/\bteeshirt\b/g, "t-shirt")
    .replace(/\bt shirt\b/g, "t-shirt")
    .replace(/\bgrey\b/g, "gray")
    .replace(/[^a-z0-9.$\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findSpokenCategory(text) {
  if (/\b(shoe|shoes|sneaker|sneakers|boot|boots|sandals?)\b/.test(text)) {
    return "shoes";
  }
  if (/\b(accessory|accessories|hat|belt|backpack|sunglasses|wallet|bag)\b/.test(text)) {
    return "accessories";
  }
  if (typeOptions.shoes.some((type) => type && text.includes(type))) {
    return "shoes";
  }
  if (typeOptions.accessories.some((type) => type && text.includes(type))) {
    return "accessories";
  }
  return "clothing";
}

function findSpokenType(text, category) {
  return [...typeOptions[category]]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((type) => text.includes(type)) || "";
}

function findSpokenColor(text) {
  return colorOptions.find((color) => text.includes(color)) || "";
}

function findSpokenBudget(text) {
  const budgetMatch = text.match(/\b(?:under|below|less than|max|maximum|budget(?: is)?|around|for)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  return budgetMatch ? budgetMatch[1] : "";
}

function findSpokenSize(text, category) {
  const options = sizeOptions[category];
  for (const [phrase, value] of sizeAliases.entries()) {
    if (text.includes(`size ${phrase}`) || text.includes(`${phrase} size`) || text.includes(`in ${phrase}`)) {
      return options.includes(value) ? value : options[0];
    }
  }

  const explicitSize = text.match(/\bsize\s*(xs|s|m|l|xl|\d{1,2})\b/);
  if (!explicitSize) {
    return "";
  }

  const value = explicitSize[1].toUpperCase();
  return options.includes(value) ? value : "";
}

function cleanSpokenProduct(text, details) {
  let product = ` ${text} `;
  const removePatterns = [
    /\b(find|search|look for|show me|compare|buy|get|i want|i need|please)\b/g,
    /\b(i am|i'm|im|my|a|an)\s+(size\s+)?(extra small|extra large|small|medium|large|xs|s|m|l|xl|\d{1,2})\b/g,
    /\b(clothing|clothes|shoes|accessories)\b/g,
    /\b(my\s+)?budget\s+is\s*\$?\s*\d+(?:\.\d{1,2})?\s*(dollars|bucks)?\b/g,
    /\b(under|below|less than|max|maximum|budget|around|for)\s*\$?\s*\d+(?:\.\d{1,2})?\s*(dollars|bucks)?\b/g,
    /\bsize\s*(extra small|extra large|small|medium|large|xs|s|m|l|xl|\d{1,2})\b/g,
    /\btrusted only\b/g,
  ];

  removePatterns.forEach((pattern) => {
    product = product.replace(pattern, " ");
  });

  [details.color, details.type].filter(Boolean).forEach((word) => {
    product = product.replace(new RegExp(`\\b${word.replace("-", "\\-")}\\b`, "g"), " ");
  });

  return product.replace(/\s+/g, " ").trim();
}

function applyVoiceSearch(transcript) {
  const text = normalizeVoiceText(transcript);
  const category = findSpokenCategory(text);
  const type = findSpokenType(text, category);
  const color = findSpokenColor(text);
  const budget = findSpokenBudget(text);
  const size = findSpokenSize(text, category);
  const product = cleanSpokenProduct(text, { type, color }) || text;

  document.querySelector("#category").value = category;
  updateSizeOptions();
  updateTypeOptions();
  document.querySelector("#productType").value = type;
  document.querySelector("#color").value = color;
  document.querySelector("#productName").value = titleCase(product);

  if (budget) {
    document.querySelector("#maxPrice").value = budget;
  }
  if (size) {
    document.querySelector("#size").value = size;
  }

  voiceStatus.textContent = `Heard: “${transcript}”`;
  autoSearch();
}

function shippingLabel(listing) {
  if (listing.shipping === null || listing.shipping === undefined || listing.shipping === "") {
    return listing.shippingNote || "Check store";
  }
  return money(listing.shipping);
}

function totalLabel(listing) {
  if (listing.shipping === null || listing.shipping === undefined || listing.shipping === "") {
    return `${money(listing.total)} before shipping`;
  }
  return money(listing.total);
}

function scoreListing(listing, maxPrice) {
  const weights = getAgentWeights();
  const totalWeight = weights.priceWeight + weights.matchWeight + weights.trustWeight + 1;
  const shipping = numericOrNull(listing.shipping);
  const total = Number(listing.price) + (shipping ?? 0);
  const affordability = Math.max(0, 100 - Math.max(0, total - maxPrice) * 4);
  const value = Math.max(0, 100 - total * 1.4);
  const score =
    (value * weights.priceWeight +
      listing.match * weights.matchWeight +
      listing.trust * weights.trustWeight +
      affordability) /
    totalWeight;

  return {
    ...listing,
    shipping,
    total,
    score: Math.round(score),
    overBudget: total > maxPrice,
  };
}

function createListingRow(listing = {}) {
  const row = document.createElement("div");
  row.className = "listingRow";
  row.innerHTML = `
    <label>Store <input class="store" value="${escapeHtml(listing.store)}" placeholder="eBay" /></label>
    <label>Item <input class="item" value="${escapeHtml(listing.item)}" placeholder="Same shirt, blue, M" /></label>
    <label>Price <input class="price" type="number" min="0" step="0.01" value="${listing.price ?? ""}" /></label>
    <label>Shipping <input class="shipping" type="number" min="0" step="0.01" value="${listing.shipping ?? ""}" placeholder="Check" /></label>
    <label>Match % <input class="match" type="number" min="0" max="100" value="${listing.match ?? 80}" /></label>
    <label>Trust % <input class="trust" type="number" min="0" max="100" value="${listing.trust ?? 75}" /></label>
    <button class="iconButton" type="button" aria-label="Remove listing" title="Remove listing">&times;</button>
    <label class="urlField">Link <input class="url" value="${escapeHtml(listing.url)}" placeholder="https://..." /></label>
    <input class="image" type="hidden" value="${escapeHtml(listing.image)}" />
    <input class="shippingNote" type="hidden" value="${escapeHtml(listing.shippingNote)}" />
  `;

  row.querySelector(".iconButton").addEventListener("click", () => {
    row.remove();
    analyze();
  });

  row.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", analyze);
  });

  listingRows.appendChild(row);
}

function readListings() {
  return [...document.querySelectorAll(".listingRow")]
    .map((row) => ({
      store: row.querySelector(".store").value.trim(),
      item: row.querySelector(".item").value.trim(),
      price: Number(row.querySelector(".price").value || 0),
      shipping: numericOrNull(row.querySelector(".shipping").value),
      shippingNote: row.querySelector(".shippingNote")?.value.trim() || "",
      match: Number(row.querySelector(".match").value || 0),
      trust: Number(row.querySelector(".trust").value || 0),
      url: row.querySelector(".url").value.trim(),
      image: row.querySelector(".image")?.value.trim() || "",
    }))
    .filter((listing) => listing.store && listing.item);
}

function renderSearchLinks(productName) {
  const query = encodeURIComponent(productName);
  const targets = [
    ["Google Shopping", `https://www.google.com/search?tbm=shop&q=${query}`],
    ["eBay", `https://www.ebay.com/sch/i.html?_nkw=${query}`],
    ["Poshmark", `https://poshmark.com/search?query=${query}`],
    ["Depop", `https://www.depop.com/search/?q=${query}`],
    ["Mercari", `https://www.mercari.com/search/?keyword=${query}`],
  ];

  searchLinks.innerHTML = targets
    .map(([name, href]) => `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`)
    .join("");
}

function analyze() {
  const productName = document.querySelector("#productName").value.trim() || "Hollister t-shirt";
  const maxPrice = Number(document.querySelector("#maxPrice").value || 0);
  const listings = readListings();
  renderSearchLinks(productName);

  if (!listings.length) {
    bestDeal.innerHTML = "";
    resultsGrid.innerHTML = "";
    emptyState.classList.add("visible");
    summary.textContent = "Search for a product and the agent will rank the best deals.";
    return;
  }

  emptyState.classList.remove("visible");
  const ranked = listings
    .map((listing) => scoreListing(listing, maxPrice))
    .sort((a, b) => b.score - a.score || a.total - b.total);

  const best = ranked[0];
  summary.textContent = `${best.store} is the current best pick at ${totalLabel(best)} with a ${best.score}/100 score.`;

  bestDeal.innerHTML = renderBestDeal(best);
  resultsGrid.innerHTML = ranked.map(renderResultCard).join("");
}

function renderImage(listing) {
  if (!listing.image) {
    return `<div class="productImage placeholder">No image</div>`;
  }
  return `<img class="productImage" src="${escapeHtml(listing.image)}" alt="" loading="lazy" />`;
}

function renderBadges(listing) {
  return `
    <div class="badges">
      <span>${listing.match}% match</span>
      <span>${listing.trust}% trust</span>
      ${listing.isTrusted ? `<span>Trusted store</span>` : ""}
      ${listing.isDirectLink ? `<span>Direct store link</span>` : `<span>Google listing</span>`}
      <span>${shippingLabel(listing)}</span>
    </div>
  `;
}

function renderBestDeal(listing) {
  const actionText = listing.isDirectLink ? "Buy on store" : "Open Google listing";
  return `
    <article class="bestDealCard">
      ${renderImage(listing)}
      <div>
        <p class="eyebrow mini">Best deal</p>
        <h3>${escapeHtml(listing.item)}</h3>
        <p class="muted">${escapeHtml(listing.store)}</p>
        ${renderBadges(listing)}
      </div>
      <div class="dealActions">
        <strong>${totalLabel(listing)}</strong>
        ${listing.url ? `<a class="buttonLink" href="${escapeHtml(listing.url)}" target="_blank" rel="noreferrer">${actionText}</a>` : ""}
        ${listing.url ? `<button class="secondary copyLink" type="button" data-url="${escapeHtml(listing.url)}">Copy link</button>` : ""}
      </div>
    </article>
  `;
}

function renderResultCard(listing, index) {
  const actionText = listing.isDirectLink ? "Buy on store" : "Open Google listing";
  return `
    <article class="resultCard ${index === 0 ? "topPick" : ""}">
      ${renderImage(listing)}
      <div class="resultBody">
        <div class="resultMeta">
          <span>#${index + 1}</span>
          <span>${escapeHtml(listing.store)}</span>
        </div>
        <h3>${escapeHtml(listing.item)}</h3>
        ${renderBadges(listing)}
        <div class="priceLine">
          <span>${money(listing.price)} item</span>
          <strong>${totalLabel(listing)}</strong>
        </div>
        <div class="cardActions">
          ${listing.url ? `<a href="${escapeHtml(listing.url)}" target="_blank" rel="noreferrer">${actionText}</a>` : ""}
          ${listing.overBudget ? `<span class="overBudget">Over budget</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

async function autoSearch() {
  const productName = document.querySelector("#productName").value.trim();
  const category = document.querySelector("#category").value;
  const productType = document.querySelector("#productType").value;
  const color = document.querySelector("#color").value.trim();
  const size = document.querySelector("#size").value;
  const trustedOnly = document.querySelector("#trustedOnly").checked;

  if (!productName) {
    searchStatus.textContent = "Type a product name first, like Hollister graphic t-shirt.";
    return;
  }

  autoSearchButton.disabled = true;
  autoSearchButton.textContent = "Searching...";
  searchStatus.textContent = "Searching shopping results...";

  try {
    const buildSearchUrl = (trustedOnlyValue) =>
      `/api/search?q=${encodeURIComponent(productName)}` +
      `&category=${encodeURIComponent(category)}` +
      `&size=${encodeURIComponent(size)}` +
      `&trustedOnly=${trustedOnlyValue}` +
      `&type=${encodeURIComponent(productType)}` +
      `&color=${encodeURIComponent(color)}`;

    let response = await fetch(buildSearchUrl(trustedOnly));
    let data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed.");
    }

    let usedFallback = false;
    if (trustedOnly && !data.listings?.length) {
      searchStatus.textContent = "No trusted matches yet, checking more stores...";
      response = await fetch(buildSearchUrl(false));
      data = await response.json();
      usedFallback = true;

      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }
    }

    if (!data.listings?.length) {
      searchStatus.textContent = data.message || "No listings came back yet.";
      return;
    }

    listingRows.innerHTML = "";
    data.listings.forEach(createListingRow);
    analyze();
    searchStatus.textContent = usedFallback
      ? `No trusted-only matches, so I broadened the search and added ${data.listings.length} listings.`
      : data.message || `Added ${data.listings.length} listings from automatic search.`;
  } catch (error) {
    searchStatus.textContent = `Auto Search error: ${error.message}`;
  } finally {
    autoSearchButton.disabled = false;
    autoSearchButton.textContent = "Auto Search";
  }
}

async function checkServer() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (!response.ok) {
      throw new Error("Server health check failed.");
    }
    serverDot.className = "dot online";
    serverStatus.textContent = data.hasApiKey ? "Server online, search ready" : "Server online, add API key";
  } catch (error) {
    serverDot.className = "dot offline";
    serverStatus.textContent = "Server offline";
  }
}

function updatePublicLinkHint() {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  publicLink.textContent = isLocal ? "Deploy online to create one" : window.location.href;
}

function updateSizeOptions() {
  const category = document.querySelector("#category").value;
  const sizeSelect = document.querySelector("#size");
  const current = sizeSelect.value;
  sizeSelect.innerHTML = sizeOptions[category].map((size) => `<option>${size}</option>`).join("");
  if (sizeOptions[category].includes(current)) {
    sizeSelect.value = current;
  }
}

function updateTypeOptions() {
  const category = document.querySelector("#category").value;
  const typeSelect = document.querySelector("#productType");
  const current = typeSelect.value;
  typeSelect.innerHTML = typeOptions[category]
    .map((type) => `<option value="${escapeHtml(type)}">${type ? escapeHtml(type[0].toUpperCase() + type.slice(1)) : "Any"}</option>`)
    .join("");
  if (typeOptions[category].includes(current)) {
    typeSelect.value = current;
  }
}

function startVoiceSearch() {
  if (!SpeechRecognition) {
    voiceStatus.textContent = "Voice search works best in Chrome or Edge.";
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      voiceSearchButton.classList.remove("listening");
      voiceSearchButton.textContent = "Speak Search";
      applyVoiceSearch(transcript);
    });

    recognition.addEventListener("end", () => {
      voiceSearchButton.classList.remove("listening");
      voiceSearchButton.textContent = "Speak Search";
    });

    recognition.addEventListener("error", (event) => {
      voiceSearchButton.classList.remove("listening");
      voiceSearchButton.textContent = "Speak Search";
      voiceStatus.textContent = event.error === "not-allowed"
        ? "Microphone access was blocked. Allow the mic in your browser to use voice search."
        : "Voice search did not catch that. Try again.";
    });
  }

  voiceSearchButton.classList.add("listening");
  voiceSearchButton.textContent = "Listening...";
  voiceStatus.textContent = "Listening now...";
  recognition.start();
}

document.querySelector("#addListing").addEventListener("click", () => {
  createListingRow();
});

document.querySelector("#category").addEventListener("change", () => {
  updateSizeOptions();
  updateTypeOptions();
  analyze();
});

voiceSearchButton.addEventListener("click", startVoiceSearch);
autoSearchButton.addEventListener("click", autoSearch);
resultsGrid.addEventListener("click", async (event) => {
  if (!event.target.matches(".copyLink")) {
    return;
  }
  await navigator.clipboard.writeText(event.target.dataset.url);
  event.target.textContent = "Copied";
});
bestDeal.addEventListener("click", async (event) => {
  if (!event.target.matches(".copyLink")) {
    return;
  }
  await navigator.clipboard.writeText(event.target.dataset.url);
  event.target.textContent = "Copied";
});
document.querySelector("#resetSettings").addEventListener("click", () => {
  localStorage.removeItem("dealScoutWeights");
  loadAgentWeights();
  analyze();
});

document.querySelectorAll("#priceWeight, #matchWeight, #trustWeight").forEach((input) => {
  input.addEventListener("input", () => {
    saveAgentWeights();
    analyze();
  });
});

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  analyze();
});

loadAgentWeights();
updateSizeOptions();
updateTypeOptions();
checkServer();
setInterval(checkServer, 30000);
updatePublicLinkHint();
analyze();
