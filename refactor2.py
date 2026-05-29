import os, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replacements for explicit color classes to fix Dark Mode contrast
    replacements = [
        # Text colors
        (r'text-gray-\d{3}', 'text-muted-fg'),
        (r'text-neutral-\d{3}', 'text-muted-fg'),
        (r'text-emerald-\d{3}', 'text-success'),
        (r'text-red-\d{3}', 'text-danger'),
        (r'text-amber-\d{3}', 'text-warning'),
        
        # Backgrounds
        (r'bg-gray-50', 'bg-muted'),
        (r'bg-neutral-50', 'bg-muted'),
        (r'bg-neutral-100', 'bg-muted'),
        (r'bg-emerald-50', 'bg-success/10'),
        (r'bg-emerald-100', 'bg-success/20'),
        (r'bg-red-50', 'bg-danger/10'),
        (r'bg-red-100', 'bg-danger/20'),
        (r'bg-amber-50', 'bg-warning/10'),
        (r'bg-amber-100', 'bg-warning/20'),
        
        # Specific overrides missed earlier
        (r'border-gray-50', 'border-border'),
        (r'border-gray-100', 'border-border'),
        (r'border-[#e2e8f0]', 'border-border'),
        (r'border-[#f1f5f9]', 'border-border'),
        (r'border-red-200', 'border-danger/30'),
        (r'border-amber-200', 'border-warning/30'),
        (r'border-red-600', 'border-danger'),
        (r'border-emerald-600', 'border-success'),
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
