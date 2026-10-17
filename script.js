const qs=(s,p=document)=>p.querySelector(s), qsa=(s,p=document)=>[...p.querySelectorAll(s)];

// Mobile navigation
const menu=qs('.menu-toggle');
menu.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menu.setAttribute('aria-expanded',open);menu.setAttribute('aria-label',open?'Close menu':'Open menu')});
qsa('.nav-panel a').forEach(a=>a.addEventListener('click',()=>{document.body.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu')}));
addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('menu-open')){document.body.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu');menu.focus()}});
addEventListener('resize',()=>{if(innerWidth>760&&document.body.classList.contains('menu-open')){document.body.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu')}});

// Gentle on-scroll reveals
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.12});
qsa('.reveal').forEach(el=>observer.observe(el));

// Variant studio
const variants={
  color:{title:'Find their perfect shade.',copy:'Turn one source image into a complete colorway, keeping light, texture, and branding perfectly consistent.'},
  size:{title:'Show every size, instantly.',copy:'Build a consistent range from travel size to family pack without repeating the entire production process.'},
  shape:{title:'Explore every form.',copy:'Test packaging and product silhouettes while preserving brand details, material, and studio-quality lighting.'}
};
const palette=['#efe4dd','#e7ddcd','#e0e4dc','#dae4e7','#dfe0ea','#e8dee7'];
function renderVariants(type='color'){
  const data=variants[type];qs('#variant-title').textContent=data.title;qs('#variant-copy').textContent=data.copy;
  qs('#variant-gallery').innerHTML=Array.from({length:11},(_,i)=>`<figure class="variant-item variant-${type}" data-label="${type.toUpperCase()} ${String(i+1).padStart(2,'0')}" style="--bg:${palette[i%palette.length]};--scale:${type==='size'?(.68+i*.035):1};--shape:${type==='shape'?(i%3===0?'50%':i%3===1?'4px':'18px'):'7px'};animation-delay:${i*25}ms"><img src="images/variants/color-${String(i+1).padStart(2,'0')}.png" alt="Product bottle ${type} variant ${i+1}" loading="lazy"></figure>`).join('');
}
renderVariants();
qsa('.variant-tabs button').forEach(btn=>btn.addEventListener('click',()=>{qsa('.variant-tabs button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false')});btn.classList.add('active');btn.setAttribute('aria-selected','true');renderVariants(btn.dataset.variant)}));

// Pricing billing toggle
qsa('.billing-toggle button').forEach(btn=>btn.addEventListener('click',()=>{
  qsa('.billing-toggle button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});
  btn.classList.add('active');btn.setAttribute('aria-pressed','true');
  const note=qs('.billing-note');
  if(note) note.textContent=btn.dataset.billing==='yearly'?'Two months free with yearly billing':'Flexible monthly billing';
}));

// Testimonial carousel
let slide=0;const track=qs('#testimonial-track');
function visibleTestimonials(){return innerWidth<=760?1:innerWidth<=1000?2:3}
function updateTestimonials(){
  const cards=[...track.children],maxStart=Math.max(0,cards.length-visibleTestimonials());
  slide=(slide+cards.length)%cards.length;
  const start=Math.min(slide,maxStart),gap=18;
  track.style.transform=`translateX(-${start*(cards[0].getBoundingClientRect().width+gap)}px)`;
  cards.forEach((card,i)=>card.classList.toggle('is-active',i===slide));
  qsa('.avatar-dots button').forEach((b,i)=>{b.classList.toggle('active',i===slide);b.setAttribute('aria-pressed',i===slide?'true':'false')});
}
qs('#test-next').addEventListener('click',()=>{slide+=1;updateTestimonials()});
qs('#test-prev').addEventListener('click',()=>{slide-=1;updateTestimonials()});
qsa('.avatar-dots button').forEach(b=>b.addEventListener('click',()=>{slide=+b.dataset.slide;updateTestimonials()}));
addEventListener('resize',updateTestimonials);
updateTestimonials();

// Product tour demo state
qs('.play-button').addEventListener('click',()=>{const frame=qs('#video-frame');frame.classList.add('playing');setTimeout(()=>frame.classList.remove('playing'),2400)});

// User-created gallery is data-driven so future real assets are easy to swap in.
const galleryData=[
 ['MORNING\nMADE BETTER','#e6c8a5','#40352b'],['DEEP\nHYDRATION','#b8d6d0','#fafafa'],['CALM IN\nEVERY DROP','#d9c9df','#694f7b'],['BUILT TO\nGO FURTHER','#c7d1da','#253b54'],['CLEANER.\nBRIGHTER.','#ddd285','#f9f9f2'],
 ['FEEL THE\nDIFFERENCE','#dda7a0','#9a3f48'],['PLANT-BASED\nPOWER','#baceaa','#4f6f3a'],['SLEEP\nDEEPER','#9ca3c8','#ece9e0'],['SMALL TOOL.\nBIG RESULTS.','#d8c4a8','#363331'],['FUEL YOUR\nFOCUS','#e3b16d','#f6eee0'],
 ['PURE FROM\nTHE SOURCE','#b9dce3','#f8fbfc'],['GLOW ON\nYOUR TERMS','#e8bbb1','#6e463d'],['THE DAILY\nESSENTIAL','#d0d0ca','#33363a'],['SOFTNESS\nTHAT LASTS','#e3ced4','#faf7f2'],['READY FOR\nANYTHING','#bcc8b6','#455b49'],
 ['BRIGHTER\nMORNINGS','#ead780','#fff'],['STRONG BY\nNATURE','#c6ab8b','#5d4432'],['A BETTER\nBASIC','#c6d5e8','#48647e'],['RESET YOUR\nROUTINE','#d0bfd8','#fff'],['MADE FOR\nMOMENTUM','#d9b5a4','#9b4f40']
];
qs('#user-gallery').innerHTML=galleryData.map(([h,bg],i)=>`<figure class="gallery-product" style="--bg:${bg}"><img src="images/user-gallery/user-${String(i+1).padStart(2,'0')}.png" alt="User-created Amazon listing example ${i+1}" loading="lazy"><figcaption>${h.replace('\n','<br>')}</figcaption></figure>`).join('');

// Keep the FAQ concise by opening one answer at a time.
qsa('.faq-list details').forEach(item=>item.addEventListener('toggle',()=>{
  if(item.open) qsa('.faq-list details').forEach(other=>{if(other!==item) other.open=false});
}));

// Header shadow only after leaving the top.
addEventListener('scroll',()=>qs('.site-header').classList.toggle('scrolled',scrollY>30),{passive:true});
