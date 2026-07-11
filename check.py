with open('server.ts', 'r', encoding='utf-8') as f:
    c = f.read()
print('callNvidiaChat replaced:', 'options.model' in c)
print('fetchJson replaced:', 'baseUrl/chat/completions' in c)
print('buildAiPrediction replaced:', '{ task: "prediction", model,' in c)
