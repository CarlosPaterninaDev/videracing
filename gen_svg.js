const pal = {
    'R': '#e52521',
    'B': '#049cd8',
    'S': '#fbd000',
    'H': '#432817',
    'Y': '#fbd000',
    'W': '#ffffff',
    'K': '#000000'
};
const sprite = [
    ".....RRRRR......",
    "....RRRRRRRRR...",
    "....HHHSSSK.....",
    "...HSHSSSKSS....",
    "...HSHHSSSHSS...",
    "...HHSSKKKK.....",
    "......SSSSSSS...",
    ".....RRBRRR.....",
    "....RRRBBBRRR...",
    "...RRRRBBBBRRRR.",
    "..WWRRBYYBYYRRWW",
    "..WWWBBBBBBBBWWW",
    "..WW.BBBBBBBB.WW",
    ".....BBBBBB.....",
    "....HHH....HHH..",
    "...HHHH....HHHH."
];

let rects = '';
for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
        let c = sprite[y][x];
        if (pal[c]) {
            rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}" />`;
        }
    }
}
console.log(`<svg viewBox="0 0 16 16" style="width:100%; height:100%; image-rendering:pixelated;">${rects}</svg>`);
