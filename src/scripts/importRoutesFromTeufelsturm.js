const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cheerio = require('cheerio');
require('dotenv').config();

const Summit = require('../models/Summit');
const Region = require('../models/Region');
const Route = require('../models/Route');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;

const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

const dataDir = path.join(__dirname, '../../data/teufelsturm');

const JUMP_SCALA = ["1","2","3","4","5"]
const SCALA = ["I", "II", "III", "IV", "V", "VI", "VIIa", "VIIb", "VIIc", "VIIIa", "VIIIb", "VIIIc", "IXa", "IXb", "IXc", "Xa", "Xb", "Xc", "XIa", "XIb", "XIc", "XIIa", "XIIb", "XIIc"]
const scoreMap = {
  'arrow-downright': '-3',
  'arrow-downright2': '-2', 
  'arrow-downright3': '-1',
  'arrow-right': '0',
  'arrow-upright': '3',
  'arrow-upright2': '2',
  'arrow-upright3': '1'
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
  return res;
} 

const processHtmlFile = async (htmlContent) => {
  const summitData = cheerio.load(htmlContent);
  const data = summitData("body:nth-child(2) tbody tr td:nth-child(2) table tbody tr td div table tbody tr")
    .toArray()
    .map((e) => {
      let summit = ((e.children[1]).children[0]).children
      if(summit == undefined) return null

      let region = ((e.children[5]).children[0]).children
      if(region == undefined) return null

      let difficutly = ((e.children[4]).children[0]).children
      if(difficutly == undefined) return null

      let route = (((e.children[2]).children[0]).children[1]).children[0] 
      if(route == undefined) return null

      // Extract teufelsturmId from the URL parameter 'wegnr'
      let teufelsturmId = null;
      const routeLink = ((e.children[2]).children[0]).children[1].attribs.href;
      if (routeLink) {
        const match = routeLink.match(/wegnr=(\d+)/);
        if (match) {
          teufelsturmId = match[1];
        }
      }

      let teufelsturmScore = ((e.children[3]).children[0]).children[0].attribs.src;
      if (teufelsturmScore) {
        teufelsturmScore = teufelsturmScore.split('/').pop().split('.')[0]; // Extract the score from the image name
        // Resolve the score into a number
        for (const [key, value] of Object.entries(scoreMap)) {
          if (teufelsturmScore.includes(key)) {
            teufelsturmScore = value;
            break;
          }
        }
      }

      return {
        summit: (summit[0]).data.trim(),
        route: route.data.trim(),
        region: (region[0]).data.trim(),
        teufelsturmId: teufelsturmId,
        teufelsturmScore: teufelsturmScore,
        ...resolveDifficulty((difficutly[0]).data.trim()),
      }
    }).filter((e) => {
       return e !== null
    })
    
    return data;
}; 

async function importRoutesFromTeufelsturm() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const files = fs.readdirSync(dataDir);
    
    for (const file of files) {
      if (file.endsWith('.html')) {
        console.log(`Processing ${file}...`);
        const filePath = path.join(dataDir, file);
        const htmlContent = fs.readFileSync(filePath, 'utf8');

        const data = await processHtmlFile(htmlContent);
        
        // Insert or update regions, summits, and routes
        for (const route of data) {
          // Insert or update region
          const region = await Region.findOneAndUpdate(
            { name: route.region },
            { name: route.region },
            { upsert: true, new: true }
          );

          // Insert or update summit
          const summit = await Summit.findOneAndUpdate(
            { name: route.summit, region: region},
            { name: route.summit, region: region},
            { upsert: true, new: true }
          );

          // Insert or update route
          await Route.findOneAndUpdate(
            { name: route.route, summit: summit },
            {
              name: route.route,
              summit: summit,
              teufelsturmId: route.teufelsturmId,
              teufelsturmScore: route.teufelsturmScore,
              difficulty: {
                jump: route.difficulty.jump || null,
                RP: route.difficulty.RP || null,
                normal: route.difficulty.normal || null,
                withoutSupport: route.difficulty.withoutSupport || null
              },
              unsecure: route.unsecure,
              stars: route.stars,
            },
            { upsert: true, new: true }
          );
        }
        
        console.log(`Finished processing ${file}`);
      }
    }

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

importRoutesFromTeufelsturm(); 