#!/usr/bin/env python3
"""Remove duplicate cash flow state declarations from App.tsx"""

filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

with open(filepath, 'r') as f:
    lines = f.readlines()

# Remove lines 680-728 (0-indexed: 679-727)
# Line 680 is blank, line 681 is "// Cash Flow Management States", 
# Line 728 is the closing "});" of newPayable
del lines[679:728]

with open(filepath, 'w') as f:
    f.writelines(lines)

print(f"Removed {728-679} lines of duplicate state declarations")
print(f"New file size: {len(lines)} lines")

# Verify by checking the pattern
with open(filepath, 'r') as f:
    content = f.read()
    count = content.count("// Cash Flow Management States")
    print(f"Occurrences of '// Cash Flow Management States': {count}")