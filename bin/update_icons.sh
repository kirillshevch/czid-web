#!/bin/bash
# This script overwrites ui/icons/index.js with the latest list of Icon components.
# Run this script from the root folder of this repo.
DIR_ROOT=./app/assets/src/components/ui/icons

# Make sure we're running this script from the right folder
([[ ! -d "$DIR_ROOT" ]] || [[ ! -e "$DIR_ROOT/index.js" ]]) && echo "Must run this script from the root folder of this repo" && exit

# Warn that this script overwrites icons/index.js
echo "WARNING: This script will overwrite $DIR_ROOT/index.js"
echo -n "Are you sure? (y/n) "
read confirm
[[ "$confirm" != "y" ]] && echo "Cancelled" && exit;


# ------------------------------------------------------------------------------
# Find all Icon components
# ------------------------------------------------------------------------------

BREAKLINE=$'\n'  # evaluates breakline instead of showing the string "\n"

IMPORTS=""
ICONS_LOGO=""
ICONS_LOGO_REVERSED=""
ICONS_FONT_AWESOME=""
ICONS_CUSTOM=""
for iconPath in $DIR_ROOT/*.jsx; do
    # Extract name from file name (remove folder name and .jsx extension)
    iconName=$(basename ${iconPath//.jsx})
    # Ignore main Icon.jsx component
    [[ "$iconName" == "Icon" ]] && continue

    # Generate code that maps an icon name to its component (note: $'\n' )
    iconLine="    ${iconName},$BREAKLINE"
    # Generate code that imports icon
    IMPORTS+="import $iconName from \"./$iconName\";$BREAKLINE"

    # Logo*.jsx
    if [[ "$iconName" == *"Logo"* ]]; then
        if [[ "$iconName" == *"Reversed"* ]]; then
            ICONS_LOGO_REVERSED+=$iconLine
        else
            ICONS_LOGO+=$iconLine
        fi

    # Icon*.jsx
    elif [[ "$iconName" == *"Icon"* ]]; then
        if grep -q "fa fa-" $iconPath; then
            ICONS_FONT_AWESOME+=$iconLine
        else
            ICONS_CUSTOM+=$iconLine
        fi
    
    # Otherwise, warn us about it
    else
        echo "Warning: unrecognized icon pattern: $iconName at $iconPath."
    fi
done


# ------------------------------------------------------------------------------
# Create index.js
# ------------------------------------------------------------------------------

cat << EOF > $DIR_ROOT/index.js
// WARNING: Do not modify this file manually because it is autogenerated by "./bin/update_icons.sh".
// To update this file, run "./bin/update_icons.sh" from the root folder of this repo.
$IMPORTS

export const ICONS_TAXONOMY = {
  CUSTOM: {
$ICONS_CUSTOM
  },
  FONT_AWESOME: {
$ICONS_FONT_AWESOME
  },
  LOGO: {
$ICONS_LOGO
  },
  LOGO_REVERSED: {
$ICONS_LOGO_REVERSED
  },
};

const icons = Object.values(ICONS_TAXONOMY).reduce((result, components) => {
  return Object.assign(result, components);
}, {});

module.exports = Object.assign(icons, { ICONS_TAXONOMY });
EOF
