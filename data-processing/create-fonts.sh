#!/bin/bash

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

INPUT_DIR="$BASE_DIR/input-data/fonts"
CONFIG_FILE="$BASE_DIR/config/fontsToInclude.txt"
TMP_DIR="$BASE_DIR/tmp/fonts"
OUTPUT_DIR="$BASE_DIR/output-static-data/fonts/"
OUTPUT_FILE="$OUTPUT_DIR/fonts.tar.gz"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found: $CONFIG_FILE"
    exit 1
fi

# Check if input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Input directory not found: $INPUT_DIR"
    exit 1
fi

# Create directories
mkdir -p "$TMP_DIR"
mkdir -p "$OUTPUT_DIR"

# Clean tmp directory
rm -rf "$TMP_DIR"/*

echo "Copying fonts from $INPUT_DIR to $TMP_DIR..."

# Read each line from the config file
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    
    # Extract font name and file from the line format: "Font Name"/"file.pbf"
    if [[ $line =~ ^\"([^\"]+)\"/\"([^\"]+)\"$ ]]; then
        font_name="${BASH_REMATCH[1]}"
        font_file="${BASH_REMATCH[2]}"
        
        # Convert "Semi Bold" to "Semibold" for input directory lookup
        input_font_name="${font_name// Semi Bold/ Semibold}"
        
        source_path="$INPUT_DIR/$input_font_name/$font_file"
        dest_dir="$TMP_DIR/$font_name"
        dest_path="$dest_dir/$font_file"
        
        if [ -f "$source_path" ]; then
            mkdir -p "$dest_dir"
            cp "$source_path" "$dest_path"
            echo "Copied: $font_name/$font_file"
        else
            echo "Warning: File not found: $source_path"
        fi
    else
        echo "Warning: Invalid line format: $line"
    fi
done < "$CONFIG_FILE"

# Create tar.gz archive
echo "Creating archive: $OUTPUT_FILE"
cd "$BASE_DIR/tmp"
tar -czf "$OUTPUT_FILE" fonts/

echo "Done: $OUTPUT_FILE"
echo "Archive contents:"
tar -tzf "$OUTPUT_FILE" | head -10
if [ $(tar -tzf "$OUTPUT_FILE" | wc -l) -gt 10 ]; then
    echo "... (and $(( $(tar -tzf "$OUTPUT_FILE" | wc -l) - 10 )) more files)"
fi
