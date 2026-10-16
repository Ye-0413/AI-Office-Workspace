/* One explicit click initializes detected local observer integrations. */
(function(root){
  'use strict';
  const copy={
    zh:{title:'一键初始化本机工具',description:'自动识别已有 AI 工具，逐项安装或更新观察配置，并保留原有配置。未检测到的工具会跳过；信任确认仍在原工具中完成。',run:'一键初始化',retry:'重试失败项',running:'正在初始化…',results:'查看逐项结果',configured:'已配置',failed:'失败',skipped:'未检测到，已跳过',pending:'排队中',configuring:'正在配置',summary:'已配置 {configured} · 失败 {failed} · 跳过 {skipped} · 待处理 {pending}',note:'配置完成不等于已收到真实活动；下方详情会说明信任、重启或新会话要求。',error:'初始化未完成，请重试。',unavailable:'请重新打开最新版应用以使用自动初始化。'},
    en:{title:'Set up local tools in one click',description:'Detect existing AI tools, then install or update observation configuration while preserving current settings. Undetected tools are skipped; trust is confirmed in the original tool.',run:'Initialize tools',retry:'Retry failures',running:'Initializing…',results:'Per-tool results',configured:'Configured',failed:'Failed',skipped:'Not detected · skipped',pending:'Queued',configuring:'Configuring',summary:'Configured {configured} · Failed {failed} · Skipped {skipped} · Pending {pending}',note:'Configuration does not confirm live activity. Details below show trust, restart or new-session requirements.',error:'Setup did not finish. Please retry.',unavailable:'Reopen the latest app to use automatic setup.'}
  };
  function create({bridge,getLanguage}={}){
    const $=id=>document.getElementById(id),panel=$('setup-assistant');
    if(!panel)return Object.freeze({update(){},updateLanguage(){},setProviderBusy(){},dispose(){}});
    let language='zh',state=null,busy=false,providerBusy=false,disposed=false,generation=0,revision=0,statusRead=0;
    const listeners=[];
    const tr=(key,values={})=>String(copy[language][key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??0));
    const hasApi=!!bridge&&typeof bridge.initializeProviders==='function';
    const on=(node,event,handler)=>{node.addEventListener(event,handler);listeners.push(()=>node.removeEventListener(event,handler));};
    function render(){
      panel.setAttribute('aria-label',tr('title'));
      for(const node of panel.querySelectorAll('[data-setup-copy]'))node.textContent=tr(node.dataset.setupCopy);
      const running=busy||state?.running||providerBusy;
      $('setup-initialize').disabled=!hasApi||running;
      $('setup-initialize').textContent=tr(busy||state?.running?'running':'run');
      $('setup-retry').hidden=!(state?.totals?.failed>0);
      $('setup-retry').disabled=!hasApi||running;
      const summary=$('setup-summary');
      summary.textContent=!hasApi?tr('unavailable'):state?.error?tr('error')+' '+state.error:state?.rows?.length?tr('summary',state.totals):'';
      summary.dataset.error=String(!hasApi||Boolean(state?.error));
      const rows=(state?.rows||[]).filter(row=>row.status!=='skipped'),fragment=document.createDocumentFragment();
      for(const row of rows){
        const li=document.createElement('li');li.className='setup-result';li.dataset.state=row.status;
        const heading=document.createElement('strong'),detail=document.createElement('span');
        const provider=root.OfficeProviders?.getProvider(row.provider);
        heading.textContent=(provider?.name||row.provider)+' · '+tr(row.status);
        detail.textContent=String(row.detail||'').split('\n').map(line=>root.OfficeI18n?.translate(language,line)||line).join('\n');
        li.append(heading,detail);fragment.append(li);
      }
      $('setup-result-list').replaceChildren(fragment);
      $('setup-results').hidden=!rows.length;
    }
    function update(next){if(disposed||!next)return;++revision;state=next;render();}
    async function initialize(retryFailed){
      if(disposed||busy||providerBusy||state?.running||!hasApi)return;
      const request=++generation;busy=true;render();
      $('setup-results').open=true;
      try{
        const result=await bridge.initializeProviders({retryFailed});
        if(disposed||request!==generation)return;
        ++revision; state=result; $('setup-results').open=true;
      }catch(error){if(!disposed&&request===generation){++revision;state={...(state||{}),running:false,error:String(error?.message||error).slice(0,300)};}}
      finally{if(!disposed&&request===generation){busy=false;render();}}
    }
    on($('setup-initialize'),'click',()=>initialize(false));
    on($('setup-retry'),'click',()=>initialize(true));
    on($('connections-button'),'click',async()=>{
      if(typeof bridge?.getProviderSetup!=='function')return;
      const request=++statusRead,readRevision=revision,runGeneration=generation;
      try{const result=await bridge.getProviderSetup();if(!disposed&&request===statusRead&&readRevision===revision&&runGeneration===generation&&!busy)update(result);}catch{}
    });
    function updateLanguage(){language=getLanguage?.()==='en'?'en':'zh';render();}
    updateLanguage();
    return Object.freeze({update,updateLanguage,setProviderBusy(value){providerBusy=Boolean(value);render();},dispose(){disposed=true;++generation;for(const remove of listeners)remove();}});
  }
  root.OfficeSetupAssistant=Object.freeze({create});
})(typeof globalThis==='object'?globalThis:this);
