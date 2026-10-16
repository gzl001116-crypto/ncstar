function fanstarSeriesLink(creatorId,seriesId) {
  return '/c/'+encodeURIComponent(creatorId)+'?tab=series&series='+encodeURIComponent(seriesId);
}
function fanstarSeriesGroups(products,creatorId) {
  const groups=new Map();
  for(const product of products) {
    if(product.creatorId!==creatorId||!product.listed||!product.seriesId)continue;
    if(!groups.has(product.seriesId))groups.set(product.seriesId,{id:product.seriesId,title:product.seriesTitle,description:product.seriesDescription,products:[]});
    groups.get(product.seriesId).products.push(product);
  }
  for(const group of groups.values())group.products.sort((a,b)=>a.seriesOrder-b.seriesOrder||a.id.localeCompare(b.id));
  return [...groups.values()];
}
function FanstarSeriesField({value,onChange,disabled}) {
  const {user,products}=he(),[data,setData]=v.useState(null),[error,setError]=v.useState(''),[revision,setRevision]=v.useState(0);
  v.useEffect(()=>{let active=true;setData(null);setError('');Fe('/api/work-series').then(result=>{if(active)setData(result.series);}).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[user?.id,revision]);
  const selected=(data||[]).find(item=>item.id===value.seriesId);
  const mode=value.seriesTitle!==undefined&&value.seriesId==='__new'?'__new':value.seriesId||'';
  const changeMode=id=>{onChange('seriesId',id);onChange('seriesTitle','');onChange('seriesDescription','');onChange('seriesOrder','');};
  return n.jsxs('fieldset',{className:'fs-series-field',disabled,children:[
    n.jsx('legend',{children:'作品系列'}),
    n.jsxs('label',{children:['发布方式',n.jsxs('select',{'aria-label':'作品系列',value:mode,onChange:event=>changeMode(event.target.value),children:[
      n.jsx('option',{value:'',children:'独立作品'}),n.jsx('option',{value:'__new',children:'＋ 新建系列'}),
      !(data||[]).some(item=>item.id===value.seriesId)&&value.seriesId&&value.seriesId!=='__new'&&n.jsx('option',{value:value.seriesId,children:products.find(item=>item.seriesId===value.seriesId)?.seriesTitle||'当前系列'}),
      (data||[]).map(item=>n.jsx('option',{value:item.id,children:item.title+' · '+item.works+' 部作品'},item.id)),
    ]})]}),
    mode==='__new'&&n.jsxs(n.Fragment,{children:[
      n.jsxs('label',{children:['系列名称',n.jsx('input',{'aria-label':'系列名称',maxLength:80,required:true,value:value.seriesTitle||'',onChange:event=>onChange('seriesTitle',event.target.value),placeholder:'例如：城市旅行手记'})]}),
      n.jsxs('label',{children:['系列介绍（可选）',n.jsx('textarea',{rows:3,maxLength:2000,value:value.seriesDescription||'',onChange:event=>onChange('seriesDescription',event.target.value)})]}),
    ]}),
    mode&&n.jsxs('label',{children:['本作品在系列中的顺序',n.jsx('input',{'aria-label':'系列顺序',type:'number',min:1,max:1000000,step:1,value:value.seriesOrder??'',onChange:event=>onChange('seriesOrder',event.target.value),placeholder:'自动接续'+(selected?'（下一部：'+selected.nextOrder+'）':'（从第 1 部开始）')})]}),
    n.jsx('p',{className:'fineprint',children:mode?'作品按编号排序；留空将自动接续。每部作品单独定价与购买，可随时在编辑中更换系列。':'选择系列后可将多部作品按顺序组织在一起。'}),
    error&&n.jsxs('p',{className:'error',role:'alert',children:[error,' ',n.jsx('button',{type:'button',className:'tw-text-button',onClick:()=>setRevision(old=>old+1),children:'重新加载系列'})]}),
  ]});
}
function fanstarSeriesForm(form,value) {
  form.set('seriesCreate',value.seriesId==='__new'?'1':'0');
  form.set('seriesId',value.seriesId==='__new'?'':value.seriesId||'');
  form.set('seriesTitle',value.seriesId==='__new'?value.seriesTitle||'':'');
  form.set('seriesDescription',value.seriesId==='__new'?value.seriesDescription||'':'');
  form.set('seriesOrder',value.seriesOrder??'');
}
function FanstarSeriesBadge({product}) {
  if(!product.seriesId)return null;
  return n.jsx(q,{className:'fs-series-badge',to:fanstarSeriesLink(product.creatorId,product.seriesId),children:product.seriesTitle+' · 第 '+product.seriesOrder+' 部'});
}
function FanstarSeriesShelf({creator}) {
  const {products}=he(),[params,setParams]=vn(),groups=fanstarSeriesGroups(products,creator.id),selectedId=params.get('series'),selected=groups.find(group=>group.id===selectedId);
  return n.jsxs('section',{className:'fs-series-shelf',children:[
    n.jsxs('header',{className:'fs-series-heading',children:[n.jsxs('div',{children:[n.jsx('p',{className:'kicker',children:'作品系列'}),n.jsx('h2',{children:selected?selected.title:'按系列发现作品'}),n.jsx('p',{className:'muted',children:selected?selected.description||'按顺序浏览这个系列的作品。':'将连续创作收藏在一起。'})]}),selectedId&&n.jsx('button',{type:'button',className:'btn btn-line',onClick:()=>{const next=new URLSearchParams(params);next.delete('series');setParams(next);},children:'全部系列'})]}),
    selectedId&&!selected?n.jsx('div',{className:'empty',children:'该系列暂无公开作品。'}):selected?n.jsxs(n.Fragment,{children:[n.jsx('p',{className:'fineprint',children:selected.products.length+' 部公开作品 · 每部作品单独购买'}),n.jsx('div',{className:'cards',children:selected.products.map(product=>n.jsx(Yf,{product},product.id))})]}):groups.length?n.jsx('div',{className:'fs-series-grid',children:groups.map(group=>n.jsxs(q,{className:'fs-series-card',to:fanstarSeriesLink(creator.id,group.id),children:[n.jsx(Et,{id:group.products[0].coverKey,src:On(group.products[0]),ratio:'16 / 9'}),n.jsxs('div',{children:[n.jsx('span',{className:'pill',children:group.products.length+' 部作品'}),n.jsx('h3',{children:group.title}),group.description&&n.jsx('p',{children:group.description}),n.jsx('span',{className:'fs-series-open',children:'查看系列 →'})]})]},group.id))}):n.jsx('div',{className:'empty',children:'作者还没有发布系列作品。'}),
  ]});
}
function FanstarSeriesContents({product}) {
  const {products}=he();
  if(!product.seriesId)return null;
  const group=fanstarSeriesGroups(products,product.creatorId).find(item=>item.id===product.seriesId);
  // An unlisted work's direct link must not expose other unlisted works.
  if(!group)return null;
  const index=group.products.findIndex(item=>item.id===product.id),previous=index>0?group.products[index-1]:null,next=index>=0?group.products[index+1]:null;
  const link=item=>'/c/'+encodeURIComponent(item.creatorId)+'/shop/'+encodeURIComponent(item.id);
  return n.jsxs('section',{className:'fs-series-contents','aria-label':'同系列作品',children:[
    n.jsxs('header',{className:'fs-series-heading',children:[n.jsxs('div',{children:[n.jsx('p',{className:'kicker',children:'同系列作品'}),n.jsx('h2',{children:group.title})]}),n.jsx(q,{to:fanstarSeriesLink(product.creatorId,product.seriesId),className:'btn btn-line',children:'查看整个系列'})]}),
    group.description&&n.jsx('p',{className:'muted',children:group.description}),
    n.jsx('ol',{className:'fs-series-list',children:group.products.map(item=>n.jsx('li',{children:n.jsxs(q,{to:link(item),'aria-current':item.id===product.id?'page':undefined,children:[n.jsx('span',{className:'fs-series-number',children:String(item.seriesOrder).padStart(2,'0')}),n.jsx('strong',{children:item.title}),n.jsx('span',{className:'muted',children:item.id===product.id?'当前作品':'查看作品 →'})]})},item.id))}),
    (previous||next)&&n.jsxs('nav',{className:'fs-series-neighbors','aria-label':'系列顺序导航',children:[previous&&n.jsx(q,{to:link(previous),children:'← 上一部：'+previous.title}),next&&n.jsx(q,{to:link(next),children:'下一部：'+next.title+' →'})]}),
  ]});
}
