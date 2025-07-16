/**
 * Fix summit name format (handle comma-separated names)
 * @param {string} name - Original summit name
 * @returns {string} Fixed summit name
 */
function fixSummitName(name) {
  if (name.includes(",")) {
    const parts = name.split(",").map((s) => s.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return name;
}

module.exports = fixSummitName;
