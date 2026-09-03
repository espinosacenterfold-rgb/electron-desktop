const { Application } = require('ee-core');
const Log = require('ee-core/log');
const Services = require('ee-core/services');
const { app, BrowserWindow, WebContentsView,webContents ,ipcMain} = require('electron');
const request = require('./utils/request'); // 导入工具类
const path = require('path');
const fs = require('fs');
const {translateText,getLanguages} = require('./api/index')
const Addon = require("ee-core/addon");
const Storage = require("ee-core/storage");
const Database = require('./utils/DatabaseUtils');
const StrongAlert = require('./utils/StrongAlert');
class Index extends Application {
  constructor() {
    super();
    app.sdb = new Database();
    app.viewsMap = new Map();
    this.strongAlert = new StrongAlert();
    this.initializeDatabase()
  }

  /**
   * core app have been loaded
   */
  async ready () {
    // do some things

  }
  async initializeDatabase() {
    // 定义表结构
    const tables = {
      'cards': {
        columns: {
          card_id: 'TEXT PRIMARY KEY',
          platform: 'TEXT',
          platform_url: 'TEXT',
          card_name: 'TEXT',
          avatar_url: 'TEXT',
          window_id: 'INTEGER',
          active_status: 'TEXT',
          online_status: 'TEXT',
          show_badge: 'TEXT',
        },
        constraints: []
      },
      'card_config': {
        columns: {
          card_id: 'TEXT PRIMARY KEY',
          name: 'TEXT',
          user_agent: 'TEXT',
          cookie: 'TEXT',
          proxy_status: 'TEXT',
          proxy_type: 'TEXT',
          proxy_host: 'TEXT',
          proxy_port: 'TEXT',
          proxy_username: 'TEXT',
          proxy_password: 'TEXT',
        },
        constraints: []
      },
      'number_record': {
        columns: {
          card_id: 'TEXT',          // 会话ID
          platform: 'TEXT',          // 平台
          phone_number: 'TEXT',      // 号码
          phone_status: 'TEXT',      // 手机号码状态
          message: 'TEXT',           // 日志信息
          status: 'TEXT'             // 检测状态
        },
        constraints: [
          'PRIMARY KEY(phone_number)',
          'UNIQUE(phone_number, platform)'
        ]
      },
      'user_portrait': {
        columns: {
          card_id: 'TEXT',
          platform: 'TEXT',
          nickname: 'TEXT',
          phone_number: 'TEXT',
          country: 'TEXT',
          gender: 'TEXT',
          notes: 'TEXT'
        },
        constraints: [
          'PRIMARY KEY(phone_number)',
          'UNIQUE(phone_number, platform)'
        ]
      },
      'follow_up_record': {
        columns: {
          card_id: 'TEXT',
          platform: 'TEXT',
          phone_number: 'TEXT',
          time: 'TEXT',
          content: 'TEXT',
        },
        constraints: [
          'PRIMARY KEY(phone_number)',
          'UNIQUE(phone_number, platform)'
        ]
      }
    };

    for (const [tableName, { columns, constraints }] of Object.entries(tables)) {
      await app.sdb.syncTableStructure(tableName, columns, constraints);
    }

    console.log("所有表结构同步完成");
  }

  async electronAppReady () {
    // do some things
  }

