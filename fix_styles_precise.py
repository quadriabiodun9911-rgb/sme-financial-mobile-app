#!/usr/bin/env python3
import re

# Read the original file
with open('App.tsx', 'r') as f:
    content = f.read()

# Split the content around the styles section
parts = re.split(r'(const styles = StyleSheet\.create\(\{)', content, 1)
before_styles = parts[0] if len(parts) > 1 else content
style_start = parts[1] if len(parts) > 1 else ""
after_styles_start = parts[2] if len(parts) > 2 else ""

# Find the end of the styles object - looking for the closing }))
end_match = re.search(r'\};?\s*\n.*?(?=const|export|$|\w+: {)', after_styles_start, re.MULTILINE)

if end_match:
    styles_body = after_styles_start[:end_match.start()]
    after_styles = after_styles_start[end_match.start():]
else:
    # If we can't find the end properly, try to find the last closing brace
    # Count braces to find the end of the StyleSheet.create object
    remaining_text = after_styles_start
    brace_count = 1
    pos = 0
    
    # Skip past the opening brace of the StyleSheet.create
    for i, char in enumerate(remaining_text):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                pos = i
                break
    
    styles_body = remaining_text[:pos+1]
    after_styles = remaining_text[pos+1:]

# Now fix the missing commas in the styles body
# Look for pattern: value followed by newline and property name (meaning missing comma)
def fix_commas(text):
    lines = text.split('\n')
    fixed_lines = []
    
    for i, line in enumerate(lines):
        # Check if this line ends with a value (not with comma, brace, or colon)
        stripped = line.rstrip()
        if (stripped.endswith(("'", '"', '}', ']')) and not stripped.endswith(('",', '"', '},', '],'))) and i + 1 < len(lines):
            next_line = lines[i + 1].lstrip()
            # If next line starts with a property name (word followed by colon), add comma
            if re.match(r'^[a-zA-Z]', next_line):
                if not stripped.endswith(','):
                    line = line + ','
        fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

fixed_styles_body = fix_commas(styles_body)

# Reconstruct the file
fixed_content = before_styles + style_start + fixed_styles_body + after_styles

# Write the fixed content back
with open('App.tsx', 'w') as f:
    f.write(fixed_content)

print("Fixed missing commas in styles and updated App.tsx")