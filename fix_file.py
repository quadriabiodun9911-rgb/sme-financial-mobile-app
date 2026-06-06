#!/usr/bin/env python3
"""
Script to fix the corrupted App.tsx file by removing duplicate content and restoring proper structure
"""

import os

# Define the file path
filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

# Read the current file
with open(filepath, 'r') as f:
    content = f.read()

# Find the correct end of the main component (after </SafeAreaView>)
end_of_component = content.find('</SafeAreaView>', content.rfind('</SafeAreaView>'))
if end_of_component != -1:
    # Find the end of that tag
    end_of_component = content.find(')', end_of_component)
    if end_of_component != -1:
        # Extract everything up to and including the main return statement
        corrected_content = content[:end_of_component+1]
        
        # Add the proper function closing and export
        corrected_content += "\n}\n\nexport default App;"
        
        # Write the corrected content back
        with open(filepath, 'w') as f:
            f.write(corrected_content)
        
        print("File has been corrected!")
        print("- Removed duplicated content")
        print("- Restored proper component structure")
        print("- Added proper export statement")
    else:
        print("Could not find proper end of component")
else:
    print("Could not find SafeAreaView closing tag")