  async windowReady () {
    const winOpt = this.config.windowsOption;
    if (winOpt.show === false) {
      const win = this.electron.mainWindow;
      win.once('ready-to-show', () => {
        win.show();
      })
    }
    app.sdb.update('cards',{online_status:'false',avatar_url:'',show_badge:'false'},{})
    ipcMain.handle('language-list', async (event) => {
      return getLanguages()
    });
    ipcMain.handle('translate-text', async (event, args) => {
      const {text,local,target} = args
      return translateText(text,local,target)
    });
    ipcMain.handle('online-notify', async (event, args) => {
      const {online,platform,avatarUrl} = args;
      const senderWebContents = event.sender;
      const processId = senderWebContents.id;
      const mainId = Addon.get('window').getMWCid();
      const mainWin = BrowserWindow.fromId(mainId);
      if (mainWin && mainWin.webContents) {
        const card = await app.sdb.selectOne('cards',{window_id:processId})
        if (card) {
          const cardId = card.card_id;
          const onlineStatus = card.online_status;
          const result = (onlineStatus === String(online));
          const status = String(online)
          if (!result) {
            await app.sdb.update('cards', { online_status: status, avatar_url: avatarUrl }, { platform: platform, card_id: cardId });
            mainWin.webContents.send('online-notify', { cardId: cardId, onlineStatus: online,avatarUrl:avatarUrl });
            Log.info(`登录状态发生改变已发送给渲染程序`);
          }
        }
        return {status:true,message:'状态修改成功！'}
      } else {
        return {status:false,message:'未找到的渲染进程！'};
      }
    });

    ipcMain.on('execute-js-operation', async (event,url) => {
      const platforms = app.platforms ?? []
      try {
        const senderWebContents = event.sender;
        const fileName = platforms.find(item => item.url === url)?.platform;
        Log.info('fileName:', fileName,' url:',url);
        if (fileName) {
          const scriptPath = path.join(__dirname, 'scripts', `${fileName}.js`);
          const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
          await senderWebContents.executeJavaScript(scriptContent);

          if (fileName === 'WhatsApp') {
            const notifierPath = path.join(__dirname, 'scripts', 'WhatsAppNotifier.js');
            if (fs.existsSync(notifierPath)) {
              const notifierContent = fs.readFileSync(notifierPath, 'utf-8');
              await senderWebContents.executeJavaScript(notifierContent);
              Log.info('WhatsApp 强提醒监听器已注入');
            }
          }
          Log.info('脚本已成功在渲染进程中执行');
        }else {
          Log.error('没有找到该地址对应的js代码：',url)
        }
      } catch (error) {
        Log.error('执行脚本时出错:', error);
      }
    });
    ipcMain.on('message-notify', async (event,args) => {
      const senderWebContents = event.sender;
      const processId = senderWebContents.id;
    });
    ipcMain.on('filter-notify', (event, data) => {
      Log.info("接收到的网页数据:", data);
      const {cardId,phoneNumber,platform,result:{ phone_status, message }} = data;
      app.sdb.insert('number_record',{card_id:cardId,phone_number:phoneNumber,platform:platform,phone_status:phone_status,message:message,status:'true'});
      const mainId = Addon.get('window').getMWCid();
      const mainWin = BrowserWindow.fromId(mainId);
      if (mainWin && mainWin.webContents) {
        mainWin.webContents.send('number_filter-notify',data)
        Log.info('号码过滤消息推送成功：')
      }
    });
    ipcMain.handle('new-message-notify', (event, data) => {
      const {platform} = data;
      const senderWebContents = event.sender;
      const processId = senderWebContents.id;
      const card = app.sdb.selectOne('cards',{window_id:processId,platform:platform})
      Log.info("收到新消息:", platform,processId, data && data.reason ? data.reason : '');
      if (!card) return;
      Log.info('获取到对应卡片数据：',card)
      app.sdb.update('cards',{show_badge:'true'},{card_id:card.card_id,active_status:"false"});
      const mainId = Addon.get('window').getMWCid();
      const mainWin = BrowserWindow.fromId(mainId);
      if (mainWin && mainWin.webContents) {
        mainWin.webContents.send('new-message-notify', {cardId:card.card_id,platform:card.platform})
        Log.info('新消息提醒推送成功：')
      }
      if (platform === 'WhatsApp') {
        this.strongAlert.show({ cardName: card.card_name || card.name || 'WhatsApp' });
      }
    });
    ipcMain.handle('show-user-portrait-panel', async (event, data) => {
      const {platform, phone_number} = data;
      if (phone_number==='' || phone_number===undefined) return;
      const senderWebContents = event.sender;
      const processId = senderWebContents.id;
      const card = app.sdb.selectOne('cards', {window_id: processId, platform: platform})
      if (!card) return;
      const mainId = Addon.get('window').getMWCid();
      const mainWin = BrowserWindow.fromId(mainId);
      if (mainWin && mainWin.webContents) {
        const args = {card_id: card.card_id, platform: card.platform,phone_number:phone_number};
        const result = await Services.get('user').getUserPortrait(args)
        mainWin.webContents.send('open-user-portrait', result)
      }
    });
  }

  async beforeClose () {
    if (this.strongAlert) this.strongAlert.close();
  }
}
Index.toString = () => '[class Index]';
module.exports = Index;
