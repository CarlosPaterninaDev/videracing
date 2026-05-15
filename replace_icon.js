const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');
let oldIcon = fs.readFileSync('old_icon.txt', 'utf8');

// Extract just the SVG from old_icon
const svgMatch = oldIcon.match(/<svg.*<\/svg>/);
if (!svgMatch) {
    console.error("Could not find SVG");
    process.exit(1);
}
const svg = svgMatch[0];

const newIcon = `<div class="desktop-icon" onclick="document.getElementById('gameModal').classList.add('active')" style="position:fixed; top:120px; right:260px; z-index:100;">
  <div class="icon-img" style="background:transparent; border:none; font-size:32px; width:32px; height:32px;">
    ${svg}
  </div>
  <div>i-wanna-pay-my-card.exe</div>
</div>`;

content = content.replace(oldIcon.trim(), newIcon.trim());

fs.writeFileSync('index.html', content);
console.log("Replaced successfully");
