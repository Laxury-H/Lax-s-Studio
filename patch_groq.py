import sys

with open("server.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Add model to AiCallOptions
content = content.replace(
'''type AiCallOptions = {
  task?: AiTask;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};''',
'''type AiCallOptions = {
  task?: AiTask;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};'''
)

# Modify callNvidiaChat
content = content.replace(
'''async function callNvidiaChat<T>(
  messages: AiMessage[],
  fallback: T,
  options: AiCallOptions = {}
): Promise<T> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    return fallback;
  }

  const task = options.task || "chat";
  const model = getAiModelForTask(task);''',
'''async function callNvidiaChat<T>(
  messages: AiMessage[],
  fallback: T,
  options: AiCallOptions = {}
): Promise<T> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = model.replace("groq-", "");
  }

  if (!key) {
    return fallback;
  }'''
)

# Modify fetch inside callNvidiaChat (only the first occurrence should be callNvidiaChat)
# Let's replace both occurrences by just defining baseUrl in both functions.

# Modify callNvidiaText
content = content.replace(
'''async function callNvidiaText(
  messages: AiMessage[],
  fallback: string,
  options: AiCallOptions = {}
): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return fallback;

  const task = options.task || "chat";
  const model = getAiModelForTask(task);''',
'''async function callNvidiaText(
  messages: AiMessage[],
  fallback: string,
  options: AiCallOptions = {}
): Promise<string> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = model.replace("groq-", "");
  }

  if (!key) return fallback;'''
)

content = content.replace(
'''const response = await fetchJson<any>(`${getNvidiaBaseUrl()}/chat/completions`,''',
'''const response = await fetchJson<any>(`${baseUrl}/chat/completions`,'''
)

# We need to make sure we also update the endpoints that call callNvidiaChat where the frontend passes the `model` parameter.
# The user wants Groq. In AIInsightsView, they select the model and it's sent to `/api/prediction`.
# Let's verify `/api/prediction` passes `req.body.model` to `options.model`.

with open("server.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied to server.ts")
