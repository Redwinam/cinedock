// Rebuild all 76 cards from the original marks and wordmarks in artwork/.
// No font substitution: every in-card wordmark comes from source artwork.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const sources = path.join(root, 'artwork/color-sources');
const hdmiSources = path.join(root, 'artwork/hdmi-sources');
const out = path.join(root, 'app/src/main/res/drawable-nodpi');
const svgOut = path.join(root, 'artwork/brand-layouts');
const version = require(path.join(root, 'package.json')).version;
const ink = '#252A34', white = '#FFFFFF';
const svg = (body, w, h, view = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view}">${body}</svg>`;
const fit = (a, w, h) => { const s = Math.min(w/a.width,h/a.height); return [a.width*s,a.height*s]; };
const image = (a,[x,y,w,h]) => `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${a.data}"/>`;
// Layouts are drawn in 640×360 / 512×512 units; PNGs are exported at 400×225 / 320×320, close to
// Projectivy's M and S cards. Shrinking a card by 2× or more makes the launcher sample every other
// pixel, which turns long shallow edges (the PlayStation symbol most of all) into stair steps.
const size = style => style==='d' ? [512,512] : [640,360];
const output = style => style==='d' ? [320,320] : [400,225];

// a = mark left / wordmark right, each fitted to its box on the card's midline.
//     Compact wordmarks (two characters or a short Latin word) get a taller box.
// b = mark above / wordmark below in two fixed-height rows, so every card stacks alike.
// c, d = the mark alone, centred.
// scale.<style>.icon / .word resize an entry's element against these boxes. In b it also evens out
//     scripts: lowercase Latin with ascenders and descenders reads small, bold capitals read large
//     next to Chinese glyphs of the same height.
// Text cards are also nudged toward visual balance (see balance()).
// tweak: hand adjustments in px per style, applied after balancing — icon / word move one element
//     down, wordX moves the wordmark right, group moves both down, x moves both right (negative
//     values go up / left).
const layout = {
  a: {icon:[140,140], word:[340,84], compact:[240,104], gap:30},
  b: {icon:140, iconMaxWidth:176, word:58, wordMaxWidth:420, gap:30},
};

// Resource names carry the version that last changed the image (a_iqiyi_tv_v1_2_0), so launchers
// that cache artwork by resource name show the new picture once it is picked again.
const revision = 'v' + version.replaceAll('.', '_');
const references = ['app/src/main/res/xml/catalog.xml','app/src/main/res/xml/drawable.xml','app/src/main/res/xml/appfilter.xml',
  'app/src/main/assets/drawable.xml','app/src/main/assets/appfilter.xml','app/src/main/res/values/icon_pack.xml','artwork/catalog.json'];

// Ink bounds plus the vertical centroid (cy, 0–1 within the bounds) used for optical centring.
function measure(data, info, threshold) {
  let x0=info.width,y0=info.height,x1=-1,y1=-1,mass=0,sum=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const a=data[(y*info.width+x)*4+3];
    if(a>threshold) { x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y); }
    mass+=a; sum+=a*y;
  }
  if(x1<0) throw Error('Empty source asset');
  return {x0,y0,width:x1-x0+1,height:y1-y0+1,cy:(sum/mass-y0+0.5)/(y1-y0+1)};
}
// Optical centring: pixels to lift an element so its ink centroid, not its box, sits on the slot's centre.
const lift = (a, h) => Math.round((a.cy-0.5)*h);

