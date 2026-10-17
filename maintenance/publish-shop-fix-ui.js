// Used by both multipart publishing and editing. Keep this in the shipped app.
function fanstarSeriesForm(form,value){
 const creating=value.seriesId==='__new';
 form.set('seriesCreate',creating?'1':'0');
 form.set('seriesId',creating?'':value.seriesId||'');
 form.set('seriesTitle',creating?value.seriesTitle||'':'');
 form.set('seriesDescription',creating?value.seriesDescription||'':'');
 form.set('seriesOrder',value.seriesOrder??'');
}
function CreatorShopControls({settings,draft,onDraft,onSet}){
 return n.jsxs('div',{className:'creator-shop-tools',children:[
  n.jsxs('label',{className:'creator-shop-tool',children:[fanstarTranslate('作品类别'),n.jsx('select',{'aria-label':fanstarTranslate('作品类别'),value:settings.category,onChange:event=>onSet('cat',event.target.value),children:['全部',...CATALOG_PRODUCT_CATEGORIES].map(value=>n.jsx('option',{value,children:fanstarTranslate(value==='全部'?'全部类别':value)},value))})]}),
  n.jsxs('label',{className:'creator-shop-tool',children:[fanstarTranslate('排序'),n.jsx('select',{'aria-label':fanstarTranslate('作品排序'),value:settings.sort,onChange:event=>onSet('sort',event.target.value),children:[['latest','最近发布'],['price','价格从低到高'],['name','商品名称']].map(([value,label])=>n.jsx('option',{value,children:fanstarTranslate(label)},value))})]}),
  n.jsxs('form',{className:'creator-shop-search',role:'search','aria-label':fanstarTranslate('搜索这家商城'),onSubmit:event=>{event.preventDefault();onSet('q',draft.trim());},children:[n.jsx('input',{type:'search',name:'shopQ',value:draft,maxLength:200,'aria-label':fanstarTranslate('商城内搜索'),placeholder:fanstarTranslate('搜索这家商城的商品名称或标签'),onChange:event=>onDraft(event.target.value)}),n.jsx('button',{type:'submit',className:'btn btn-dark',children:fanstarTranslate('搜索')})]}),
  settings.query&&n.jsx(ShopSearchControls,{settings,onSet,showSort:false})
 ]});
}
