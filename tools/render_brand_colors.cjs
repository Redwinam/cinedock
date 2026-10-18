// Rebuild the existing brand layouts from original logo/wordmark assets.
// No font substitution: every in-card wordmark comes from source artwork.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const sources = path.join(root, 'artwork/color-sources');
const out = path.join(root, 'app/src/main/res/drawable-nodpi');
const svgOut = path.join(root, 'artwork/brand-layouts');
const ink = '#252A34';
const svg = (body, w, h, view = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view}">${body}</svg>`;
const fit = (a, w, h) => { const s = Math.min(w/a.width,h/a.height); return [a.width*s,a.height*s]; };
const image = (a,x,y,w,h) => `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${a.data}"/>`;

async function asset(file, {crop, color} = {}) {
  let input = typeof file === 'string' ? path.join(sources,file) : file;
  let p = sharp(input);
  if (crop) p = p.extract({left:crop[0],top:crop[1],width:crop[2],height:crop[3]});
  const {data,info} = await p.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rgb = color ? [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)) : null;
  let x0=info.width,y0=info.height,x1=-1,y1=-1;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const i=(y*info.width+x)*4;
    if(rgb) { data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2]; }
    if(data[i+3]>3) { x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y); }
  }
  if(x1<0) throw Error('Empty source asset');
  const width=x1-x0+1,height=y1-y0+1;
  const png=await sharp(data,{raw:info}).extract({left:x0,top:y0,width,height}).png().toBuffer();
  return {width,height,data:png.toString('base64')};
}
async function vector(body, view) {
  const png=await sharp(Buffer.from(svg(body,view[2],view[3],view.join(' ')))).resize({width:1200}).png().toBuffer();
  return asset(png);
}
async function main() {
  await fs.mkdir(svgOut,{recursive:true});
  const tencent=await asset('aurora-icon.png');
  const xl=(await fs.readFile(path.join(sources,'xunlei-brand.svg'),'utf8')).match(/<path\b[\s\S]*?<\/path>/g);
  const five=(await fs.readFile(path.join(sources,'115-cloud.svg'),'utf8')).match(/<path\b[\s\S]*?\/>/g).join('').replace(/fill="[^"]+"/g,'fill="#2777F8"');
  const entries=[
    {key:'newtv_aurora',name:'NewTV 极光',icon:tencent,word:await asset('newtv-word.png',{color:ink})},
    {key:'youku_kumiao',name:'酷喵',icon:await asset('youku-icon.png'),word:await asset('youku-word.png',{color:ink}),wordMaxW:200,wordMaxH:86},
    {key:'qq_music',name:'QQ 音乐',icon:await asset('qqmusic-logo2.png',{crop:[0,0,90,92]}),word:await asset('qqmusic-logo2.png',{crop:[106,0,234,92]})},
    {key:'baidu_netdisk',name:'百度网盘',icon:await asset('baidu-wp-logo.png',{crop:[0,0,125,90]}),word:await asset('baidu-wp-logo.png',{crop:[134,0,290,90]})},
    {key:'xunlei_cloud',name:'迅雷云盘',icon:await vector(xl.slice(0,2).join(''),[0,0,1024,1024]),word:await vector(xl.slice(2).join(''),[1024,0,3672,1024])},
    {key:'aliyun_drive',name:'阿里云盘',icon:await asset('alipan-word.png',{crop:[0,0,115,92]}),word:await asset('alipan-word.png',{crop:[128,0,256,92]})},
    {key:'115_drive',name:'115 网盘',icon:await vector(five,[0,0,36,36]),word:await asset('115-word.png',{color:ink})},
    {key:'tencent_aurora',name:'云视听极光',icon:tencent,word:await asset('aurora-word.png',{color:ink})},
    {key:'netease_popcorn',name:'网易爆米花',icon:await asset('popcorn-icon.png'),word:await asset('popcorn-word.png',{color:ink})}
  ];
  const records=[];
  for(const app of entries) for(const style of 'abcd') {
    const w=style==='d'?512:640,h=style==='d'?512:360;
    let body='<rect width="100%" height="100%" fill="#FFFFFF"/>';
    if(style==='a') {
      const [iw,ih]=fit(app.icon,140,140),[ww,wh]=fit(app.word,app.wordMaxW||280,app.wordMaxH||70),gap=32,left=(640-iw-gap-ww)/2;
      body+=image(app.icon,left,(360-ih)/2,iw,ih)+image(app.word,left+iw+gap,(360-wh)/2,ww,wh);
    } else if(style==='b') {
      const [iw,ih]=fit(app.icon,144,132),[ww,wh]=fit(app.word,app.wordMaxW||280,app.wordMaxH?60:49),gap=29,top=(360-ih-gap-wh)/2;
      body+=image(app.icon,(640-iw)/2,top,iw,ih)+image(app.word,(640-ww)/2,top+ih+gap,ww,wh);
    } else {
      const size=style==='d'?256:192,[iw,ih]=fit(app.icon,size,size);
      body+=image(app.icon,(w-iw)/2,(h-ih)/2,iw,ih);
    }
    const name=`${style}_${app.key}`,source=svg(body,w,h);
    await fs.writeFile(path.join(svgOut,name+'.svg'),source);
    await sharp(Buffer.from(source),{density:288}).resize(w,h,{kernel:'lanczos3'}).removeAlpha().toColourspace('srgb').png({compressionLevel:9}).toFile(path.join(out,name+'.png'));
    records.push({key:app.key,name:app.name,style,background:'#FFFFFF',file:name+'.png'});
  }
  await fs.writeFile(path.join(root,'artwork/brand-colors.json'),JSON.stringify({version:'1.1.0',policy:'Preserve familiar original brand colors and wordmarks; use white cards for the listed apps. Other entries stay unchanged.',records},null,2)+'\n');
  console.log(`Updated ${entries.length} apps / ${records.length} PNGs; preserved existing resource names and layouts.`);
}
main().catch(e=>{console.error(e);process.exit(1)});
