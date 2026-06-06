#!/usr/bin/env python3
"""
Script to remove duplicate export default function App() declaration from App.tsx
"""

import os

# Read the file
filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"
with open(filepath, 'r') as f:
    lines = f.readlines()

# Find the first export default function App() at line 102 (0-index: 101)
# Find the second duplicate one at line 2512 (0-index: 2511)
# We need to remove everything from line 2511 onwards
lines_cleaned = lines[:2511]

# Join back to a string
content = ''.join(lines_cleaned)

# Write back
with open(filepath, 'w') as f:
    f.write(content)

print(f"File cleaned: removed {len(lines) - len(lines_cleaned)} lines of duplicate content")
print(f"New file size: {len(lines_cleaned)} lines")