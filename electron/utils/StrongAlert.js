'use strict';

const { BrowserWindow, screen } = require('electron');

class StrongAlert {
  constructor() {
    this.win = null;
  }

  show({ cardName = 'WhatsApp' } = {}) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      this.win.webContents.send('new-message-burst', { cardName });
      return;
    }

    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    const w = Math.min(620, Math.max(500, Math.floor(width * 0.38)));
    const h = 250;

    this.win = new BrowserWindow({
      width: w,
      height: h,
      x: Math.floor((width - w) / 2),
      y: Math.floor((height - h) / 2),
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: false,
      alwaysOnTop: true,
      fullscreenable: false,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    this.win.setAlwaysOnTop(true, 'screen-saver');

    const safeName = String(cardName || 'WhatsApp')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>WhatsApp 新消息</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei",Segoe UI,Arial,sans-serif;background:#fff;color:#111}
.wrap{height:100vh;display:flex;flex-direction:column;border:2px solid #1f8f55;box-shadow:0 12px 35px rgba(0,0,0,.28)}
.bar{height:42px;background:#1f8f55;color:#fff;display:flex;align-items:center;padding:0 16px;font-weight:700;font-size:17px}
.body{flex:1;display:flex;align-items:center;padding:20px 26px;gap:18px}.icon{font-size:54px;line-height:1}
.title{font-size:24px;font-weight:800;margin-bottom:8px}.sub{font-size:15px;color:#555}.account{color:#167744;font-weight:700}
.foot{height:66px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 22px;background:#f4f6f5}
button{font-size:16px;padding:10px 25px;border-radius:4px;border:1px solid #777;background:#fff;cursor:pointer}
button.primary{background:#1f8f55;color:#fff;border-color:#1f8f55;font-weight:700}
</style></head><body>
<div class="wrap"><div class="bar">New WS · WhatsApp 强提醒</div>
<div class="body"><div class="icon">⚠️</div><div><div class="title">您有新的 WhatsApp 消息，请及时查看。</div>
<div class="sub">账号：<span class="account" id="account">${safeName}</span><br>未确认前每 15 秒重复语音提醒，最长 5 分钟。</div></div></div>
<div class="foot"><button onclick="window.close()">稍后查看</button><button class="primary" onclick="window.close()">确认已查看</button></div></div>
<script>
const { ipcRenderer } = require('electron');
function speak(){ try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance('您有新的 WhatsApp 消息，请及时查看。'); u.lang='zh-CN'; u.rate=1; u.volume=1; speechSynthesis.speak(u); }catch(e){} }
function updateAccount(name){ document.getElementById('account').textContent=name||'WhatsApp'; }
ipcRenderer.on('new-message-burst',(_,data)=>{updateAccount(data&&data.cardName);speak();});
window.addEventListener('load',()=>setTimeout(speak,150));
const repeat=setInterval(speak,15000); setTimeout(()=>{clearInterval(repeat);window.close();},300000);
</script></body></html>`;

    this.win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    this.win.once('ready-to-show', () => {
      if (!this.win || this.win.isDestroyed()) return;
      this.win.show();
      this.win.focus();
      try { this.win.flashFrame(true); } catch (_) {}
    });
    this.win.on('closed', () => { this.win = null; });
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}

module.exports = StrongAlert;
