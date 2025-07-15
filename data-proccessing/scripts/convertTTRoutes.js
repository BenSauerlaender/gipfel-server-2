const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const config = require('../config/config.json');

const JUMP_SCALA = ["1","2","3","4","5"]
const SCALA = ["I", "II", "III", "IV", "V", "VI", "VIIa", "VIIb", "VIIc", "VIIIa", "VIIIb", "VIIIc", "IXa", "IXb", "IXc", "Xa", "Xb", "Xc", "XIa", "XIb", "XIc", "XIIa", "XIIb", "XIIc"]
const scoreMap = {
  'arrow-downright': '-1',
  'arrow-downright2': '-2', 
  'arrow-downright3': '-3',
  'arrow-right': '0',
  'arrow-upright': '1',
  'arrow-upright2': '2',
  'arrow-upright3': '3'
};

const resolveDifficulty = (s) => {
  let res = {
    unsecure: false,
    stars: 0,
    difficulty: {
      jump: undefined,
      RP: undefined,
      normal: undefined,
      withoutSupport: undefined
    }
  }
  let symbols = s.split(/[\s\/]+/)
  let symbol = symbols.shift() 
  while(symbol !== undefined){
    if(symbol == "!"){
      res.unsecure = true;
    }else if(symbol == "*"){
      res.stars = 1
    }else if(symbol == "**"){
      res.stars = 2
    }else if(SCALA.includes(symbol)){
      res.difficulty.normal = symbol
    }else if(JUMP_SCALA.includes(symbol)){
      res.difficulty.jump = symbol
    }else if(SCALA.map(s => "("+s+")").includes(symbol)){
      res.difficulty.withoutSupport = symbol.slice(1,-1)
    }else if(symbol == "RP"){
      symbol = symbols.shift()
      if(SCALA.includes(symbol)){
        res.difficulty.RP = symbol
      }else{
        console.log("Symbol " +symbol+" is not an valid RP")
      }
    }else{
      console.log("Symbol " +symbol+" cant be proccessed")
    }

    symbol = symbols.shift()
  }
  if(!res.difficulty.jump && !res.difficulty.withoutSupport && !res.difficulty.RP && !res.difficulty.normal) {
    console.log("No difficulty found in: " + s);
  }
  return res;
} 

function fixSummitName(name) {
  if (name.includes(',')) {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return name;
}

const processHtmlFile = async (htmlContent) => {
  const summitData = cheerio.load(htmlContent);
  const data = summitData("body:nth-child(2) tbody tr td:nth-child(2) table tbody tr td div table tbody tr")
    .toArray()
    .map((e,idx) => {
      let summit = ((e.children[1]).children[0]).children
      if(summit == undefined) {
        console.log(`Summit not found in element ${idx}`);
        return null
      }

      let region = ((e.children[5]).children[0]).children
      if(region == undefined) {
        console.log(`Region not found in element ${idx}`);
        return null
      }

      let difficulty = ((e.children[4]).children[0]).children
      if(difficulty == undefined){
        console.log(`Difficulty not found in element ${idx}`);
        return null
      }

      let route = (((e.children[2]).children[0]).children[1]).children[0]
      if(route == undefined) {
        console.log(`Route not found in element ${idx}`);
        return null
      }

      // Extract teufelsturmId from the URL parameter 'wegnr'
      let teufelsturmId = null;
      const routeLink = ((e.children[2]).children[0]).children[1].attribs.href;
      if (routeLink) {
        const match = routeLink.match(/wegnr=(\d+)/);
        if (match) {
          teufelsturmId = match[1];
        }
      }
      if (!teufelsturmId) {
        console.log(`Teufelsturm ID not found in element ${idx}:`);
      }

      let teufelsturmScore = ((e.children[3]).children[0]).children[0].attribs.src;
      if (teufelsturmScore) {
        teufelsturmScore = teufelsturmScore.split('/').pop().split('.')[0]; // Extract the score from the image name
        // Resolve the score into a number
        teufelsturmScore = scoreMap[teufelsturmScore] || undefined
      }
      if(!teufelsturmScore) {
        console.log(`Teufelsturm score not found in element ${idx}:`);
        return null;
      }

      return {
        name: route.data.trim(),
        summit: fixSummitName((summit[0]).data.trim()),
        region: (region[0]).data.trim(),
        teufelsturmId: teufelsturmId,
        teufelsturmScore: teufelsturmScore,
        ...resolveDifficulty((difficulty[0]).data.trim()),
      }
    }).filter((e) => {
       return e !== null
    })
    
    return data;
}; 

const inputFiles = config.convertTTRoutes.inputFiles.map(f => path.join(__dirname, '../', f));
const outputFileRegion = path.join(__dirname, '../', config.convertTTRoutes.outputFiles.regions);
const outputFileSummit = path.join(__dirname, '../', config.convertTTRoutes.outputFiles.summits);
const outputFileRoute = path.join(__dirname, '../', config.convertTTRoutes.outputFiles.routes);

async function main() {
  let allData = [];
  let successCount = 0;
  for (const filePath of inputFiles) {
    if (fs.existsSync(filePath)) {
      console.log(`Processing ${filePath}...`);
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const data = await processHtmlFile(htmlContent);
      allData = allData.concat(data);
      successCount += data.length;
    } else {
      console.log(`File not found: ${filePath}`);
    }
  }
  const uniqueRegions = allData.reduce((acc, route) => {
    if (!acc.includes(route.region)) {
      acc.push(route.region);
    }
    return acc;
  }, new Array());
  const uniqueSummits = allData.reduce((acc, route) => {
    if (!acc.some(s => s.name === route.summit && s.region === route.region)) {
      acc.push({
        name: route.summit,
        region: route.region,
        teufelsturmId: undefined
      });
    }
    return acc;
  }, new Array());
  const uniqueRoutes = allData.reduce((acc, route) => {
    if (!acc.some(r => r.name === route.name && r.summit === route.summit && r.region === route.region)) {
      acc.push({
        name: route.name,
        summit: route.summit,
        region: route.region,
        teufelsturmId: route.teufelsturmId,
        teufelsturmScore: route.teufelsturmScore,
        difficulty: route.difficulty
      });
    } else {
      console.log(`Duplicate route found: ${route.name} at summit ${route.summit} at region ${route.region}`);
    }
    return acc;
  }, new Array());
  fs.writeFileSync(outputFileRegion, JSON.stringify(uniqueRegions, null, 2));
  fs.writeFileSync(outputFileSummit, JSON.stringify(uniqueSummits, null, 2));
  fs.writeFileSync(outputFileRoute, JSON.stringify(uniqueRoutes, null, 2));
  console.log(`Successfully processed ${successCount} rows.`);
  console.log(`Saved ${uniqueRegions.length} unique regions, ${uniqueSummits.length} unique summits, and ${uniqueRoutes.length} unique routes.`);
  console.log(`Output written to ${outputFileRegion}, ${outputFileSummit}, and ${outputFileRoute}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});