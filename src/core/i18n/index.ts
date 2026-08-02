/**
 * Oh My SSH - i18n Internationalization Core Dictionary
 * 支持 en-US (English, default), zh-CN (简体中文), es-ES (Español)
 */

export type SupportedLanguage = 'en-US' | 'zh-CN' | 'es-ES';

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'es-ES': 'Español',
};

const en: Record<string, string> = {
  // App Chrome
  appName: 'Oh My SSH',
  subtitle: 'Local-First • Pure Client WebSSH & SFTP Workspace',

  // Navbar & Search
  quickConnect: 'Quick Connect',
  searchPlaceholder: 'Search hosts, commands (⌘K)...',

  // Host Sidebar
  hostsHeader: 'Workspace Hosts',
  addHost: 'Add Host',
  searchHosts: 'Search hosts, IP, tags...',
  defaultGroup: 'Default Group',
  devServers: 'Dev Servers',
  productionServers: 'Production Servers',
  cloudInstances: 'Cloud Instances',

  // Quick Connect Modal
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

  // Workspace Tabs
  splitVertical: 'Split Vertical',
  splitHorizontal: 'Split Horizontal',
  closeTab: 'Close Tab',
  newTab: 'New Tab',

  // SFTP View
  sftpTitle: 'Dual-Pane SFTP File Manager',
  testStreamUpload: 'Test Stream Upload',
  backendQueue: 'Backend Stream Queue',
  localFiles: 'Local Files',
  remoteFiles: 'Remote Files',
  upload: 'Upload',
  download: 'Download',
  delete: 'Delete',
  rename: 'Rename',
  newFolder: 'New Folder',
  refresh: 'Refresh',
  transferProgress: 'Transfer Progress',
  transferComplete: 'Transfer Complete',

  // Command Palette
  commandPaletteTitle: 'Search snippets or commands',
  escClose: 'Esc to close',
  enterSend: '↵ Send to active terminal',

  // Welcome Page
  welcomeTitle: 'Oh My SSH Workspace Ready',
  welcomeSub: 'Browser-side SSH and SFTP over an authenticated Cloudflare TCP relay that does not terminate SSH, with strict host-key verification. Credentials stay in this browser session.',
  newConnection: 'New Connection',

  // Session & Toolbar
  exportLog: 'Export Session Log',
  sessionProperties: 'Session Properties',
  broadcastMode: 'Broadcast Mode (Broadcasts to all open terminals)',
  broadcastPlaceholder: 'Type command and press Enter to broadcast...',
  broadcast: 'Broadcast',

  // Session Properties Modal
  keepAlive: 'KeepAlive Interval',
  encoding: 'Encoding',
  scrollback: 'Scrollback Lines',
  terminalType: 'Terminal Type',
  fontSize: 'Font Size',
  saveProperties: 'Save Properties',

  // Relay Settings Modal
  relaySettingsTitle: 'Cloudflare SSH TCP Relay',
  relaySettingsSub: 'The Worker login session authorizes the raw SSH TCP relay',
  relayWarningTitle: 'Web Environment Limitation',
  relayWarningBody: 'Standard web pages cannot initiate raw TCP connections. The unified Cloudflare Worker provides the relay; sign in to the Worker and keep SSH credentials in this browser session.',
  relayUrlLabel: 'Cloudflare Worker base URL',
  relayUrlPlaceholder: 'https://your-relay.workers.dev',
  applyRelay: 'Apply Relay Config',

  // Snippet Manager
  snippetManagerTitle: 'Command Snippet Manager',
  snippetManagerSub: 'Manage frequently used SSH command snippets',
  addSnippet: 'Add Snippet',
  editSnippet: 'Edit Snippet',
  deleteSnippet: 'Delete Snippet',
  snippetName: 'Snippet Name',
  snippetCommand: 'Command',
  snippetCategory: 'Category',
  save: 'Save',

  // Theme Manager
  themeManagerTitle: 'Terminal Theme Manager',
  themeManagerSub: 'Select and customize terminal color themes',
  applyTheme: 'Apply Theme',
  currentTheme: 'Current Theme',

  // Terminal Footer
  connected: 'Connected',
  webglAccel: 'WebGL Accelerated',
  canvasFast: 'Canvas Fast 2D',
  rendererToggleTooltip: 'Toggle hardware acceleration (WebGL vs Canvas 2D)',
  fitTerminal: 'Fit',

  // Connection Error
  connectErrorTitle: 'SSH CONNECT ERROR: Direct TCP/22 Not Supported in Web Page',
  connectErrorTarget: 'Target Server',
  connectErrorReason: 'Reason',
  connectErrorReasonText: 'Browser W3C security spec prohibits web pages from making raw TCP connections.',
  connectErrorSolutions: 'To connect to any real external SSH server, choose one of these solutions:',
  connectErrorSolution1: 'Chromium IWA Mode: Launch in a Chromium IWA with Direct Sockets support.',
  connectErrorSolution2: 'Use the unified Cloudflare Worker page and sign in before connecting. No local relay or download is required.',
  connectErrorSolution3: 'Try Demo Mode: Select a preset "Dev Test Server" in the sidebar for the built-in shell.',

  // DirectSockets indicator
  directSocketsReady: 'DirectSockets IWA',
  offlineRelay: 'Offline / Relay',
  directSocketsTooltip: 'Chromium Direct Sockets (IWA) Ready: Can connect directly to TCP/22',
  webModeTooltip: 'Standard Web Mode: Default Offline Shell; Configure Relay for real SSH',
};

