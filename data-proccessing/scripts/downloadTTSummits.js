const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config/config.json');

const url = config.downloadTTSummits.url;
const postData = config.downloadTTSummits.data;
const outputFile = path.join(__dirname, '../', config.downloadTTSummits.outputFile);

async function main() {
  try {
    console.log(`Downloading summit HTML from ${url} ...`);
    const response = await axios.post(url, new URLSearchParams(postData).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    fs.writeFileSync(outputFile, response.data);
    console.log(`Downloaded HTML saved to ${outputFile}`);
  } catch (err) {
    console.error('Error downloading summit HTML:', err);
    process.exit(1);
  }
}

main();
