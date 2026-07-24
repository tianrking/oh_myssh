/**
 * Oh My SSH - i18n Internationalization Core Dictionary
 * 支持 zh-CN (简体中文) 和 en-US (English)
 */

export type SupportedLanguage = 'zh-CN' | 'en-US';

export const i18nDict = {
  'zh-CN': {
    appName: 'Oh My SSH',
    subtitle: '本地优先 • 纯前端 WebSSH & SFTP 工作区',
    quickConnect: '快速连接',
    searchPlaceholder: '搜索主机、命令片段 (⌘K)...',
    hostsHeader: '工作区主机列表',
    addHost: '新增主机',
    searchHosts: '搜索主机、IP 或标签...',
    defaultGroup: '默认分组',
    quickConnectModalTitle: '快速连接主机',
    quickConnectModalSub: '输入任意 user@host:port 直接建立会话',
    connectionString: '连接字符串',
    authType: '认证类型',
    authPassword: '密码认证',
    authPrivateKey: 'SSH 私钥 (Ed25519/RSA)',
    passwordLabel: '密码',
    privateKeyLabel: '私钥内容 (PEM/OpenSSH)',
    groupLabel: '归属分组',
    cancel: '取消',
    connectNow: '发起连接',
    splitVertical: '左右分屏',
    splitHorizontal: '上下分屏',
    sftpTitle: '双栏 SFTP 文件传输向导',
    testStreamUpload: '测试流式上传文件',
    backendQueue: '后台流式传输队列',
    commandPaletteTitle: '搜索命令片段或操作',
    escClose: 'Esc 键关闭',
    enterSend: '↵ 发送至当前终端',
    welcomeTitle: 'Oh My SSH 工作区已就绪',
    welcomeSub: '真正的纯前端 SSH / SFTP 体验。在 Chromium IWA 中通过 Direct Sockets 直接连接目标 TCP/22，数据与私钥永久留在本地。',
    newConnection: '发起新连接',
    exportLog: '导出 Session 日志',
    sessionProperties: '会话属性',
    broadcastMode: '广播输入模式 (对所有打开的终端生效)',
    broadcastPlaceholder: '输入命令按 Enter 广播至所有终端...',
    keepAlive: 'KeepAlive 心跳探测',
    encoding: '字符集编码',
    scrollback: '历史滚屏上限',
  },
  'en-US': {
    appName: 'Oh My SSH',
    subtitle: 'Local-First • Pure Client WebSSH & SFTP Workspace',
    quickConnect: 'Quick Connect',
    searchPlaceholder: 'Search hosts, commands (⌘K)...',
    hostsHeader: 'Workspace Hosts',
    addHost: 'Add Host',
    searchHosts: 'Search hosts, IP, tags...',
    defaultGroup: 'Default Group',
    quickConnectModalTitle: 'Quick Connect Host',
    quickConnectModalSub: 'Enter user@host:port to establish session',
    connectionString: 'Connection String',
    authType: 'Authentication Type',
    authPassword: 'Password Auth',
    authPrivateKey: 'SSH Private Key (Ed25519/RSA)',
    passwordLabel: 'Password',
    privateKeyLabel: 'Private Key (PEM/OpenSSH)',
    groupLabel: 'Group',
    cancel: 'Cancel',
    connectNow: 'Connect Now',
    splitVertical: 'Split Vertical',
    splitHorizontal: 'Split Horizontal',
    sftpTitle: 'Dual-Pane SFTP File Manager',
    testStreamUpload: 'Test Stream Upload',
    backendQueue: 'Backend Stream Queue',
    commandPaletteTitle: 'Search snippets or commands',
    escClose: 'Esc to close',
    enterSend: '↵ Send to active terminal',
    welcomeTitle: 'Oh My SSH Workspace Ready',
    welcomeSub: 'Pure client-side WebSSH & SFTP experience. Connect directly to TCP/22 via Direct Sockets in Chromium IWA. Credentials stay 100% local.',
    newConnection: 'New Connection',
    exportLog: 'Export Session Log',
    sessionProperties: 'Session Properties',
    broadcastMode: 'Broadcast Mode (Broadcasts to all open terminals)',
    broadcastPlaceholder: 'Type command and press Enter to broadcast...',
    keepAlive: 'KeepAlive Interval',
    encoding: 'Encoding',
    scrollback: 'Scrollback Lines',
  },
};

let currentLang: SupportedLanguage = 'zh-CN';
const listeners: Array<() => void> = [];

export function setLanguage(lang: SupportedLanguage) {
  currentLang = lang;
  listeners.forEach((cb) => cb());
}

export function getLanguage(): SupportedLanguage {
  return currentLang;
}

export function t(key: keyof (typeof i18nDict)['zh-CN']): string {
  return i18nDict[currentLang][key] || i18nDict['zh-CN'][key] || key;
}

export function subscribeLanguageChange(cb: () => void) {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
