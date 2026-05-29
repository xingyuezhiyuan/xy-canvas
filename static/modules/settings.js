// static/modules/settings.js
// 设置面板模块 - 管理 API Key 配置 + 账号登录

class SettingsStorage {
    static STORAGE_KEY = 'xy_ai_settings';
    
    static DEFAULTS = {
        comfly_api_key: '',
        comfly_base_url: 'https://ukiyoapi.apifox.cn/',
        modelscope_api_key: ''
    };
    
    static load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return { ...this.DEFAULTS };
            const parsed = JSON.parse(raw);
            return { ...this.DEFAULTS, ...parsed };
        } catch (e) {
            console.error('SettingsStorage.load error:', e);
            return { ...this.DEFAULTS };
        }
    }
    
    static save(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('SettingsStorage.save error:', e);
        }
    }
}

class AuthManager {
    static TOKEN_KEY = 'xy_auth_token';
    static USER_KEY = 'xy_auth_user';
    
    static getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || '';
    }
    
    static setToken(token) {
        localStorage.setItem(this.TOKEN_KEY, token);
    }
    
    static getUser() {
        try {
            return JSON.parse(localStorage.getItem(this.USER_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }
    
    static setUser(user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
    
    static isLoggedIn() {
        return !!this.getToken() && !!this.getUser();
    }
    
    static isAdmin() {
        const user = this.getUser();
        return user && user.is_admin === true;
    }
    
    static async verify() {
        const token = this.getToken();
        if (!token) return false;
        try {
            const resp = await fetch('/api/auth/me?token=' + encodeURIComponent(token));
            if (resp.status === 401) {
                this.clear();
                return false;
            }
            if (!resp.ok) {
                return false;
            }
            const data = await resp.json();
            this.setUser({ username: data.username, is_admin: data.is_admin });
            this.setToken(token);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    static async login(username, password) {
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || '登录失败');
        }
        const data = await resp.json();
        this.setToken(data.token);
        this.setUser({ username: data.username, is_admin: data.is_admin });
        return data;
    }
    
    static async register(username, password) {
        const resp = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || '注册失败');
        }
        const data = await resp.json();
        this.setToken(data.token);
        this.setUser({ username: data.username, is_admin: data.is_admin });
        return data;
    }
    
    static async logout() {
        const token = this.getToken();
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
        } catch (e) {}
        this.clear();
    }
    
    static clear() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    }

    static getAuthToken() {
        return this.getToken();
    }

    static getCurrentUsername() {
        const user = this.getUser();
        return user ? user.username : null;
    }

    static authFetch(url, options = {}) {
        const token = this.getToken();
        if (token && typeof url === 'string' && url.startsWith('/api/')) {
            const separator = url.includes('?') ? '&' : '?';
            url = url + separator + 'token=' + encodeURIComponent(token);
        }
        return fetch(url, options);
    }
}

class SettingsUI {
    constructor() {
        this.panelVisible = false;
        this.panelEl = null;
        this.buttonEl = null;
        this.themeBtnEl = null;
        this.loginBtnEl = null;
        this.loginModalEl = null;
    }
    
    init() {
        try {
            this.createButtons();
            this.createPanel();
            this.createLoginModal();
            this.bindEvents();
            this.updateLoginState();
            this.updateSettingsButtonState();
            AuthManager.verify().then(function(ok) {
                if (window._settingsUI) {
                    window._settingsUI.updateLoginState();
                    window._settingsUI.updateSettingsButtonState();
                }
            }).catch(function() {});
        } catch (e) {
            console.error('SettingsUI.init error:', e);
        }
    }
    
