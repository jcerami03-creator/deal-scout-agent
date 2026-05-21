from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen
import json
import os
import re
import ssl
import sys


PORT = int(os.environ.get("PORT", 8000))
TRUSTED_STORES = {
    "vineyard vines": 94,
    "lululemon": 95,
    "hollister": 94,
    "abercrombie": 94,
    "american eagle": 88,
    "aerie": 88,
    "nike": 95,
    "adidas": 95,
    "new balance": 94,
    "patagonia": 95,
    "the north face": 94,
    "north face": 94,
    "columbia": 90,
    "under armour": 90,
    "levi": 90,
    "gap": 88,
    "old navy": 86,
    "j.crew": 90,
    "j crew": 90,
    "banana republic": 88,
    "ralph lauren": 92,
    "polo ralph lauren": 92,
    "uniqlo": 90,
    "zara": 86,
    "h&m": 82,
    "hm.com": 82,
    "foot locker": 88,
    "finish line": 88,
    "dick's sporting goods": 88,
    "hibbett": 86,
    "shoe palace": 82,
    "dtlr": 80,
    "zappos": 90,
    "nordstrom": 90,
    "target": 88,
    "walmart": 82,
    "amazon": 80,
    "ebay": 78,
    "poshmark": 74,
    "mercari": 72,
    "depop": 68,
}


def load_env_file(path=".env"):
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def estimate_store(url):
    host = urlparse(url).netloc.lower()
    if "ebay" in host:
        return "eBay"
    if "poshmark" in host:
        return "Poshmark"
    if "depop" in host:
        return "Depop"
    if "mercari" in host:
        return "Mercari"
    if "hollister" in host:
        return "Hollister"
    return host.replace("www.", "") or "Unknown"


def parse_price(raw_price):
    if not raw_price:
        return 0
    cleaned = "".join(char for char in raw_price if char.isdigit() or char == ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0


def parse_shipping(result):
    shipping_fields = [
        result.get("shipping"),
        result.get("delivery"),
        result.get("delivery_options"),
    ]
    shipping_text = " ".join(str(field) for field in shipping_fields if field).lower()

    extracted_shipping = result.get("extracted_shipping")
    if isinstance(extracted_shipping, (int, float)):
        return extracted_shipping, money_note(extracted_shipping)

    if "free" in shipping_text:
        return 0, "Free shipping"

    match = re.search(r"\$([0-9]+(?:\.[0-9]{1,2})?)", shipping_text)
    if match:
        shipping = float(match.group(1))
        return shipping, money_note(shipping)

    return None, "Check store"


def money_note(value):
    if value == 0:
        return "Free shipping"
    return f"${value:.2f} shipping"


def trust_for_store(store):
    normalized = store.lower()
    for name, score in TRUSTED_STORES.items():
        if name in normalized:
            return score
    if "official" in normalized:
        return 90
    return 70


def is_trusted_store(store):
    return trust_for_store(store) >= 80


def match_score(query, title):
    query_words = {word.lower().strip("'\".,()") for word in query.split() if len(word) > 2}
    title_words = {word.lower().strip("'\".,()") for word in title.split()}
    if not query_words:
        return 75
    overlap = len(query_words & title_words) / len(query_words)
    return max(55, min(98, round(58 + overlap * 40)))


def search_serpapi(query, size, category, product_type, color, trusted_only):
    api_key = os.environ.get("SERPAPI_API_KEY")
    if not api_key:
        return {
            "listings": [],
            "message": "Missing SERPAPI_API_KEY. Manual mode still works.",
        }

    query_parts = [query, product_type, color, category, f"size {size}"]
    shopping_query = " ".join(part for part in query_parts if part).strip()

    params = urlencode(
        {
            "engine": "google_shopping",
            "q": shopping_query,
            "api_key": api_key,
            "num": 20,
        }
    )
    if os.path.exists("/etc/ssl/cert.pem"):
        context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    else:
        context = ssl.create_default_context()
    with urlopen(f"https://serpapi.com/search.json?{params}", timeout=20, context=context) as response:
        payload = json.loads(response.read().decode("utf-8"))

    listings = []
    seen = set()
    for result in payload.get("shopping_results", [])[:20]:
        link = result.get("link") or result.get("product_link") or ""
        store = result.get("source") or estimate_store(link)
        trust = trust_for_store(store)
        trusted = trust >= 80
        if trusted_only and not trusted:
            continue
        title = result.get("title", query)
        extracted_price = result.get("extracted_price")
        price = extracted_price if isinstance(extracted_price, (int, float)) else parse_price(extracted_price or result.get("price"))
        if price <= 0:
            continue
        identity = (store.lower(), title.lower(), price)
        if identity in seen:
            continue
        seen.add(identity)
        shipping, shipping_note = parse_shipping(result)
        listings.append(
            {
                "store": store,
                "item": title,
                "price": price,
                "shipping": shipping,
                "shippingNote": shipping_note,
                "match": match_score(query, title),
                "trust": trust,
                "isTrusted": trusted,
                "url": link,
                "image": result.get("thumbnail") or result.get("image") or "",
            }
        )

    message = ""
    if trusted_only and not listings:
        message = "No trusted-store matches found. Turn off Trusted only to see broader results."

    return {"listings": listings[:10], "message": message}


class AgentHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "hasApiKey": bool(os.environ.get("SERPAPI_API_KEY")),
                }
            )
            return

        if parsed.path != "/api/search":
            return super().do_GET()

        params = parse_qs(parsed.query)
        query = params.get("q", [""])[0].strip()
        size = params.get("size", ["M"])[0].strip()
        category = params.get("category", ["clothing"])[0].strip()
        product_type = params.get("type", [""])[0].strip()
        color = params.get("color", [""])[0].strip()
        trusted_only = params.get("trustedOnly", ["true"])[0].lower() == "true"

        if not query:
            self.send_json({"error": "Missing product search query."}, status=400)
            return

        try:
            self.send_json(search_serpapi(query, size, category, product_type, color, trusted_only))
        except Exception as error:
            print(f"Search error: {error}", file=sys.stderr)
            self.send_json({"error": str(error)}, status=500)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    load_env_file()
    print(f"Deal Scout Agent running at http://localhost:{PORT}")
    ThreadingHTTPServer(("", PORT), AgentHandler).serve_forever()