const zhCN: Record<string, string> = {
  // App Chrome
  appName: 'Oh My SSH',
  subtitle: '本地优先 • 纯前端 WebSSH & SFTP 工作区',

  // Navbar & Search
  quickConnect: '快速连接',
  searchPlaceholder: '搜索主机、命令片段 (⌘K)...',

  // Host Sidebar
  hostsHeader: '工作区主机列表',
  addHost: '新增主机',
  searchHosts: '搜索主机、IP 或标签...',
  defaultGroup: '默认分组',
  devServers: '开发服务器',
  productionServers: '生产服务器',
  cloudInstances: '云实例',

  // Quick Connect Modal
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

  // Workspace Tabs
  splitVertical: '左右分屏',
  splitHorizontal: '上下分屏',
  closeTab: '关闭标签页',
  newTab: '新建标签页',

  // SFTP View
  sftpTitle: '双栏 SFTP 文件传输向导',
  testStreamUpload: '测试流式上传文件',
  backendQueue: '后台流式传输队列',
  localFiles: '本地文件',
  remoteFiles: '远程文件',
  upload: '上传',
  download: '下载',
  delete: '删除',
  rename: '重命名',
  newFolder: '新建文件夹',
  refresh: '刷新',
  transferProgress: '传输进度',
  transferComplete: '传输完成',

  // Command Palette
  commandPaletteTitle: '搜索命令片段或操作',
  escClose: 'Esc 键关闭',
  enterSend: '↵ 发送至当前终端',

  // Welcome Page
  welcomeTitle: 'Oh My SSH 工作区已就绪',
  welcomeSub: 'SSH 加密、认证与 SFTP 均在浏览器执行；Cloudflare 中继不终止或解密 SSH，并严格校验服务器主机指纹。',
  newConnection: '发起新连接',

  // Session & Toolbar
  exportLog: '导出 Session 日志',
  sessionProperties: '会话属性',
  broadcastMode: '广播输入模式 (对所有打开的终端生效)',
  broadcastPlaceholder: '输入命令按 Enter 广播至所有终端...',
  broadcast: '广播',

  // Session Properties Modal
  keepAlive: 'KeepAlive 心跳探测',
  encoding: '字符集编码',
  scrollback: '历史滚屏上限',
  terminalType: '终端类型',
  fontSize: '字体大小',
  saveProperties: '保存属性',

  // Relay Settings Modal
  relaySettingsTitle: 'Cloudflare SSH TCP 中继',
  relaySettingsSub: '网页登录会话会自动授权原始 SSH TCP 中继',
  relayWarningTitle: '纯前端网络限制提示',
  relayWarningBody: '普通网页不能直接发起原始 TCP 连接。统一 Cloudflare Worker 会提供中继；登录 Worker 后即可使用，SSH 凭据只留在当前浏览器会话。',
  relayUrlLabel: 'Cloudflare Worker 基础地址',
  relayUrlPlaceholder: 'https://your-relay.workers.dev',
  applyRelay: '应用 Relay 配置',

  // Snippet Manager
  snippetManagerTitle: '命令片段管理器',
  snippetManagerSub: '管理常用的 SSH 命令片段',
  addSnippet: '添加片段',
  editSnippet: '编辑片段',
  deleteSnippet: '删除片段',
  snippetName: '片段名称',
  snippetCommand: '命令',
  snippetCategory: '分类',
  save: '保存',

  // Theme Manager
  themeManagerTitle: '终端主题管理器',
  themeManagerSub: '选择和自定义终端配色主题',
  applyTheme: '应用主题',
  currentTheme: '当前主题',

  // Terminal Footer
  connected: '已连接',
  webglAccel: 'WebGL 加速',
  canvasFast: 'Canvas 极速 2D',
  rendererToggleTooltip: '点击切换硬件加速模式 (WebGL 模式 vs Canvas 极速低延迟模式)',
  fitTerminal: '适配',

  // Connection Error
  connectErrorTitle: 'SSH 连接错误：普通网页不支持直接 TCP/22 连接',
  connectErrorTarget: '目标服务器',
  connectErrorReason: '拒绝原因',
  connectErrorReasonText: '浏览器 W3C 安全规范禁止普通网页直接发起原始 TCP 连接。',
  connectErrorSolutions: '要连接任意真实的外部 SSH 服务器，请选择以下任一解决方案：',
  connectErrorSolution1: 'Chromium IWA 模式：在支持 Direct Sockets 的 Chromium IWA 中启动包文件。',
  connectErrorSolution2: '打开统一 Cloudflare Worker 页面并登录后再连接，不需要本地 relay 或下载程序。',
  connectErrorSolution3: '体验 Demo 环境：在侧边栏选择预置的"开发测试机"体验内置 Shell。',

  // DirectSockets indicator
  directSocketsReady: 'DirectSockets IWA',
  offlineRelay: '离线 / Relay 中继',
  directSocketsTooltip: 'Chromium Direct Sockets (IWA) 就绪：可直连 TCP/22',
  webModeTooltip: '普通 Web 模式：默认 Offline Shell；配置 Relay 可连真实 SSH',
};

