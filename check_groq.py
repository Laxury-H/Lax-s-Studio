import os
import json
import urllib.request
from urllib.error import HTTPError

# Load env
env_vars = {}
try:
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.strip().split('=', 1)
                env_vars[k.strip()] = v.strip().strip('"\'')
except Exception as e:
    print('Failed to read .env:', e)

groq_key = env_vars.get('GROQ_API_KEY')
if not groq_key:
    print('GROQ_API_KEY not found in .env')
    exit(1)

print('Testing Groq models with key:', groq_key[:10] + '...')

def test_model(model_name):
    url = 'https://api.groq.com/openai/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {groq_key}',
        'Content-Type': 'application/json'
    }
    data = json.dumps({
        'model': model_name,
        'messages': [{'role': 'user', 'content': 'Say hi'}],
        'max_tokens': 10
    }).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            print(f'SUCCESS: {model_name} -> {res["choices"][0]["message"]["content"]}')
            return True
    except HTTPError as e:
        print(f'FAILED: {model_name} -> {e.code} {e.read().decode("utf-8")}')
        return False
    except Exception as e:
        print(f'FAILED: {model_name} -> {e}')
        return False

# Try the default one
if not test_model('llama-3.3-70b-versatile'):
    # If failed, try to list models
    try:
        req = urllib.request.Request('https://api.groq.com/openai/v1/models', headers={'Authorization': f'Bearer {groq_key}'})
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            models = [m['id'] for m in res['data']]
            print('Available models:', models)
            for m in models:
                if test_model(m):
                    print(f'FOUND WORKING MODEL: {m}')
                    break
    except Exception as e:
        print('Failed to list models:', e)