    createButtons() {
        const style = document.createElement('style');
        style.textContent = `
            #login-btn.logged-in {
                box-shadow: 0 0 8px var(--accent-glow, #06B6D4), 0 0 20px var(--accent-glow, #06B6D4), 0 4px 20px var(--monitor-shadow, rgba(0,180,216,0.15));
                animation: breatheGlow 2s ease-in-out infinite;
            }
            @keyframes breatheGlow {
                0%, 100% { box-shadow: 0 0 6px var(--accent-glow, #06B6D4), 0 0 14px var(--accent-glow, #06B6D4), 0 4px 20px var(--monitor-shadow, rgba(0,180,216,0.15)); }
                50% { box-shadow: 0 0 12px var(--accent-glow, #06B6D4), 0 0 30px var(--accent-glow, #06B6D4), 0 4px 20px var(--monitor-shadow, rgba(0,180,216,0.15)); }
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 1000;
            display: flex;
            gap: 10px;
            align-items: center;
        `;
        
        // 设置按钮
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'settings-toggle-btn';
        settingsBtn.title = '设置';
        settingsBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        `;
        settingsBtn.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--monitor-bg, rgba(0, 180, 216, 0.1));
            backdrop-filter: blur(12px);
            border: 1px solid var(--monitor-border, rgba(0, 180, 216, 0.3));
            box-shadow: 0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15));
            color: var(--text, #0a1628);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;
        settingsBtn.onmouseenter = () => {
            if (!settingsBtn.classList.contains('disabled')) {
                settingsBtn.style.transform = 'scale(1.08)';
                settingsBtn.style.boxShadow = '0 6px 25px rgba(0, 180, 216, 0.25)';
            }
        };
        settingsBtn.onmouseleave = () => {
            settingsBtn.style.transform = 'scale(1)';
            settingsBtn.style.boxShadow = '0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15))';
        };
        
        // 主题切换按钮
        const themeBtn = document.createElement('button');
        themeBtn.id = 'theme-toggle-btn';
        themeBtn.title = '切换夜间模式';
        themeBtn.innerHTML = `
            <svg id="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <svg id="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        `;
        themeBtn.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--monitor-bg, rgba(0, 180, 216, 0.1));
            backdrop-filter: blur(12px);
            border: 1px solid var(--monitor-border, rgba(0, 180, 216, 0.3));
            box-shadow: 0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15));
            color: var(--text, #0a1628);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;
        themeBtn.onmouseenter = () => {
            themeBtn.style.transform = 'scale(1.08)';
            themeBtn.style.boxShadow = '0 6px 25px rgba(0, 180, 216, 0.25)';
        };
        themeBtn.onmouseleave = () => {
            themeBtn.style.transform = 'scale(1)';
            themeBtn.style.boxShadow = '0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15))';
        };
        
        // 登录按钮
        const loginBtn = document.createElement('button');
        loginBtn.id = 'login-btn';
        loginBtn.title = '登录';
        loginBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
        loginBtn.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--monitor-bg, rgba(0, 180, 216, 0.1));
            backdrop-filter: blur(12px);
            border: 1px solid var(--monitor-border, rgba(0, 180, 216, 0.3));
            box-shadow: 0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15));
            color: var(--text, #0a1628);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            font-size: 12px;
            font-weight: 700;
        `;
        loginBtn.onmouseenter = () => {
            loginBtn.style.transform = 'scale(1.08)';
            loginBtn.style.boxShadow = '0 6px 25px rgba(0, 180, 216, 0.25)';
        };
        loginBtn.onmouseleave = () => {
            loginBtn.style.transform = 'scale(1)';
            loginBtn.style.boxShadow = '0 4px 20px var(--monitor-shadow, rgba(0, 180, 216, 0.15))';
        };
        
        container.appendChild(settingsBtn);
        container.appendChild(themeBtn);
        container.appendChild(loginBtn);
        document.body.appendChild(container);
        
        this.buttonEl = settingsBtn;
        this.themeBtnEl = themeBtn;
        this.loginBtnEl = loginBtn;
        
        this.updateThemeIcon();
    }
    
    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'settings-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 20px;
            z-index: 999;
            width: 280px;
            background: var(--sidebar-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
            padding: 24px;
            display: none;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.2s ease, transform 0.2s ease;
        `;
        
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">设置</h2>
                <button id="settings-close-btn" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;" title="关闭">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <div style="display:flex;flex-direction:column;gap:12px;">
                <button id="settings-api-btn" style="width:100%;height:56px;border-radius:14px;border:1px solid var(--border);background:var(--stage-bg);color:var(--text);cursor:pointer;display:flex;align-items:center;gap:12px;padding:0 16px;transition:all 0.2s;text-align:left;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#00f0ff);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a1628" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;margin-bottom:2px;">API 设置</div>
                        <div style="font-size:11px;color:var(--muted);">配置 API Key 和模型参数</div>
                    </div>
                </button>
                
                <button id="settings-comfyui-btn" style="width:100%;height:56px;border-radius:14px;border:1px solid var(--border);background:var(--stage-bg);color:var(--text);cursor:pointer;display:flex;align-items:center;gap:12px;padding:0 16px;transition:all 0.2s;text-align:left;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#c084fc);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a1628" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                        </svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;margin-bottom:2px;">ComfyUI 设置</div>
                        <div style="font-size:11px;color:var(--muted);">管理工作流和节点配置</div>
                    </div>
                </button>
                
                <button id="settings-users-btn" style="width:100%;height:56px;border-radius:14px;border:1px solid var(--border);background:var(--stage-bg);color:var(--text);cursor:pointer;display:none;align-items:center;gap:12px;padding:0 16px;transition:all 0.2s;text-align:left;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a1628" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;margin-bottom:2px;">用户管理</div>
                        <div style="font-size:11px;color:var(--muted);">管理用户和重置密码</div>
                    </div>
                </button>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panelEl = panel;
    }
    
    createLoginModal() {
        const modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 2000;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
        `;
        
        modal.innerHTML = `
            <div id="login-modal-box" style="
                width: 320px;
                background: var(--sidebar-bg, #D4ECF2);
                border: 1px solid var(--border, #B0D4E0);
                border-radius: 20px;
                padding: 28px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            ">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">账号</h2>
                    <button id="login-modal-close" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;" title="关闭">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">用户名</label>
                    <input id="login-username" type="text" placeholder="输入用户名" style="
                        width:100%;height:42px;padding:0 14px;border-radius:10px;
                        border:1px solid var(--border);background:var(--stage-bg);
                        color:var(--text);font-size:14px;outline:none;box-sizing:border-box;
                    ">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">密码</label>
                    <input id="login-password" type="password" placeholder="输入密码" style="
                        width:100%;height:42px;padding:0 14px;border-radius:10px;
                        border:1px solid var(--border);background:var(--stage-bg);
                        color:var(--text);font-size:14px;outline:none;box-sizing:border-box;
                    ">
                </div>
                <div id="login-error" style="color:#ef4444;font-size:12px;margin-bottom:12px;display:none;"></div>
                <div style="display:flex;gap:10px;">
                    <button id="login-submit-btn" style="
                        flex:1;height:42px;border-radius:10px;border:none;
                        background:linear-gradient(135deg,#00b4d8,#00f0ff);
                        color:#0a1628;font-size:13px;font-weight:700;cursor:pointer;
                        transition:all 0.2s;
                    ">登录</button>
                    <button id="login-register-btn" style="
                        flex:1;height:42px;border-radius:10px;
                        border:1px solid var(--border);background:transparent;
                        color:var(--text);font-size:13px;font-weight:700;cursor:pointer;
                        transition:all 0.2s;
                    ">注册</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.loginModalEl = modal;
    }
    
    bindEvents() {
        this.buttonEl.onclick = (e) => {
            e.stopPropagation();
            if (this.buttonEl.classList.contains('disabled')) return;
            this.togglePanel();
        };
        
        this.themeBtnEl.onclick = () => {
            if (typeof toggleTheme === 'function') {
                toggleTheme();
                this.updateThemeIcon();
            }
        };
        
        this.loginBtnEl.onclick = (e) => {
            e.stopPropagation();
            if (AuthManager.isLoggedIn()) {
                this.confirmLogout();
            } else {
                this.showLoginModal();
            }
        };
        
        document.getElementById('settings-close-btn').onclick = () => this.hidePanel();
        
        document.getElementById('settings-api-btn').onclick = () => {
            this.switchToSettings('api-settings');
        };
        
        document.getElementById('settings-comfyui-btn').onclick = () => {
            this.switchToSettings('comfyui-settings');
        };
        
        const usersBtn = document.getElementById('settings-users-btn');
        if (usersBtn) {
            usersBtn.onclick = () => {
                this.showUsersPanel();
            };
        }
        
        document.addEventListener('click', (e) => {
            if (this.panelVisible && 
                !this.panelEl.contains(e.target) && 
                e.target !== this.buttonEl) {
                this.hidePanel();
            }
        });
        
        document.getElementById('login-modal-close').onclick = () => this.hideLoginModal();
        
        this.loginModalEl.addEventListener('click', (e) => {
            if (e.target === this.loginModalEl) {
                this.hideLoginModal();
            }
        });
        
        document.getElementById('login-submit-btn').onclick = () => this.handleLogin();
        
        document.getElementById('login-register-btn').onclick = () => this.handleRegister();
        
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        [usernameInput, passwordInput].forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        });
    }
    
    togglePanel() {
        if (this.panelVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }
    
    updateThemeIcon() {
        const isDark = document.body.classList.contains('theme-dark') || 
                       document.documentElement.classList.contains('studio-theme-dark');
        const moonIcon = document.getElementById('icon-moon');
        const sunIcon = document.getElementById('icon-sun');
        
        if (moonIcon && sunIcon) {
            moonIcon.style.display = isDark ? 'none' : 'block';
            sunIcon.style.display = isDark ? 'block' : 'none';
        }
    }
    
    showPanel() {
        this.panelEl.style.display = 'block';
        requestAnimationFrame(() => {
            this.panelEl.style.opacity = '1';
            this.panelEl.style.transform = 'translateY(0)';
        });
        this.panelVisible = true;
    }
    
    hidePanel() {
        this.panelEl.style.opacity = '0';
        this.panelEl.style.transform = 'translateY(10px)';
        setTimeout(() => {
            this.panelEl.style.display = 'none';
        }, 200);
        this.panelVisible = false;
    }
    
    switchToSettings(id) {
        this.hidePanel();
        
        const target = document.getElementById('frame-' + id);
        if (!target) {
            console.error('Settings iframe not found: frame-' + id);
            return;
        }
        
        document.querySelectorAll('iframe').forEach(f => f.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active', 'submenu-active', 'has-active-child');
        });
        
        target.classList.add('active');
        if (!target.src) target.src = target.dataset.src;
        
        if (typeof syncThemeToFrame === 'function') {
            syncThemeToFrame(target);
        }
        
        localStorage.setItem('lastSelectedApp', JSON.stringify({ id: id, parentId: null }));
    }
    
    // --- 登录相关 ---
    
    showLoginModal() {
        document.getElementById('login-error').style.display = 'none';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        this.loginModalEl.style.display = 'flex';
    }
    
    hideLoginModal() {
        this.loginModalEl.style.display = 'none';
    }
    
    showError(msg) {
        const el = document.getElementById('login-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    showToast(msg) {
        var toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 24px;border-radius:12px;background:var(--sidebar-bg);border:1px solid #10b981;color:var(--text);font-size:14px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,0.15);opacity:0;transition:opacity 0.3s ease;';
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.style.opacity = '1'; });
        setTimeout(function() {
            toast.style.opacity = '0';
            setTimeout(function() { toast.remove(); }, 300);
        }, 2000);
    }

    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) {
            this.showError('请输入用户名和密码');
            return;
        }
        try {
            await AuthManager.login(username, password);
            this.hideLoginModal();
            this.updateLoginState();
            this.updateSettingsButtonState();
        } catch (e) {
            this.showError(e.message);
        }
    }
    
    async handleRegister() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) {
            this.showError('请输入用户名和密码');
            return;
        }
        try {
            await AuthManager.register(username, password);
            this.hideLoginModal();
            this.showToast('注册成功');
            this.updateLoginState();
            this.updateSettingsButtonState();
        } catch (e) {
            this.showError(e.message);
        }
    }
    
    async confirmLogout() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 2100;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        `;
        overlay.innerHTML = `
            <div style="width:300px;background:var(--sidebar-bg);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <h2 style="margin:0 0 8px;font-size:16px;font-weight:700;color:var(--text);">退出登录</h2>
                <p style="font-size:13px;color:var(--muted);margin-bottom:20px;">确定要退出当前账号吗？</p>
                <div style="display:flex;gap:10px;">
                    <button id="logout-cancel-btn" style="flex:1;height:40px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">取消</button>
                    <button id="logout-confirm-btn" style="flex:1;height:40px;border-radius:10px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">确认退出</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('logout-cancel-btn').onclick = () => overlay.remove();
        document.getElementById('logout-confirm-btn').onclick = async () => {
            overlay.remove();
            this.loginBtnEl.title = '退出中...';
            await AuthManager.logout();
            window.location.href = '/static/login.html';
        };
    }
    
    updateLoginState() {
        if (AuthManager.isLoggedIn()) {
            const user = AuthManager.getUser();
            this.loginBtnEl.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            `;
            this.loginBtnEl.title = '点击退出登录 (' + this.escapeHtml(user.username) + ')';
            this.loginBtnEl.style.width = '40px';
            this.loginBtnEl.style.padding = '0';
            this.loginBtnEl.style.borderRadius = '50%';
            this.loginBtnEl.classList.add('logged-in');
        } else {
            this.loginBtnEl.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            `;
            this.loginBtnEl.title = '登录';
            this.loginBtnEl.style.width = '40px';
            this.loginBtnEl.style.padding = '0';
            this.loginBtnEl.style.borderRadius = '50%';
            this.loginBtnEl.classList.remove('logged-in');
        }
    }
    
    updateSettingsButtonState() {
        if (!AuthManager.isLoggedIn() || !AuthManager.isAdmin()) {
            this.buttonEl.classList.add('disabled');
            this.buttonEl.title = '需要管理员权限';
            this.buttonEl.style.opacity = '0.4';
            this.buttonEl.style.cursor = 'not-allowed';
        } else {
            this.buttonEl.classList.remove('disabled');
            this.buttonEl.title = '设置';
            this.buttonEl.style.opacity = '1';
            this.buttonEl.style.cursor = 'pointer';
        }
        const usersBtn = document.getElementById('settings-users-btn');
        if (usersBtn) {
            usersBtn.style.display = AuthManager.isLoggedIn() && AuthManager.isAdmin() ? 'flex' : 'none';
        }
    }
    
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    showUsersPanel() {
        this.hidePanel();
        this.showUserList();
    }

    async showUserList() {
        const token = AuthManager.getToken();
        if (!token) return;
        let users = [];
        try {
            const resp = await fetch('/api/auth/admin/users?token=' + encodeURIComponent(token));
            if (!resp.ok) throw new Error('获取用户列表失败');
            const data = await resp.json();
            users = data.users || [];
        } catch (e) {
            console.error(e);
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'users-panel-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 2000;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            width: 360px; max-height: 500px; overflow-y: auto;
            background: var(--sidebar-bg); border: 1px solid var(--border);
            border-radius: 20px; padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        `;
        let html = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">用户管理</h2>
                <button id="users-panel-close" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        `;
        const currentUser = AuthManager.getUser() || {};
        users.forEach(u => {
            const isSelf = u.username === currentUser.username;
            const canDelete = !u.is_admin;
            html += `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00b4d8,#00f0ff);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#0a1628;flex-shrink:0;">${this.escapeHtml(u.username.charAt(0).toUpperCase())}</div>
                        <span style="font-size:14px;font-weight:600;color:var(--text);">${this.escapeHtml(u.username)}</span>
                        ${isSelf ? '<span style="font-size:11px;color:var(--muted);background:var(--monitor-bg);padding:2px 8px;border-radius:8px;">当前</span>' : ''}
                        ${u.is_admin ? '<span style="font-size:11px;color:var(--muted);background:rgba(251,191,36,0.15);padding:2px 8px;border-radius:8px;">管理员</span>' : ''}
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="user-reset-btn" data-username="${this.escapeHtml(u.username)}" style="height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">重置密码</button>
                        ${canDelete ? `<button class="user-delete-btn" data-username="${this.escapeHtml(u.username)}" style="height:32px;padding:0 14px;border-radius:8px;border:1px solid #ef4444;background:transparent;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">删除</button>` : ''}
                    </div>
                </div>
            `;
        });
        box.innerHTML = html;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('users-panel-close').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelectorAll('.user-reset-btn').forEach(btn => {
            btn.onclick = () => {
                const username = btn.dataset.username;
                this.showResetPasswordModal(username, overlay);
            };
        });

        overlay.querySelectorAll('.user-delete-btn').forEach(btn => {
            btn.onclick = () => {
                const username = btn.dataset.username;
                this.showDeleteConfirmModal(username, overlay);
            };
        });
    }

    showResetPasswordModal(username, parentOverlay) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 2100;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        `;
        modal.innerHTML = `
            <div style="width:320px;background:var(--sidebar-bg);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">重置密码</h2>
                    <button id="reset-modal-close" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">为用户 <strong style="color:var(--text);">${this.escapeHtml(username)}</strong> 设置新密码</p>
                <input id="reset-new-password" type="password" placeholder="输入新密码" style="width:100%;height:42px;padding:0 14px;border-radius:10px;border:1px solid var(--border);background:var(--stage-bg);color:var(--text);font-size:14px;outline:none;box-sizing:border-box;">
                <div id="reset-error" style="color:#ef4444;font-size:12px;margin:12px 0;display:none;"></div>
                <button id="reset-confirm-btn" style="width:100%;height:42px;border-radius:10px;border:none;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0a1628;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px;transition:all 0.2s;">确认重置</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('reset-modal-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('reset-confirm-btn').onclick = async () => {
            const newPwd = document.getElementById('reset-new-password').value;
            if (!newPwd) {
                document.getElementById('reset-error').textContent = '请输入新密码';
                document.getElementById('reset-error').style.display = 'block';
                return;
            }
            try {
                const token = AuthManager.getToken();
                const resp = await fetch('/api/auth/admin/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, username, new_password: newPwd })
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || '重置失败');
                }
                modal.remove();
                parentOverlay.remove();
            } catch (e) {
                document.getElementById('reset-error').textContent = e.message;
                document.getElementById('reset-error').style.display = 'block';
            }
        };

        document.getElementById('reset-new-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('reset-confirm-btn').click();
        });
    }

    showDeleteConfirmModal(username, parentOverlay) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 2100;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        `;
        modal.innerHTML = `
            <div style="width:320px;background:var(--sidebar-bg);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">删除账号</h2>
                    <button id="delete-modal-close" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <p style="font-size:13px;color:var(--muted);margin-bottom:20px;">确定要删除用户 <strong style="color:var(--text);">${this.escapeHtml(username)}</strong> 吗？此操作不可恢复。</p>
                <div style="display:flex;gap:10px;">
                    <button id="delete-cancel-btn" style="flex:1;height:40px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">取消</button>
                    <button id="delete-confirm-btn" style="flex:1;height:40px;border-radius:10px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">确认删除</button>
                </div>
                <div id="delete-error" style="color:#ef4444;font-size:12px;margin-top:12px;display:none;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('delete-modal-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.getElementById('delete-cancel-btn').onclick = () => modal.remove();
        document.getElementById('delete-confirm-btn').onclick = async () => {
            try {
                const token = AuthManager.getToken();
                const resp = await fetch('/api/auth/admin/delete-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, username })
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || '删除失败');
                }
                modal.remove();
                parentOverlay.remove();
                this.showToast('账号已删除');
            } catch (e) {
                document.getElementById('delete-error').textContent = e.message;
                document.getElementById('delete-error').style.display = 'block';
            }
        };
    }
}

window._settingsUI = new SettingsUI();
window._settingsUI.init();