const esES: Record<string, string> = {
  // App Chrome
  appName: 'Oh My SSH',
  subtitle: 'Local-First • WebSSH y SFTP puro en el cliente',

  // Navbar & Search
  quickConnect: 'Conexión rápida',
  searchPlaceholder: 'Buscar hosts, comandos (⌘K)...',

  // Host Sidebar
  hostsHeader: 'Hosts del espacio de trabajo',
  addHost: 'Agregar host',
  searchHosts: 'Buscar hosts, IP, etiquetas...',
  defaultGroup: 'Grupo predeterminado',
  devServers: 'Servidores de desarrollo',
  productionServers: 'Servidores de producción',
  cloudInstances: 'Instancias en la nube',

  // Quick Connect Modal
  quickConnectModalTitle: 'Conexión rápida al host',
  quickConnectModalSub: 'Ingrese usuario@host:puerto para establecer sesión',
  connectionString: 'Cadena de conexión',
  authType: 'Tipo de autenticación',
  authPassword: 'Autenticación por contraseña',
  authPrivateKey: 'Clave privada SSH (Ed25519/RSA)',
  passwordLabel: 'Contraseña',
  privateKeyLabel: 'Clave privada (PEM/OpenSSH)',
  groupLabel: 'Grupo',
  cancel: 'Cancelar',
  connectNow: 'Conectar ahora',

  // Workspace Tabs
  splitVertical: 'Dividir vertical',
  splitHorizontal: 'Dividir horizontal',
  closeTab: 'Cerrar pestaña',
  newTab: 'Nueva pestaña',

  // SFTP View
  sftpTitle: 'Administrador SFTP de doble panel',
  testStreamUpload: 'Subida de prueba por streaming',
  backendQueue: 'Cola de transferencia en segundo plano',
  localFiles: 'Archivos locales',
  remoteFiles: 'Archivos remotos',
  upload: 'Subir',
  download: 'Descargar',
  delete: 'Eliminar',
  rename: 'Renombrar',
  newFolder: 'Nueva carpeta',
  refresh: 'Actualizar',
  transferProgress: 'Progreso de transferencia',
  transferComplete: 'Transferencia completa',

  // Command Palette
  commandPaletteTitle: 'Buscar fragmentos o comandos',
  escClose: 'Esc para cerrar',
  enterSend: '↵ Enviar al terminal activo',

  // Welcome Page
  welcomeTitle: 'Oh My SSH — Espacio de trabajo listo',
  welcomeSub: 'SSH y SFTP se ejecutan en el navegador mediante un relé TCP de Cloudflare que no termina ni descifra SSH, con verificación estricta de la clave del host.',
  newConnection: 'Nueva conexión',

  // Session & Toolbar
  exportLog: 'Exportar registro de sesión',
  sessionProperties: 'Propiedades de sesión',
  broadcastMode: 'Modo difusión (envía a todas las terminales abiertas)',
  broadcastPlaceholder: 'Escriba un comando y presione Enter para difundir...',
  broadcast: 'Difusión',

  // Session Properties Modal
  keepAlive: 'Intervalo KeepAlive',
  encoding: 'Codificación',
  scrollback: 'Líneas de historial',
  terminalType: 'Tipo de terminal',
  fontSize: 'Tamaño de fuente',
  saveProperties: 'Guardar propiedades',

  // Relay Settings Modal
  relaySettingsTitle: 'Relé TCP SSH de Cloudflare',
  relaySettingsSub: 'La sesión de inicio autoriza el relé TCP SSH del Worker',
  relayWarningTitle: 'Limitación del entorno web',
  relayWarningBody: 'Las páginas web normales no pueden iniciar conexiones TCP directas. El Worker unificado de Cloudflare proporciona el relé; inicie sesión y mantenga las credenciales SSH solo en esta sesión del navegador.',
  relayUrlLabel: 'URL base del Worker de Cloudflare',
  relayUrlPlaceholder: 'https://your-relay.workers.dev',
  applyRelay: 'Aplicar configuración Relay',

  // Snippet Manager
  snippetManagerTitle: 'Administrador de fragmentos',
  snippetManagerSub: 'Gestione fragmentos de comandos SSH frecuentes',
  addSnippet: 'Agregar fragmento',
  editSnippet: 'Editar fragmento',
  deleteSnippet: 'Eliminar fragmento',
  snippetName: 'Nombre del fragmento',
  snippetCommand: 'Comando',
  snippetCategory: 'Categoría',
  save: 'Guardar',

  // Theme Manager
  themeManagerTitle: 'Administrador de temas del terminal',
  themeManagerSub: 'Seleccione y personalice temas de colores del terminal',
  applyTheme: 'Aplicar tema',
  currentTheme: 'Tema actual',

  // Terminal Footer
  connected: 'Conectado',
  webglAccel: 'Aceleración WebGL',
  canvasFast: 'Canvas rápido 2D',
  rendererToggleTooltip: 'Alternar aceleración de hardware (WebGL vs Canvas 2D)',
  fitTerminal: 'Ajustar',

  // Connection Error
  connectErrorTitle: 'ERROR DE CONEXIÓN SSH: TCP/22 directo no compatible en página web',
  connectErrorTarget: 'Servidor destino',
  connectErrorReason: 'Motivo',
  connectErrorReasonText: 'La especificación de seguridad W3C del navegador prohíbe las conexiones TCP directas desde páginas web.',
  connectErrorSolutions: 'Para conectarse a cualquier servidor SSH externo real, elija una de estas soluciones:',
  connectErrorSolution1: 'Modo Chromium IWA: Inicie en un Chromium IWA con soporte de Direct Sockets.',
  connectErrorSolution2: 'Abra la página del Worker unificado e inicie sesión; no se necesita un relé local ni una descarga.',
  connectErrorSolution3: 'Probar modo Demo: Seleccione un "Servidor de prueba" preconfigurado en la barra lateral para el shell integrado.',

  // DirectSockets indicator
  directSocketsReady: 'DirectSockets IWA',
  offlineRelay: 'Sin conexión / Relay',
  directSocketsTooltip: 'Chromium Direct Sockets (IWA) listo: Puede conectarse directamente a TCP/22',
  webModeTooltip: 'Modo web estándar: Shell sin conexión por defecto; Configure Relay para SSH real',
};

