const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const config = require('../config/config.json');

const inputFiles = config.convertTTSummits.inputFiles.map(f => path.join(__dirname, '../', f));
const outputFileSummits = path.join(__dirname, '../', config.convertTTSummits.outputFile.summits);
const outputFileRegions = path.join(__dirname, '../', config.convertTTSummits.outputFile.regions);

function fixSummitName(name) {
  if (name.includes(',')) {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return name;
}

const processHtmlFile = (htmlContent) => {
  const $ = cheerio.load(htmlContent);
  const rows = $('tr').toArray();
  return rows.map((row, idx) => {
    const cells = $(row).find('td');
    if (cells.length < 4) {
      return null;
    }
    // Summit name and link in 2nd cell
    const summitLink = $(cells[1]).find('a[href*="gipfelnr="]');
    if (!summitLink.length) {
      return null;
    }
    const summitName = fixSummitName(summitLink.text().trim());
    const href = summitLink.attr('href');
    let teufelsturmId = null;
    const match = href.match(/gipfelnr=(\d+)/);
    if (match) {
      teufelsturmId = match[1];
    }
    // Region name in 4th cell
    const regionName = $(cells[3]).text().trim();
    return {
      name: summitName,
      region: regionName,
      teufelsturmId: teufelsturmId
    };
  }).filter(e => e !== null);
};

async function main() {
  let allSummits = [];
  let allRegions = [];
  let successCount = 0;
  for (const filePath of inputFiles) {
    if (fs.existsSync(filePath)) {
      console.log(`Processing ${filePath}...`);
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const summits = processHtmlFile(htmlContent);
      allSummits = allSummits.concat(summits);
      successCount += summits.length;
      // Collect regions
      summits.forEach(s => {
        if (!allRegions.includes(s.region)) {
          allRegions.push(s.region);
        }
      });
    } else {
      console.log(`File not found: ${filePath}`);
    }
  }
  fs.writeFileSync(outputFileSummits, JSON.stringify(allSummits, null, 2));
  fs.writeFileSync(outputFileRegions, JSON.stringify(allRegions, null, 2));
  console.log(`Successfully processed ${successCount} summits.`);
  console.log(`Saved ${allRegions.length} unique regions.`);
  console.log(`Output written to ${outputFileSummits} and ${outputFileRegions}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
