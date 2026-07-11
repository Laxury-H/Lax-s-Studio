with open('src/components/FuturesHubView.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if '{activeSubTab === "trading" && (' in line:
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if '{activeSubTab === "scanner" && (' in lines[i]:
            end_idx = i - 1
            break

if start_idx != -1 and end_idx != -1:
    del lines[start_idx:end_idx]
    with open('src/components/FuturesHubView.tsx', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print('Deleted old trading block')
else:
    print('Could not find bounds', start_idx, end_idx)