export const i18nDict: Record<SupportedLanguage, Record<string, string>> = {
  'en-US': en,
  'zh-CN': zhCN,
  'es-ES': esES,
};

let currentLang: SupportedLanguage = 'en-US';
const listeners: Array<() => void> = [];

export function setLanguage(lang: SupportedLanguage) {
  currentLang = lang;
  // Persist to localStorage
  try {
    localStorage.setItem('oh_myssh_lang', lang);
  } catch (_) {}
  listeners.forEach((cb) => cb());
}

export function getLanguage(): SupportedLanguage {
  return currentLang;
}

/** Initialise language from localStorage or browser locale */
export function initLanguage() {
  try {
    const stored = localStorage.getItem('oh_myssh_lang') as SupportedLanguage | null;
    if (stored && i18nDict[stored]) {
      currentLang = stored;
      return;
    }
  } catch (_) {}

  // Auto-detect from browser
  const browserLang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  if (browserLang.startsWith('zh')) {
    currentLang = 'zh-CN';
  } else if (browserLang.startsWith('es')) {
    currentLang = 'es-ES';
  } else {
    currentLang = 'en-US';
  }
}

export function t(key: string): string {
  return i18nDict[currentLang]?.[key] || i18nDict['en-US']?.[key] || key;
}

export function subscribeLanguageChange(cb: () => void) {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// Auto-initialise on import
initLanguage();
