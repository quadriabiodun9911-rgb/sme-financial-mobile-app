#!/usr/bin/env python3
"""
Clean up App.tsx by:
1. Removing the second duplicate export default function App()
2. Removing duplicate interfaces injected inside the function body
3. Properly closing the file
"""

filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

with open(filepath, 'r') as f:
    lines = f.readlines()

print(f"Original file: {len(lines)} lines")

# Step 1: Find the second "export default function App()" and remove everything after it
second_export_line = None
for i, line in enumerate(lines):
    if i > 200 and "export default function App()" in line:
        second_export_line = i
        break

if second_export_line:
    print(f"Found second export at line {second_export_line + 1}")
    lines = lines[:second_export_line]
    print(f"After removing second copy: {len(lines)} lines")
else:
    print("No second export found")

# Step 2: Find and remove the duplicate interfaces inside the function body
# These are inserted between the first return of oneThingInsight and the else if
# Pattern: "// Cash Flow Management Interfaces" inside the function body
dup_start = None
dup_end = None
for i, line in enumerate(lines):
    if i > 200 and "// Cash Flow Management Interfaces" in line:
        dup_start = i
        break

if dup_start:
    # The duplicate interfaces end at the closing "}" of CashFlowScenario
    # Then there's an extra blank line before "} else if"
    for j in range(dup_start, len(lines)):
        if j > dup_start + 50 and "probability: number;" in lines[j]:
            dup_end = j + 2  # skip the closing "}" and the blank line
            break
    
    if dup_end:
        # The line before dup_start is the closing of the first return: "            };"
        # We need to replace from dup_start to dup_end with the correct else if
        # The original code should have: "        } else if (margin < parseFloat(targetMargin)) {"
        # But the comment replaced the "} else if" line
        # Actually, the comment is on the same line as the closing "};"
        # So we need to:
        # 1. Keep the line before dup_start (which is "            };")
        # 2. Replace the comment line + all interfaces with "        } else if (margin < parseFloat(targetMargin)) {"
        fixed_lines = lines[:dup_start]
        fixed_lines.append("        } else if (margin < parseFloat(targetMargin)) {\n")
        fixed_lines.extend(lines[dup_end:])
        lines = fixed_lines
        print(f"Removed duplicate interfaces from lines {dup_start+1}-{dup_end}")
        print(f"After removing interfaces: {len(lines)} lines")

# Step 3: Properly close the file
# The file currently ends with the second copy's content, but we cut it at the second export
# Check if the last meaningful line is the closing of the component
# Actually, the first copy should end properly since we cut at the second export
# Let's check the last few lines
last_lines = lines[-5:]
print(f"Last 5 lines: {repr(last_lines)}")

# The first copy's return statement should end with </SafeAreaView> + ); + }
# And then we need export default App;
# Since we cut at the second export, the file should end with the styles or something
# Let's check if the file ends with a proper component closure

# Find the last </SafeAreaView> in the first copy
last_safearea = None
for i in range(len(lines) - 1, -1, -1):
    if "</SafeAreaView>" in lines[i]:
        last_safearea = i
        break

if last_safearea:
    print(f"Last SafeAreaView at line {last_safearea + 1}")
    # The component should end with: </SafeAreaView>\n    );\n}\n
    # But we need to check if there's a proper closing after this
    # Let's look at the lines after SafeAreaView
    if last_safearea + 3 < len(lines):
        print(f"After SafeAreaView: {repr(lines[last_safearea:last_safearea+5])}")

# Write the cleaned file
with open(filepath, 'w') as f:
    f.writelines(lines)

print(f"\nFinal file: {len(lines)} lines")
print("Done!")