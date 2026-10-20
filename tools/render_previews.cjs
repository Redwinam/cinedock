// Contact sheets use the actual packaged images, preserving card aspect ratios.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const styles = [
  {prefix:'a', file:'preview.png', title:'A · 横向带字', width:400, height:225},
  {prefix:'b', file:'preview-stacked.png', title:'B · 上下带字', width:400, height:225},
  {prefix:'c', file:'preview-icon-only.png', title:'C · 横版纯图标', width:400, height:225},
  {prefix:'d', file:'preview-square.png', title:'D · 方版纯图标', width:320, height:320},
  {prefix:'e', file:'preview-glow.png', title:'E · 横向带字 · 光晕', width:400, height:225},
  {prefix:'f', file:'preview-glow-stacked.png', title:'F · 上下带字 · 光晕', width:400, height:225},
  {prefix:'g', file:'preview-mark.png', title:'G · 横向带字 · 光晕印记', width:400, height:225},
  {prefix:'h', file:'preview-mark-stacked.png', title:'H · 上下带字 · 光晕印记', width:400, height:225},
];

async function main() {
  const entries = JSON.parse(await fs.readFile(path.join(root, 'artwork/catalog.json'), 'utf8'));
  const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  await fs.mkdir(output, {recursive:true});
  for (const style of styles) {
    const columns=4, cellWidth=320, gap=24, margin=24, top=112;
    const cardWidth=style.prefix==='d'?256:320;
    const cardHeight=Math.round(cardWidth*style.height/style.width);
    const rowHeight=cardHeight+48;
    const width=margin*2+columns*cellWidth+(columns-1)*gap;
    const height=top+Math.ceil(entries.length/columns)*rowHeight+margin;
    let body='<rect width="100%" height="100%" fill="#101722"/>';
    body+='<g font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif">';
    body+=`<text x="24" y="44" font-size="28" font-weight="600" fill="#F4F7FC">映匣 ${escape(version)} · ${style.title}</text>`;
    body+=`<text x="24" y="78" font-size="16" fill="#B4C2D4">${entries.length} 个入口 · ${style.width} × ${style.height} PNG · 保留原品牌配色与字标</text>`;
    for (let i=0;i<entries.length;i++) {
      const entry=entries[i];
      const x=margin+(i%columns)*(cellWidth+gap);
      const y=top+Math.floor(i/columns)*rowHeight;
      const resource=path.resolve(root,entry.resources[style.prefix]);
      const image=await fs.readFile(resource);
      const metadata=await sharp(image).metadata();
      if(metadata.width!==style.width||metadata.height!==style.height) throw Error('Unexpected icon dimensions: '+entry.key);
      body+=`<image x="${x+(cellWidth-cardWidth)/2}" y="${y}" width="${cardWidth}" height="${cardHeight}" href="data:image/png;base64,${image.toString('base64')}"/>`;
      body+=`<text x="${x+cellWidth/2}" y="${y+cardHeight+29}" text-anchor="middle" font-size="16" fill="#DEE6F1">${escape(entry.name)}</text>`;
    }
    body+='</g>';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
    await sharp(Buffer.from(svg)).removeAlpha().png({compressionLevel:9}).toFile(path.join(output,style.file));
    console.log(`${style.file}: ${entries.length} icons, ${width}×${height}`);
  }
}
main().catch(error=>{console.error(error);process.exit(1)});
