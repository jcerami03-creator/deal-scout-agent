const listingRows = document.querySelector("#listingRows");
const resultsBody = document.querySelector("#resultsBody");
const summary = document.querySelector("#summary");
const searchLinks = document.querySelector("#searchLinks");
const productForm = document.querySelector("#productForm");
const searchStatus = document.querySelector("#searchStatus");
const autoSearchButton = document.querySelector("#autoSearch");
const emptyState = document.querySelector("#emptyState");
const serverDot = document.querySelector("#serverDot");
const serverStatus = document.querySelector("#serverStatus");
const publicLink = document.querySelector("#publicLink");
const defaultWeights = {
  priceWeight: 6,
  matchWeight: 5,
  trustWeight: 3,
};

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

function scoreListing(listing, maxPrice) {
  const weights = getAgentWeights();
  const totalWeight = weights.priceWeight + weights.matchWeight + weights.trustWeight + 1;
  const total = Number(listing.price) + Number(listing.shipping);
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
    <label>Shipping <input class="shipping" type="number" min="0" step="0.01" value="${listing.shipping ?? ""}" /></label>
    <label>Match % <input class="match" type="number" min="0" max="100" value="${listing.match ?? 80}" /></label>
    <label>Trust % <input class="trust" type="number" min="0" max="100" value="${listing.trust ?? 75}" /></label>
    <button class="iconButton" type="button" aria-label="Remove listing" title="Remove listing">&times;</button>
    <label class="urlField">Link <input class="url" value="${escapeHtml(listing.url)}" placeholder="https://..." /></label>
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
      shipping: Number(row.querySelector(".shipping").value || 0),
      match: Number(row.querySelector(".match").value || 0),
      trust: Number(row.querySelector(".trust").value || 0),
      url: row.querySelector(".url").value.trim(),
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
    resultsBody.innerHTML = "";
    emptyState.classList.add("visible");
    summary.textContent = "Search for a product and the agent will rank the best deals.";
    return;
  }

  emptyState.classList.remove("visible");
  const ranked = listings
    .map((listing) => scoreListing(listing, maxPrice))
    .sort((a, b) => b.score - a.score || a.total - b.total);

  const best = ranked[0];
  summary.textContent = `${best.store} is the current best pick at ${money(best.total)} total with a ${best.score}/100 score.`;

  resultsBody.innerHTML = ranked
    .map(
      (listing, index) => `
        <tr class="${index === 0 ? "best" : ""}">
          <td>${index + 1}</td>
          <td>${escapeHtml(listing.store)}</td>
          <td>${escapeHtml(listing.item)}${listing.overBudget ? `<br><span class="muted">Over budget</span>` : ""}</td>
          <td>${money(listing.price)}</td>
          <td>${money(listing.shipping)}</td>
          <td><strong>${money(listing.total)}</strong></td>
          <td class="score">${listing.score}</td>
          <td>${listing.url ? `<a href="${escapeHtml(listing.url)}" target="_blank" rel="noreferrer">Open</a>` : "None"}</td>
        </tr>
      `,
    )
    .join("");
}

async function autoSearch() {
  const productName = document.querySelector("#productName").value.trim();
  const size = document.querySelector("#size").value;

  if (!productName) {
    searchStatus.textContent = "Type a product name first, like Hollister graphic t-shirt.";
    return;
  }

  autoSearchButton.disabled = true;
  autoSearchButton.textContent = "Searching...";
  searchStatus.textContent = "Searching shopping results...";

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(productName)}&size=${encodeURIComponent(size)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed.");
    }

    if (!data.listings?.length) {
      searchStatus.textContent = data.message || "No listings came back yet.";
      return;
    }

    listingRows.innerHTML = "";
    data.listings.forEach(createListingRow);
    analyze();
    searchStatus.textContent = `Added ${data.listings.length} listings from automatic search.`;
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

document.querySelector("#addListing").addEventListener("click", () => {
  createListingRow();
});

autoSearchButton.addEventListener("click", autoSearch);
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
checkServer();
updatePublicLinkHint();
analyze();