async function asset(file, {crop, color, crisp} = {}) {
  let input = typeof file === 'string' ? path.join(sources,file) : file;
  let p = sharp(input);
  if (crop) p = p.extract({left:crop[0],top:crop[1],width:crop[2],height:crop[3]});
  const {data,info} = await p.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if (color) {
    const rgb = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
    for(let i=0;i<data.length;i+=4) data.set(rgb,i);
  }
  const {x0,y0,width,height,cy} = measure(data,info,3);
  const png=await sharp(data,{raw:info}).extract({left:x0,top:y0,width,height}).png().toBuffer();
  return crisp ? sharpen(png,crisp,color) : {width,height,cy,data:png.toString('base64')};
}
// Small single-colour wordmarks: upsample the coverage mask and tighten its soft edge,
// so the enlarged glyphs stay crisp without redrawing them.
async function sharpen(png, scale, color) {
  const {width,height}=await sharp(png).metadata();
  const {data,info}=await sharp(png).extractChannel(3).resize(width*scale,height*scale,{kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
  const pixels=Buffer.alloc(info.width*info.height*4);
  for(let i=0;i<info.width*info.height;i++) {
    const t=Math.max(0,Math.min(1,(data[i]/255-0.3)/0.4));
    pixels[i*4+3]=Math.round(t*t*(3-2*t)*255);
  }
  return asset(await sharp(pixels,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(),{color});
}
async function vector(body, view) {
  const png=await sharp(Buffer.from(svg(body,view[2],view[3],view.join(' ')))).resize({width:1200}).png().toBuffer();
  return asset(png);
}

// HDMI artwork stays vector: white geometry placed into tight viewBoxes.
const white_g = body => `<g fill="${white}">${body}</g>`;
async function tight(component) {
  const v=component.view;
  const {data,info}=await sharp(Buffer.from(svg(white_g(component.body),v[2],v[3],v.join(' '))),{density:288}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const ink=measure(data,info,0),{x0,y0,width,height,cy}=ink;
  const sx=v[2]/info.width,sy=v[3]/info.height,view=[v[0]+x0*sx,v[1]+y0*sy,width*sx,height*sy];
  return {...component,view,width:view[2],height:view[3],cy,core:trademark(data,info,ink)};
}
// A trailing ™ or ® (short pieces set apart by gaps; ™ is two, T and M) hangs outside the wordmark:
// centring uses only the core, the fraction of the width before the mark.
function trademark(data, {width:w,height:h}, {x0,width,height}) {
  const column=x=>{ let top=-1,bottom=-1; for(let y=0;y<h;y++) if(data[(y*w+x)*4+3]>0) { if(top<0) top=y; bottom=y; } return [top,bottom]; };
  let x=x0+width-1,core=1;
  while(x>=x0) {
    let top=h,bottom=-1;
    for(;x>=x0;x--) { const [t,b]=column(x); if(t<0) break; top=Math.min(top,t); bottom=Math.max(bottom,b); }
    // Stop at the first full-height piece, or if the "mark" grows too wide to be one.
    if(x<x0||bottom-top+1>=0.35*height||x0+width-1-x>=0.1*width) break;
    while(x>=x0&&column(x)[0]<0) x--;
    core=(x-x0+1)/width;
  }
  return core;
}
const place = (c,[x,y,w,h]) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${c.view.join(' ')}" overflow="hidden">${white_g(c.body)}</svg>`;
// Keep's own badge from its official lockup: the K knocked out of a white rounded square
// (corner radius 16% of the side, K 55% of its height), so the mark no longer echoes the "k" of keep.
async function keepBadge(knockout) {
  const glyph=(await fs.readFile(path.join(sources,'keep-k.svg'),'utf8')).match(/<path\b[^>]*\/>/)[0].replace(/ fill="[^"]*"/,'');
  const k=await tight({view:[-100,-100,1400,1400],body:glyph}),kh=550,kw=kh*k.width/k.height;
  return vector(`<rect width="1000" height="1000" rx="160" fill="${white}"/><svg x="${(1000-kw)/2}" y="${(1000-kh)/2}" width="${kw}" height="${kh}" viewBox="${k.view.join(' ')}"><g fill="${knockout}">${k.body}</g></svg>`,[0,0,1000,1000]);
}
const simpleIcon = async slug => (await fs.readFile(path.join(hdmiSources,slug+'.svg'),'utf8')).match(/<path\b[^>]*\/>/g).join('');

function background(fill) {
  if (typeof fill === 'string') return `<rect width="100%" height="100%" fill="${fill}"/>`;
  // Radial brand gradient from the top-left corner; r reaches the far corner, so the
  // square launcher icon's colour field stretches over the whole card.
  const stops=fill.map(([offset,color])=>`<stop offset="${offset}" stop-color="${color}"/>`).join('');
  return `<defs><radialGradient id="bg" cx="0" cy="0" r="1.4142">${stops}</radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/>`;
}
const css = fill => typeof fill === 'string' ? fill : `radial-gradient(at top left, ${fill.map(([o,c])=>`${c} ${Math.round(o*100)}%`).join(', ')})`;
// Sampled from the current 奇异果TV launcher icon: bright green, then teal and blue, purple in the far corner.
const kiwiGradient=[[0,'#32EC82'],[0.12,'#2CEA7E'],[0.29,'#18E46C'],[0.42,'#05D862'],[0.55,'#07C970'],[0.62,'#14B686'],
  [0.69,'#2FA29B'],[0.75,'#4C88B9'],[0.8,'#7374CF'],[0.875,'#A25CE5'],[0.92,'#C64AE7'],[1,'#D343E6']];

// Boxes [x, y, w, h] for a mark and its wordmark; a trailing ™ / ® is left out of the centring.
const core = a => a.core ?? 1;
function sideBySide([w,h], icon, [iw,ih], word, [ww,wh], gap) {
  const left=(w-iw-gap-ww*core(word))/2;
  return [[left,(h-ih)/2-lift(icon,ih),iw,ih],[left+iw+gap,(h-wh)/2-lift(word,wh),ww,wh]];
}
function stacked([w,h], icon, word, wordScale=1, iconScale=1) {
  const l=layout.b,[iw,ih]=fit(icon,l.iconMaxWidth*iconScale,l.icon*iconScale),[ww,wh]=fit(word,l.wordMaxWidth,l.word*wordScale),top=(h-l.icon-l.gap-l.word)/2;
  return [[(w-iw)/2,top+(l.icon-ih)/2-lift(icon,ih),iw,ih],[(w-ww*core(word))/2,top+l.icon+l.gap+(l.word-wh)/2-lift(word,wh),ww,wh]];
}
const centred = ([w,h], a, [aw,ah]) => [(w-aw*core(a))/2,(h-ah)/2-lift(a,ah),aw,ah];
const move = ([x,y,w,h], [dx,dy]) => [x+dx,y+dy,w,h];

function appCard(app, style, [dx,dy]=[0,0], tweak={}) {
  const card=size(style),body=background(app.background),x=dx+(tweak.x??0);
  const {icon:si=1,word:sw=1}=app.scale?.[style]??{};
  const pair=([icon,word])=>body+image(app.icon,move(icon,[x,dy+(tweak.icon??0)]))+image(app.word,move(word,[x+(tweak.wordX??0),dy+(tweak.word??0)]));
  if(style==='a') {
    const l=layout.a,[bw,bh]=app.compact?l.compact:l.word;
    return pair(sideBySide(card,app.icon,fit(app.icon,l.icon[0]*si,l.icon[1]*si),app.word,fit(app.word,bw*sw,bh*sw),app.gap??l.gap));
  }
  if(style==='b') return pair(stacked(card,app.icon,app.word,sw,si));
  const box=(style==='d'?256:192)*si;
  return body+image(app.icon,centred(card,app.icon,fit(app.icon,box,box)));
}

async function hdmiCard(device, style, words, [dx,dy]=[0,0], tweak={}) {
  const card=size(style),[w,h]=card,geometry=await simpleIcon(device.slug);
  const body=background(device.background);
  if(style==='c'||style==='d') {
    // Simple Icons 24×24 grid, scaled as a whole so each mark keeps its padding.
    const s=device.iconSize*h/360;
    return body+`<g fill="${white}" transform="translate(${(w-s)/2} ${(h-s)/2}) scale(${s/24})">${geometry}</g>`;
  }
  // Side by side, PS5 and Steam use the symbol from their official lockups; elsewhere the Simple Icons mark.
  const icon=await tight(style==='a'&&device.mark?words[device.mark]:{view:[0,0,24,24],body:geometry}),word=await tight(words[device.word]);
  const x=dx+(tweak.x??0),pair=([iconBox,wordBox])=>body+place(icon,move(iconBox,[x,dy+(tweak.icon??0)]))+place(word,move(wordBox,[x+(tweak.wordX??0),dy+(tweak.word??0)]));
  // Marks with a firm outline (the Xbox and Steam circles, the PlayStation symbol) are judged by that
  // outline; their cut-outs and wide base would otherwise pull the ink centroid down and lift them.
  if(device.outline) icon.cy=0.5;
  if(style==='b') return pair(stacked(card,icon,word,device.scale?.b?.word,device.scale?.b?.icon));
  // PS5 and Steam keep their lockups' symbol size and spacing with a resized wordmark; the round Xbox
  // mark and its slanted X read tighter than the box gap, so Xbox gets a little more air.
  const ih=device.iconHeight,ww=device.wordWidth;
  return pair(sideBySide(card,icon,[ih*icon.width/icon.height,ih],word,[ww,ww*word.height/word.width],device.gap??32));
}

// Visual balance of a text card. Each pixel weighs its lightness contrast (CIE L*) with the bare
// background, so black type on white outweighs a pale coloured mark. A horizontal card that leans
// right moves left by 30% of the lean (at most 14 px); a stacked card that sinks rises by half of it
// (at most 10 px). Cards leaning the other way stay put, keeping rows aligned across cards.
const lightness = (d,i) => { const c=[0,1,2].map(k=>{ const v=d[i+k]/255; return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4; });
  return 116*Math.cbrt(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])-16; };
async function balance(style, fill, body) {
  if(style!=='a'&&style!=='b') return [0,0];
  const [w,h]=size(style);
  const [card,ground]=await Promise.all([body,background(fill)].map(b=>sharp(Buffer.from(svg(b,w,h))).removeAlpha().raw().toBuffer()));
  let mass=0,sx=0,sy=0;
  for(let i=0;i<w*h;i++) {
    const m=Math.abs(lightness(card,i*3)-lightness(ground,i*3))/100;
    if(m>0.05) { mass+=m; sx+=m*(i%w); sy+=m*Math.floor(i/w); }
  }
  return style==='a' ? [-Math.min(14,Math.round(Math.max(0,sx/mass-w/2)*0.3)),0] : [0,-Math.min(10,Math.round(Math.max(0,sy/mass-h/2)/2))];
}

async function rasterize(source, [w,h]) {
  return sharp(Buffer.from(source),{density:288}).resize(w,h,{kernel:'lanczos3'}).removeAlpha().toColourspace('srgb').png({compressionLevel:9}).toBuffer();
}
async function samePixels(file, png) {
  try {
    const [before,after]=await Promise.all([sharp(file).raw().toBuffer(),sharp(png).raw().toBuffer()]);
    return before.equals(after);
  } catch { return false; }
}

async function main() {
  await fs.mkdir(svgOut,{recursive:true});
  const tencent=await asset('aurora-icon.png');
  const xl=(await fs.readFile(path.join(sources,'xunlei-brand.svg'),'utf8')).match(/<path\b[\s\S]*?<\/path>/g);
  const five=(await fs.readFile(path.join(sources,'115-cloud.svg'),'utf8')).match(/<path\b[\s\S]*?\/>/g).join('').replace(/fill="[^"]+"/g,'fill="#2777F8"');
  const keepPurple='#62536E',aurora={a:{icon:0.88,word:1.2}};
  // 云视听小电视, 银河奇异果 and both aurora cards share one mark size side by side (0.88 of the box; the
  // wide 小电视 mark gets 0.94 so it reads as tall as the others);
  // the aurora marks point right, so their long wordmarks can sit a little closer (gap, side by side only).
  const apps=[
    {key:'bilibili_tv',background:'#E85C89',icon:await asset('bili-icon.png'),word:await asset('bili-word.png'),scale:{a:{icon:0.94,word:1.16},b:{word:0.92}},tweak:{b:{icon:4}}},
    {key:'iqiyi_tv',background:kiwiGradient,icon:await asset('iqiyi-icon.png'),word:await asset('iqiyi-word.png',{color:white,crisp:4}),scale:{a:{icon:0.88,word:1.08}},tweak:{b:{icon:4}}},
    // Both aurora wordmarks are a light weight that reads faint on TV: larger side by side, with the mark
    // yielding room. Stacked cards keep the standard rows.
    {key:'newtv_aurora',background:white,icon:tencent,word:await asset('newtv-word.png',{color:ink,crisp:3}),scale:aurora,gap:26},
    {key:'youku_kumiao',background:white,icon:await asset('youku-icon.png'),word:await asset('youku-word.png',{color:ink}),compact:true,scale:{b:{word:1.1}},tweak:{a:{x:-8}}},
    // The solid badge outweighs the old outline K, so it sits smaller than the box. Side by side the
    // badge centres on the x-height of "keep" (not its ascender-to-descender box) on the card's midline,
    // with the word then set a little lower by eye.
    {key:'keep',background:keepPurple,icon:await keepBadge(keepPurple),word:await asset('keep-word.png',{color:white,crisp:3}),compact:true,
     scale:{a:{icon:0.88,word:1.06},b:{icon:0.96,word:1.35},c:{icon:0.9},d:{icon:0.9}},tweak:{a:{word:7,x:-6}}},
    {key:'lebo_cast',background:'#0878E8',icon:await asset('lebo-icon.png'),word:await asset('lebo-word.png',{color:white,crisp:3})},
    {key:'netease_music',background:'#DF2638',icon:await asset('netease-icon.png'),word:await asset('netease-word.png'),scale:{b:{word:0.9}},tweak:{b:{word:-4}}},
    {key:'qq_music',background:white,icon:await asset('qqmusic-logo2.png',{crop:[0,0,90,92]}),word:await asset('qqmusic-logo2.png',{crop:[106,0,234,92]})},
    {key:'baidu_netdisk',background:white,icon:await asset('baidu-wp-logo.png',{crop:[0,0,125,90]}),word:await asset('baidu-wp-logo.png',{crop:[134,0,290,90]}),tweak:{b:{icon:6}}},
    {key:'xunlei_cloud',background:white,icon:await vector(xl.slice(0,2).join(''),[0,0,1024,1024]),word:await vector(xl.slice(2).join(''),[1024,0,3672,1024])},
    {key:'aliyun_drive',background:white,icon:await asset('alipan-word.png',{crop:[0,0,115,92]}),word:await asset('alipan-word.png',{crop:[128,0,256,92]})},
    {key:'115_drive',background:white,icon:await vector(five,[0,0,36,36]),word:await asset('115-word.png',{color:ink})},
    {key:'tencent_aurora',background:white,icon:tencent,word:await asset('aurora-word.png',{color:ink}),scale:aurora,gap:26},
    {key:'netease_popcorn',background:white,icon:await asset('popcorn-icon.png'),word:await asset('popcorn-word.png',{color:ink,crisp:3}),scale:{a:{icon:0.8,word:1.18}},tweak:{b:{group:5,icon:4}}},
    {key:'mango_tv',background:'#FF5F00',icon:await asset('mango-icon.png'),word:await asset('mango-word.png'),tweak:{b:{group:-5}}},
  ];
  const words=JSON.parse(await fs.readFile(path.join(hdmiSources,'wordmarks.json'),'utf8'));
  const devices=[
    {key:'ps5',slug:'playstation',outline:true,background:'#003791',iconSize:224,word:'ps5_word',scale:{b:{word:0.8}},mark:'ps5_mark',iconHeight:104,wordWidth:280,gap:35,tweak:{a:{x:-9},b:{word:-4,wordX:6}}},
    {key:'nintendo_switch',slug:'nintendoswitch',background:'#E60012',iconSize:172,word:'switch_word',iconHeight:120,wordWidth:290,tweak:{a:{word:5}}},
    {key:'xbox',slug:'xbox',outline:true,background:'#107C10',iconSize:176,word:'xbox_word',scale:{b:{word:1,icon:1.07}},iconHeight:120,wordWidth:252,gap:36,tweak:{a:{x:-5}}},
    {key:'gaming_pc_steam',slug:'steam',outline:true,background:'#171A21',iconSize:176,word:'steam_word',scale:{b:{word:0.86}},mark:'steam_mark',iconHeight:136,wordWidth:312,gap:36,tweak:{a:{x:-12}}},
  ];
  const drawables=await fs.readdir(out),renames=new Map(),records=[],balanced=[];
  let changed=0;
  for(const entry of [...apps,...devices]) for(const style of 'abcd') {
    const card=`${style}_${entry.key}`,tweak=entry.tweak?.[style]??{};
    const draw=(shift,t)=>entry.slug?hdmiCard(entry,style,words,shift,t):appCard(entry,style,shift,t);
    // Balance is measured on the untweaked layout, so hand adjustments land exactly as written.
    let body=await draw([0,0],{});
    const [dx,dy]=await balance(style,entry.background,body),shift=[dx,dy+(tweak.group??0)];
    if(dx||dy) balanced.push(`${card} ${dx?`←${-dx}`:`↑${-dy}`}`);
    if(shift[0]||shift[1]||Object.keys(tweak).length) body=await draw(shift,tweak);
    const source=svg(body,...size(style));
    await fs.writeFile(path.join(svgOut,card+'.svg'),source);
    const current=drawables.filter(f=>new RegExp(`^${card}(_v\\d+_\\d+_\\d+)?\\.png$`).test(f));
    if(current.length>1) throw Error(`Expected one PNG for ${card}, found ${current.join(', ')}`);
    // A new entry starts under its plain name; nothing can have cached it yet.
    let name=current[0]?.slice(0,-4)??card;
    const png=await rasterize(source,output(style));
    if(!await samePixels(path.join(out,name+'.png'),png)) {
      const next=`${card}_${revision}`;
      await fs.writeFile(path.join(out,next+'.png'),png);
      if(next!==name) { await fs.unlink(path.join(out,name+'.png')); renames.set(name,next); name=next; }
      changed++;
    }
    records.push({key:entry.key,style,background:css(entry.background),file:name+'.png'});
  }
  // Point every catalog, icon-pack list and appfilter entry at the renamed images.
  for(const file of references) {
    const text=await fs.readFile(path.join(root,file),'utf8');
    await fs.writeFile(path.join(root,file),text.replace(/(?<![a-z0-9_])[abcd]_[a-z0-9_]+(?=\.png|"|<)/g,m=>renames.get(m)??m));
  }
  await fs.writeFile(path.join(root,'artwork/brand-colors.json'),JSON.stringify({version,policy:'Preserve familiar original brand colors and wordmarks. Every card is rendered from artwork/ by tools/render_cards.cjs.',records},null,2)+'\n');
  console.log(`Rendered ${records.length} cards; ${changed} PNGs changed, ${renames.size} renamed to ${revision}.`);
  console.log(`Balanced: ${balanced.join(', ')}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
