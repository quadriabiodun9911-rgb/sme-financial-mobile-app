#!/usr/bin/env python3
"""Fix the App.tsx structure: move styles before return, close JSX properly."""

import re

with open('App.tsx.final_backup', 'r') as f:
    lines = f.readlines()

# Find the styles block start
styles_start = None
for i, line in enumerate(lines):
    if line.strip().startswith('const styles = StyleSheet.create({'):
        styles_start = i
        break

if styles_start is None:
    print("ERROR: Could not find styles start")
    exit(1)

# Find the MAIN return line (indentation = 4 spaces)
return_line = None
for i in range(styles_start):
    stripped = lines[i].strip()
    if stripped == 'return (':
        indent = len(lines[i]) - len(lines[i].lstrip())
        if indent == 4:
            return_line = i

if return_line is None:
    print("ERROR: Could not find main return (")
    exit(1)

print(f"Main return ( found at line {return_line+1}")
print(f"Styles block starts at line {styles_start+1}")

# Extract styles content (skip the first line "const styles = StyleSheet.create({")
styles_content = lines[styles_start+1:]

# Reformats styles: fix indentation, add commas, handle malformed lines
fixed_styles = ['    const styles = StyleSheet.create({\n']
last_was_closing = False

for line in styles_content:
    stripped = line.strip()
    
    if not stripped:
        continue
    
    # Skip comments
    if stripped.startswith('//'):
        fixed_styles.append(f'        {stripped}\n')
        last_was_closing = False
        continue
    
    # Check if it's a style key opening: "keyName: {" or "keyName:{" 
    key_match = re.match(r'^(\w+)\s*:\s*\{\s*$', stripped)
    if key_match:
        key = key_match.group(1)
        fixed_styles.append(f'        {key}: {{\n')
        last_was_closing = False
        continue
    
    # Check if it's a closing brace
    close_match = re.match(r'^\}\s*,?\s*;?\s*$', stripped)
    if close_match:
        fixed_styles.append('        },\n')
        last_was_closing = True
        continue
    
    # Check for malformed "})keyName: {" pattern
    malformed = re.match(r'^\}\)(\w+)\s*:\s*\{\s*$', stripped)
    if malformed:
        key = malformed.group(1)
        fixed_styles.append(f'        {key}: {{\n')
        last_was_closing = False
        continue
    
    # Must be a property line: "key: value" or "key: value," 
    prop_match = re.match(r'^(\w+)\s*:\s*(.+)$', stripped)
    if prop_match:
        key = prop_match.group(1)
        value = prop_match.group(2).rstrip(',').strip()
        fixed_styles.append(f'            {key}: {value},\n')
        last_was_closing = False
        continue
    
    # Fallback: keep as-is but with proper indentation
    fixed_styles.append(f'        {stripped}\n')
    last_was_closing = False

# Don't remove the last closing brace - it closes the last style entry
# Add the final StyleSheet.create closing
fixed_styles.append('    });\n')

# Now build the output
output_lines = []

# Part 1: everything before the return
output_lines.extend(lines[:return_line])

# Part 2: the fixed styles
output_lines.extend(fixed_styles)
output_lines.append('\n')

# Part 3: the return and JSX content (from return to styles_start)
output_lines.extend(lines[return_line:styles_start])

# Part 4: Close the JSX
output_lines.append('        </SafeAreaView>\n')
output_lines.append('    );\n')
output_lines.append('}\n')

with open('App.tsx', 'w') as f:
    f.writelines(output_lines)

print("Done! File fixed.")
print(f"Total lines: {len(output_lines)}")