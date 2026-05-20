from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen
import json
import os
import ssl
import sys


PORT = int(os.environ.get("PORT", 8000))


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


def trust_for_store(store):
    normalized = store.lower()
    if "hollister" in normalized or "official" in normalized:
        return 94
    if "ebay" in normalized:
        return 78
    if "poshmark" in normalized:
        return 74
    if "depop" in normalized:
        return 68
    if "mercari" in normalized:
        return 72

    scores = {
        "Hollister": 95,
        "eBay": 78,
        "Poshmark": 74,
        "Depop": 68,
        "Mercari": 72,
    }
    return scores.get(store, 65)


def match_score(query, title):
    query_words = {word.lower().strip("'\".,()") for word in query.split() if len(word) > 2}
    title_words = {word.lower().strip("'\".,()") for word in title.split()}
    if not query_words:
        return 75
    overlap = len(query_words & title_words) / len(query_words)
    return max(55, min(98, round(58 + overlap * 40)))


def search_serpapi(query, size):
    api_key = os.environ.get("SERPAPI_API_KEY")
    if not api_key:
        return {
            "listings": [],
            "message": "Missing SERPAPI_API_KEY. Manual mode still works.",
        }

    params = urlencode(
        {
            "engine": "google_shopping",
            "q": f"{query} size {size}",
            "api_key": api_key,
            "num": 10,
        }
    )
    context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    with urlopen(f"https://serpapi.com/search.json?{params}", timeout=20, context=context) as response:
        payload = json.loads(response.read().decode("utf-8"))

    listings = []
    seen = set()
    for result in payload.get("shopping_results", [])[:10]:
        link = result.get("link") or result.get("product_link") or ""
        store = result.get("source") or estimate_store(link)
        title = result.get("title", query)
        price = parse_price(result.get("price"))
        if price <= 0:
            continue
        identity = (store.lower(), title.lower(), price)
        if identity in seen:
            continue
        seen.add(identity)
        shipping_text = (result.get("shipping") or "").lower()
        shipping = 0 if "free" in shipping_text else 7
        listings.append(
            {
                "store": store,
                "item": title,
                "price": price,
                "shipping": shipping,
                "match": match_score(query, title),
                "trust": trust_for_store(store),
                "url": link,
            }
        )

    return {"listings": listings}


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

        if not query:
            self.send_json({"error": "Missing product search query."}, status=400)
            return

        try:
            self.send_json(search_serpapi(query, size))
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
