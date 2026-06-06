#!/usr/bin/env python3
import re

# Read the file
with open('App.tsx', 'r') as f:
    content = f.read()

# Find the styles section and fix missing commas
def fix_style_commas(match):
    style_block = match.group(0)
    
    # Fix missing commas between style properties - look for property: value followed by newline and another property
    # The pattern is: line ending with a value (not ending with comma/brace) followed by indented property on next line
    fixed_block = re.sub(r'(\s+[a-zA-Z0-9].*\n)(\s+[a-zA-Z])', r'\1,\2', style_block)
    
    # Also fix lines that end with quotes/brackets but no comma before next property
    fixed_block = re.sub(r'(["\]])\s*\n(\s+[a-zA-Z])', r'\1,\n\2', fixed_block)
    
    return fixed_block

# Replace the styles section with fixed version
fixed_content = re.sub(r'const styles = StyleSheet\.create\(\{[^}]+\}\s*\);?', fix_style_commas, content, flags=re.DOTALL)

# Write the fixed content back
with open('App.tsx_fixed', 'w') as f:
    f.write(fixed_content)

print("Fixed styles and saved to App.tsx_fixed")