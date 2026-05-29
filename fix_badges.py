import os, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to match isUp ? "..." : "..." and isPositive ? "..." : "..."
    # We will replace the entire ternary string logic for classes
    
    replacements = [
        (r'isUp \? "[^"]*" : "[^"]*"', 'isUp ? "text-success bg-success/10" : "text-danger bg-danger/10"'),
        (r'isPositive \? "[^"]*" : "[^"]*"', 'isPositive ? "text-success bg-success/10" : "text-danger bg-danger/10"'),
    ]

    new_content = content
    for pattern, repl in replacements:
        new_content = re.sub(pattern, repl, new_content)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
