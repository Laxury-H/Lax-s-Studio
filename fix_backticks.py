import os

files = [
    "server.ts",
    "src/components/ApiSettingsModal.tsx",
    "src/components/ExchangeSelector.tsx"
]

for f in files:
    with open(f, "r", encoding="utf-8") as file:
        content = file.read()
    content = content.replace("\\`", "`")
    with open(f, "w", encoding="utf-8") as file:
        file.write(content)
