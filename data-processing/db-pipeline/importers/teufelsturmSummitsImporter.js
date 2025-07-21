const fs = require("fs");
const cheerio = require("cheerio");

class TeufelsturmSummitsImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(
      `Importing Teufelsturm summits from ${files.length} HTML files:`
    );
    this.logger.debug(`files to import:`, files);

    const allSummits = [];
    const regionSet = new Set();

    for (const file of files) {
      let fileData;
      try {
        this.logger.info(`Loading HTML file: ${file}`);
        fileData = fs.readFileSync(file, "utf8");
      } catch (error) {
        this.logger.error(`Failed to load HTML file: ${file}`, error);
        errors.push({ type: "FILE_LOADING", sourceFile: file });
        continue;
      }

      const result = this.processHtmlFile(fileData, file);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      allSummits.push(...result.summits);

      // Collect unique regions
      result.summits.forEach((summit) => {
        if (summit.region) {
          regionSet.add(summit.region);
        }
      });
    }

    // Remove duplicate summits
    const deduplicatedSummits = this.removeDuplicates(allSummits, errors);

    const regionsAbbrMap = JSON.parse(
      fs.readFileSync(config.regionsAbbrMap, "utf8")
    );
    const regions = Array.from(regionSet).map((name) => {
      const abbr = regionsAbbrMap[name] || null;
      if (!abbr) {
        warnings.push({
          type: "MISSING_REGION_ABBR",
          regionName: name,
        });
      }
      return { name, abbr };
    });

    this.logger.info(
      `Successfully processed ${deduplicatedSummits.length} summits (${allSummits.length - deduplicatedSummits.length} duplicates removed)`
    );
    this.logger.info(`Found ${regions.length} unique regions`);

    return {
      metadata: {
        sourceName: this.sourceName,
        processedAt: new Date(),
        warnings,
        errors,
        sourceFiles: files,
        stats: {
          summitsProcessed: deduplicatedSummits.length,
          regionsFound: regions.length,
        },
      },
      data: {
        summits: deduplicatedSummits,
        regions: regions, // Include regions with abbreviations
      },
    };
  }

  processHtmlFile(htmlContent, file) {
    const warnings = [];
    const errors = [];
    const summits = [];

    if (!htmlContent || typeof htmlContent !== "string") {
      errors.push({ type: "INVALID_HTML_CONTENT", sourceFile: file });
      return { summits: [], warnings, errors };
    }

    try {
      const $ = cheerio.load(htmlContent);
      const rows = $("tr").toArray();

      this.logger.debug(`Found ${rows.length} table rows in ${file}`);

      rows.forEach((row, index) => {
        if (index < 22) {
          // Skip first 21 rows (header and some initial rows)
          this.logger.debug(`Skipping row ${index} in ${file}`);
          return;
        }
        const result = this.processSummitRow($, row, file, index);

        if (result.error) {
          errors.push(result.error);
          return;
        }

        if (result.warning) {
          warnings.push(result.warning);
        }

        if (result.summit) {
          summits.push(result.summit);
        }
      });
    } catch (error) {
      this.logger.error(`Failed to parse HTML content in ${file}`, error);
      errors.push({
        type: "HTML_PARSING_ERROR",
        sourceFile: file,
        message: error.message,
      });
    }

    return { summits, warnings, errors };
  }

  processSummitRow($, row, file, rowIndex) {
    const cells = $(row).find("td");

    if (cells.length < 4) {
      return { error: { type: "INSUFFICIENT_CELLS", rowIndex } };
    }

    // Summit name and link in 2nd cell (index 1)
    const summitLink = $(cells[1]).find('a[href*="gipfelnr="]');
    if (!summitLink.length) {
      return { error: { type: "NO_SUMMIT_LINK", rowIndex } };
    }

    const rawSummitName = summitLink.text().trim();
    if (!rawSummitName) {
      return {
        error: {
          type: "EMPTY_SUMMIT_NAME",
          sourceFile: file,
          rowIndex,
        },
      };
    }

    const summitName = this.fixSummitName(rawSummitName);

    // Extract teufelsturmId from link
    const href = summitLink.attr("href");
    const teufelsturmId = this.extractTeufelsturmId(href);

    if (!teufelsturmId) {
      return {
        warning: {
          type: "MISSING_TEUFELSTURM_ID",
          sourceFile: file,
          rowIndex,
          summitName: summitName,
        },
      };
    }

    // Region name in 4th cell (index 3)
    const regionName = $(cells[3]).text().trim();
    if (!regionName) {
      return {
        error: {
          type: "MISSING_REGION",
          sourceFile: file,
          rowIndex,
          summitName: summitName,
        },
      };
    }

    return {
      summit: {
        name: summitName,
        region: regionName,
        teufelsturmId: teufelsturmId,
      },
    };
  }

  fixSummitName(name) {
    if (name.includes(",")) {
      const parts = name.split(",").map((s) => s.trim());
      if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
      }
    }
    return name;
  }

  extractTeufelsturmId(href) {
    if (!href) return null;

    const match = href.match(/gipfelnr=(\d+)/);
    return match ? match[1] : null;
  }

  removeDuplicates(summits, errors) {
    const nameMap = new Map();
    const idMap = new Map();
    const deduplicatedSummits = [];
    let duplicatesRemoved = 0;

    summits.forEach((summit, index) => {
      let shouldAdd = true;

      // Check for duplicate names
      if (nameMap.has(summit.name)) {
        errors.push({
          type: "DUPLICATE_SUMMIT_NAME_REMOVED",
          value: summit.name,
          originalIndex: nameMap.get(summit.name),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      // Check for duplicate teufelsturmIds (only if name is unique)
      if (
        shouldAdd &&
        summit.teufelsturmId &&
        idMap.has(summit.teufelsturmId)
      ) {
        errors.push({
          type: "DUPLICATE_TEUFELSTURM_ID_REMOVED",
          value: summit.teufelsturmId,
          summitName: summit.name,
          originalIndex: idMap.get(summit.teufelsturmId),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      if (shouldAdd) {
        nameMap.set(summit.name, index);
        if (summit.teufelsturmId) {
          idMap.set(summit.teufelsturmId, index);
        }
        deduplicatedSummits.push(summit);
      }
    });

    if (duplicatesRemoved > 0) {
      this.logger.warn(`Removed ${duplicatesRemoved} duplicate summits`);
    }

    return deduplicatedSummits;
  }
}

module.exports = TeufelsturmSummitsImporter;
