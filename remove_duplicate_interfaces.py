#!/usr/bin/env python3
"""Remove duplicate interfaces from inside the function body in App.tsx"""

filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

with open(filepath, 'r') as f:
    lines = f.readlines()

# Remove lines 293-348 (0-indexed: 292-347)
# Line 292 is "// Cash Flow Management Interfaces"
# Line 348 is the closing "}" of CashFlowScenario
del lines[292:348]

with open(filepath, 'w') as f:
    f.writelines(lines)

print(f"Removed {348-292} lines of duplicate interfaces")
print(f"New file size: {len(lines)} lines")