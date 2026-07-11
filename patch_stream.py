import sys

with open("server.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Modify /api/chat to allow model in options
content = content.replace(
'''    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        ...mappedHistory,
        { role: "user", content: message }
      ],
      chatFallbackResponse(message, responseLanguage),
      { task: "chat", maxTokens: 700, cacheTtlMs: 0 }
    );''',
'''    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        ...mappedHistory,
        { role: "user", content: message }
      ],
      chatFallbackResponse(message, responseLanguage),
      { task: "chat", model: req.body?.model, maxTokens: 700, cacheTtlMs: 0 }
    );'''
)

# Modify /api/chat/stream
content = content.replace(
'''  app.post("/api/chat/stream", async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      const responseLanguage = getResponseLanguage(req.body?.language);
      if (!message) return res.status(400).json({ error: "Message is required" });

      const key = process.env.NVIDIA_API_KEY;
      if (!key) return res.status(500).json({ error: "NVIDIA_API_KEY missing" });''',
'''  app.post("/api/chat/stream", async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      const responseLanguage = getResponseLanguage(req.body?.language);
      if (!message) return res.status(400).json({ error: "Message is required" });'''
)

content = content.replace(
'''      const streamModel = getAiModelForTask("stream");

      const response = await fetch(`${getNvidiaBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: streamModel,''',
'''      let streamModel = req.body?.model || getAiModelForTask("stream");
      let baseUrl = getNvidiaBaseUrl();
      let streamKey = process.env.NVIDIA_API_KEY;
      
      if (streamModel.startsWith("groq-")) {
        streamKey = process.env.GROQ_API_KEY;
        baseUrl = "https://api.groq.com/openai/v1";
        streamModel = "llama3-70b-8192";
      }
      
      if (!streamKey) return res.status(500).json({ error: "API_KEY missing" });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${streamKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: streamModel,'''
)

with open("server.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch stream applied to server.ts")
