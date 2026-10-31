// 同母版上的开发会话模拟，不调用引擎或网络。
{
  const entry = document.createElement('button');
  entry.type = 'button'; entry.className = 'ghost-btn'; entry.textContent = 'XDMCP 开发';
  document.querySelector('[data-rlogin-open]').after(entry);
  const dialog = document.createElement('dialog'); dialog.className = 'rlogin-dialog';
  dialog.setAttribute('aria-label', 'XDMCP 开发会话原型');
  dialog.innerHTML = `<h2>XDMCP 开发会话</h2><p>仅模拟，不会联网或启动程序。实际桌面在独立引擎窗口中登录；查询中不代表登录成功。</p>
    <form><div class="rlogin-fields"><label>目标 IPv4<input name="target" required value="192.0.2.5"></label>
    <label>本机 IPv4<input name="local" required value="192.0.2.6"></label></div>
    <label>外置引擎绝对路径<input name="engine" required value="C:\\dev\\XWin.exe"></label>
    <p><label><input type="checkbox" name="external" required>我确认该程序来源可信，允许本次运行</label></p>
    <p><label><input type="checkbox" name="network" required>我了解明文与回连风险，允许本次网络访问</label></p>
    <button type="submit">连接一次</button></form><p data-state role="status"></p><div data-actions></div><footer><button data-close>关闭原型</button></footer>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), actions = dialog.querySelector('[data-actions]'); let state = 'idle';
  const labels = { idle: '尚未连接', starting: '启动外置引擎', querying: '引擎已启动；桌面登录尚未验证', stopping: '等待进程和临时认证目录回收', closed: '已关闭，可以重新确认后连接', cleanup_failed: '清理未完成；保留实例并重试关闭' };
  function button(label, next) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => render(next); actions.append(b); }
  function render(next) {
    state = next; dialog.querySelector('[data-state]').textContent = labels[next]; actions.replaceChildren();
    const locked = !['idle', 'closed'].includes(next); form.querySelectorAll('input,button').forEach(input => { input.disabled = locked; });
    if (next === 'starting') { button('模拟启动完成', 'querying'); button('取消', 'stopping'); }
    if (next === 'querying') { button('取消', 'stopping'); button('模拟桌面退出', 'closed'); }
    if (next === 'stopping') { button('模拟清理完成', 'closed'); button('模拟清理失败', 'cleanup_failed'); }
    if (next === 'cleanup_failed') button('重试关闭', 'stopping');
  }
  form.oninput = event => { if (event.target.type !== 'checkbox') form.querySelectorAll('[type=checkbox]').forEach(input => { input.checked = false; }); };
  form.onsubmit = event => { event.preventDefault(); if (!form.reportValidity()) return; form.querySelectorAll('[type=checkbox]').forEach(input => { input.checked = false; }); render('starting'); };
  function close() { if (['idle', 'closed'].includes(state)) dialog.close(); else render('stopping'); }
  dialog.querySelector('[data-close]').onclick = close; dialog.oncancel = event => { event.preventDefault(); close(); };
  entry.onclick = () => { dialog.showModal(); form.querySelector('input').focus(); }; render('idle');
}
