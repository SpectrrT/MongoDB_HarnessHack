import {useEffect,useMemo,useRef} from 'react';
import * as echarts from 'echarts/core';
import {ScatterChart,BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';

echarts.use([ScatterChart,BarChart,GridComponent,TooltipComponent,SVGRenderer]);
const palette={baseline:'#8b9790',offload:'#426dae',decision:'#36785b',text:'#46554c',line:'#e1e8e2'};
const number=value=>value.toLocaleString('en-US');
const short=value=>value>=1000?`${Number((value/1000).toFixed(1))}k`:String(value);
function Plot({options,label}) {
  const element=useRef();
  useEffect(()=>{
    const chart=echarts.init(element.current,null,{renderer:'svg'});
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    chart.setOption({...options,animation:!motion.matches,animationDuration:400});
    const resize=new ResizeObserver(()=>chart.resize());resize.observe(element.current);
    return()=>{resize.disconnect();chart.dispose();};
  },[options]);
  return <div ref={element} className="benchmark-plot" role="img" aria-label={label}/>;
}
export default function BenchmarkCharts({result}) {
  const points=[
    {name:result.baselineLabel||'Same harness, full context',short:'Full context',tokens:result.baselineTokens,passed:result.baselinePassed,color:palette.baseline},
    {name:result.offloadLabel||'Offload + Jev',short:result.noSelection?'Sleep + selection':'Offload + Jev',tokens:result.offloadTokens,passed:result.offloadPassed,color:palette.offload},
  ];
  const scatter=useMemo(()=>({
    grid:{top:38,right:30,bottom:55,left:54},
    textStyle:{fontFamily:'Inter, sans-serif',color:palette.text},
    tooltip:{trigger:'item',renderMode:'richText',formatter:p=>`${p.seriesName}\n${number(p.value[0])} total tokens\n${p.value[2]}/${result.stages} exact checks`},
    xAxis:{type:'value',min:0,max:Math.ceil(Math.max(result.baselineTokens,result.offloadTokens)*1.12/10000)*10000,name:'Total tokens, including scoring',nameLocation:'middle',nameGap:32,nameTextStyle:{fontSize:10},axisLabel:{formatter:short,fontSize:10},splitNumber:4,splitLine:{lineStyle:{color:palette.line}},axisLine:{show:false},axisTick:{show:false}},
    yAxis:{type:'value',min:0,max:100,interval:25,name:'Checks passed (%)',nameTextStyle:{fontSize:10},axisLabel:{formatter:'{value}%',fontSize:10},splitLine:{lineStyle:{color:palette.line}},axisLine:{show:false},axisTick:{show:false}},
    series:points.map((point,index)=>({name:point.name,type:'scatter',symbol:index?'circle':'diamond',symbolSize:18,data:[[point.tokens,100*point.passed/result.stages,point.passed]],itemStyle:{color:point.color,borderColor:'#fff',borderWidth:3},label:{show:true,formatter:point.short,position:index?'bottom':'left',distance:12,color:palette.text,fontSize:11},emphasis:{scale:1.3}})),
  }),[result]);
  const stack=useMemo(()=>({
    grid:{top:15,right:20,bottom:33,left:104},
    textStyle:{fontFamily:'Inter, sans-serif',color:palette.text},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},renderMode:'richText',formatter:rows=>rows.filter(row=>row.value>0).map(row=>`${row.seriesName}: ${number(row.value)} tokens`).join('\n')},
    xAxis:{type:'value',min:0,axisLabel:{formatter:short,fontSize:10},splitNumber:4,splitLine:{lineStyle:{color:palette.line}},axisLine:{show:false},axisTick:{show:false}},
    yAxis:{type:'category',inverse:true,data:['Full context',result.noSelection?'Sleep + selection':'Offload + Jev'],axisLabel:{fontSize:10,color:palette.text},axisLine:{show:false},axisTick:{show:false}},
    series:[
      {name:'Full-context answers',type:'bar',stack:'tokens',barWidth:29,data:[result.baselineTokens,0],itemStyle:{color:palette.baseline,borderRadius:5}},
      {name:result.noSelection?'Answer generation':'Selected-context answers and recovery',type:'bar',stack:'tokens',barWidth:29,data:[0,result.mainTokens],itemStyle:{color:palette.offload,borderRadius:[5,0,0,5]}},
      {name:'Jev scoring',type:'bar',stack:'tokens',barWidth:29,data:[0,result.decisionTokens],itemStyle:{color:palette.decision,borderRadius:[0,5,5,0]}},
    ],
  }),[result]);
  const remaining=100*result.afterContextChars/result.beforeContextChars;
  return <div className="benchmark-graphics">
    <figure><div className="benchmark-figure-heading"><span className="diagram-kicker">01 / OUTPUT VS SPEND</span><h3>What the tokens achieved</h3></div>
      <Plot options={scatter} label={`Exact task score versus total tokens. ${points.map(point=>`${point.name}: ${point.passed} of ${result.stages} checks, ${number(point.tokens)} tokens`).join('. ')}`}/>
      <figcaption>Higher means more checks passed. Left means fewer tokens. This measures these tasks, not general reasoning ability.</figcaption>
    </figure>
    <figure><div className="benchmark-figure-heading"><span className="diagram-kicker">02 / COMPACTION COST</span><h3>Count the selector, too</h3></div>
      <div className="benchmark-stack"><Plot options={stack} label={`All-in token breakdown: full context ${number(result.baselineTokens)}; Offload answer and recovery ${number(result.mainTokens)}, Jev scoring ${number(result.decisionTokens)}.`}/></div>
      <div className="benchmark-legend"><span style={{'--dot':palette.offload}}>{result.noSelection?'Answer generation':'Answers + recovery'}</span><span style={{'--dot':palette.decision}}>Jev scoring</span></div>
      <div className="benchmark-context"><div><span>{result.noSelection?'Supplied history characters':'Selection input and kept characters'}</span><strong>{number(result.beforeContextChars)} → {number(result.afterContextChars)}</strong></div><div className="context-track" aria-hidden="true"><span style={{width:`${remaining}%`}}/></div>
        <small>Sum of {result.contextSnapshots} selection snapshots. Repeated history can recur. Characters are not tokens.</small>
      </div>
      <figcaption>{result.noSelection?'All supplied history stayed in the request. No selection or scoring occurred.':`${number(result.decisionTokens)} scoring tokens are included in Offload's total. Original evidence remains archived.`}</figcaption>
    </figure>
  </div>;
}
