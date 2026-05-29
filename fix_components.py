import os, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    replacements = [
        # Fix the inverted header (bg-foreground in brutalist was bg-black)
        # We want table headers to be bg-muted text-muted-fg or similar
        (r'bg-foreground\s+text-accent', 'bg-muted text-foreground'),
        
        # Replace other bg-foreground which are likely brutalist "black" blocks
        (r'bg-foreground\s+text-white', 'bg-muted text-foreground'),
        (r'bg-foreground\s+text-primary-fg', 'bg-muted text-foreground'),
        (r'bg-foreground', 'bg-card border border-border'),
        
        # hover states for buttons
        (r'hover:bg-foreground', 'hover:bg-primary/90 hover:text-primary-fg'),
        (r'hover:text-background', 'hover:text-primary-fg'),
        
        # The AI card had a blue border-left
        (r'border-l-primary', 'border-l-primary'),
        
        # The primary button text colors
        (r'text-primary-fg', 'text-primary-fg'),
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
