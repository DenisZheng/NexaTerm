// Clickable command-task flow on the existing prototype; all transport outcomes are simulated.
{
  const entry=document.createElement('button');entry.type='button';entry.className='ghost-btn';entry.textContent='Rsh 命令';
  document.querySelector('[data-rlogin-open]').after(entry);
  const dialog=document.createElement('dialog');dialog.className='rlogin-dialog';dialog.setAttribute('aria-label','Rsh 命令任务原型');
  dialog.innerHTML=`<h2>Rsh 远端命令</h2><p>交互原型；不会建立网络连接。命令只用于本次运行。</p>
    <form><div class="rlogin-fields"><label>目标<input name="target" required value="example.invalid"></label>
    <label>远端用户<input name="user" required value="remote"></label></div>
    <label>远端命令<textarea name="command" required rows="3">printf 'hello\n'</textarea></label>
    <label><input type="checkbox" name="consent" required>我理解这是明文协议，并允许运行上述远端命令一次</label>
    <button type="submit">运行一次</button></form><p data-state role="status">尚未运行</p>
    <div data-actions></div><h3>stdout</h3><pre data-out></pre><h3>stderr</h3><pre data-err></pre>
    <p>远端退出码：未知。关闭本地连接不保证远端进程终止。</p><button type="button" data-dismiss>关闭原型</button>`;
  document.body.append(dialog);let state='idle';const status=dialog.querySelector('[data-state]'),actions=dialog.querySelector('[data-actions]'),form=dialog.querySelector('form');
  const labels={idle:'尚未运行',starting:'正在建立连接',running:'初始交换完成；正在接收输出',closing:'正在回收所属连接',closed:'传输结束；远端退出码未知',failed:'清理未完成，可重试关闭'};
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);}
  function render(next){state=next;status.textContent=labels[next];actions.replaceChildren();form.querySelector('button').disabled=['starting','running','closing','failed'].includes(next);
    if(next==='starting'){button('模拟 ACK',()=>render('running'));button('取消',()=>render('closing'));}
    if(next==='running'){
      button('模拟双流输出',()=>{dialog.querySelector('[data-out]').textContent+='hello\n';dialog.querySelector('[data-err]').textContent+='diagnostic\n';});
      button('发送 stdin EOF',()=>{status.textContent='stdin 已结束；继续接收两路输出';});button('发送 Interrupt',()=>{status.textContent='已发送 BSD Interrupt；远端状态未知';});
      button('模拟 stdout EOF',()=>{status.textContent='stdout EOF；仍等待 stderr 尾部';});button('模拟双流 EOF',()=>render('closed'));button('取消任务',()=>render('closing'));
    }
    if(next==='closing'){button('模拟回收完成',()=>render('closed'));button('模拟清理失败',()=>render('failed'));}
    if(next==='failed')button('重试关闭',()=>render('closing'));
  }
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;form.querySelector('[name=consent]').checked=false;dialog.querySelector('[data-out]').textContent='';dialog.querySelector('[data-err]').textContent='';render('starting');};
  dialog.querySelector('[data-dismiss]').onclick=()=>{if(['starting','running','closing','failed'].includes(state))render('closing');else dialog.close();};
  dialog.oncancel=e=>{if(['starting','running','closing','failed'].includes(state)){e.preventDefault();render('closing');}};
  entry.onclick=()=>{dialog.showModal();form.querySelector('input').focus();};render('idle');
}
