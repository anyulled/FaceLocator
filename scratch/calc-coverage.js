import fs from 'fs';
const coverage = JSON.parse(fs.readFileSync('coverage.json', 'utf8'));

let totalBranches = 0;
let coveredBranches = 0;

for (const file in coverage) {
  const fileCoverage = coverage[file];
  // v8 format seems to store branch counts in 's', 'f', 'b' directly if not standard
  // Wait, I see 'b' as an object with branch keys
  if (fileCoverage.b) {
    for (const key in fileCoverage.b) {
      if (key.startsWith('b')) {
        totalBranches++;
        if (fileCoverage.b[key] > 0) {
          coveredBranches++;
        }
      }
    }
  }
}

console.log(`Total Branches: ${totalBranches}`);
console.log(`Covered Branches: ${coveredBranches}`);
console.log(`Percentage: ${(coveredBranches / totalBranches * 100).toFixed(2)}%`);
