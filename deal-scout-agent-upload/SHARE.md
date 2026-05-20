# Sharing Deal Scout Agent

You have two good sharing options. The link you have now, `http://localhost:8000`, only works on your computer. To text or email one clickable link that works for anyone, use Option 2.

## Option 1: Share on the Same Wi-Fi

This is easiest for showing friends in the same room.

1. Start the server:

```bash
python3 server.py
```

2. Find your Mac's local IP address:

```bash
ipconfig getifaddr en0
```

3. Your friend opens this in their browser:

```text
http://your-ip-address:8000
```

Keep your laptop awake while they use it.

## Option 2: Put It Online

Use this if people should access it from anywhere through one normal link.

1. Put this project on GitHub.
2. Do not upload `.env`.
3. Deploy it on Render as a Python web service.
4. Set this private environment variable in Render:

```text
SERPAPI_API_KEY=your-real-serpapi-key
```

5. Use this start command:

```bash
python3 server.py
```

Anyone with the Render URL can use the agent. They will use your SerpAPI quota, so watch your usage limits.

Your public link will look something like:

```text
https://deal-scout-agent.onrender.com
```

## Do Not Share

Do not share these files:

- `.env`
- anything containing your real SerpAPI key
