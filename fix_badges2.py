import os, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = [
        # Fix the broken text in the components
        (r'\{isUp \? "text-success bg-success/10" : "text-danger bg-danger/10"\}(\{[^}]*\})', r'{isUp ? "+" : ""}\1'),
        (r'\{isPositive \? "text-success bg-success/10" : "text-danger bg-danger/10"\}(\{[^}]*\})', r'{isPositive ? "+" : ""}\1'),
        
        # In MarketAnalysisView.tsx:259, it's just {isPositive ? "..." : "..."}{asset.changePercent}%
        # The previous regex will catch it because {asset.changePercent} is enclosed in {}.
        
        # Make sure buttons and yellow boxes use bg-primary text-primary-fg 
        # (I will redefine primary and accent to always use black text on yellow)
        (r'bg-accent text-foreground', 'bg-primary text-primary-fg'),
        (r'text-[#0b1c30]', 'text-foreground'),
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
