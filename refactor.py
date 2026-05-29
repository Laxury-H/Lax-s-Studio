import os, glob, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replacements for Brutalist theme to Premium theme
    replacements = [
        # Brutalist shadows and borders
        (r'shadow-\[.*?rgba\(0,0,0,1\)\]', 'shadow-lg shadow-black/5 dark:shadow-black/20'),
        (r'shadow-\[.*?\]', 'shadow-md shadow-black/5 dark:shadow-black/20'),
        (r'border-2\s+border-black', 'border border-border'),
        (r'border\s+border-black', 'border border-border'),
        (r'border-b-2\s+border-black', 'border-b border-border'),
        (r'border-t-2\s+border-black', 'border-t border-border'),
        (r'border-l-8\s+border-l-\[\#0047FF\]', 'border-l-4 border-l-primary'),
        (r'border-black', 'border-border'),
        (r'rounded-xs', 'rounded-xl'),
        
        # Colors
        (r'bg-white', 'bg-card'),
        (r'bg-\[\#F3F3F3\]', 'bg-background'),
        (r'bg-\[\#0047FF\]', 'bg-primary'),
        (r'bg-\[\#FFD600\]', 'bg-accent'),
        (r'text-white', 'text-primary-fg'),
        (r'text-black', 'text-foreground'),
        (r'bg-black', 'bg-foreground'),
        
        # Specific hover states
        (r'hover:bg-black', 'hover:bg-foreground'),
        (r'hover:text-white', 'hover:text-background'),
        (r'hover:text-\[\#FFD600\]', 'hover:text-accent-fg'),
        (r'hover:bg-\[\#0037c6\]', 'hover:bg-primary/90'),
        (r'hover:bg-neutral-900', 'hover:bg-foreground/90'),
        
        # Text opacity
        (r'text-black/60', 'text-muted-fg'),
        (r'text-black/50', 'text-muted-fg'),
        (r'text-black/40', 'text-muted-fg'),
        (r'text-black/80', 'text-foreground/80'),
        (r'text-black/70', 'text-foreground/70'),
        (r'text-black/45', 'text-muted-fg'),
        
        # Other explicit hardcoded hex codes
        (r'bg-amber-100', 'bg-accent/20'),
        (r'text-amber-700', 'text-accent'),
        (r'bg-amber-200', 'bg-accent/30'),
        (r'bg-\[\#eff4ff\]', 'bg-primary/10'),
        (r'text-\[\#5856d6\]', 'text-primary'),
        (r'hover:bg-\[\#dce9ff\]', 'hover:bg-primary/20'),
        (r'bg-\[\#5856d6\]', 'bg-primary'),
        (r'hover:bg-\[\#3f3bbd\]', 'hover:bg-primary/90'),
        (r'text-\[\#0b1c30\]', 'text-foreground'),
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
