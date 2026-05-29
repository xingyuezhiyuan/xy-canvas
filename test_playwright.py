"""测试脚本：打开画布页面，检查控制台错误"""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    
    # 设置localStorage模拟登录
    context.add_init_script("""
        localStorage.setItem('xy_auth_token', 'test_token');
        localStorage.setItem('xy_auth_user', 'test_user');
    """)
    
    page = context.new_page()
    
    # 捕获控制台日志
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
    
    # 捕获页面错误
    page_errors = []
    page.on('pageerror', lambda err: page_errors.append(str(err)))
    
    # 打开 canvas 页面 - 先打开主页面再打开画布
    print("正在打开画布页面...")
    page.goto('http://127.0.0.1:7000/static/canvas.html', wait_until='networkidle')
    
    # 等待页面加载
    page.wait_for_timeout(3000)
    
    # 检查是否有错误
    print(f"\n=== 控制台错误 ({len(console_logs)}条) ===")
    for log in console_logs:
        if 'error' in log.lower() or 'exception' in log.lower() or 'fail' in log.lower():
            print(log)
    
    print(f"\n=== 页面错误 ({len(page_errors)}条) ===")
    for err in page_errors:
        print(err)
    
    # 查找API生成相关元素
    print("\n=== 页面结构检查 ===")
    
    # 检查是否有 generator 节点相关元素
    gen_btns = page.locator('.gen-btn')
    print(f"找到 {gen_btns.count()} 个 .gen-btn 按钮")
    
    # 检查是否有 create menu
    create_menu = page.locator('#createMenu')
    print(f"createMenu visible: {create_menu.is_visible()}")
    
    # 截屏
    page.screenshot(path='c:/tmp/canvas_init.png', full_page=True)
    
    # 尝试添加一个生成节点 - 通过触发创建菜单
    print("\n尝试通过右键添加生成节点...")
    
    # 右键点击画布区域
    board = page.locator('#board')
    if board.is_visible():
        board.click(button='right')
        page.wait_for_timeout(1000)
        
        page.screenshot(path='c:/tmp/canvas_menu.png', full_page=True)
        
        # 检查创建菜单是否显示
        if create_menu.is_visible():
            print("创建菜单已打开")
            # 查找生成节点选项
            menu_items = page.locator('#createMenu .menu-item')
            for i in range(menu_items.count()):
                item = menu_items.nth(i)
                print(f"菜单项 {i}: {item.text_content()}")
        else:
            print("创建菜单未显示")
    
    # 关于控制台全部日志
    print(f"\n=== 全部控制台日志 ({len(console_logs)}条) ===")
    for log in console_logs[-30:]:
        print(log)
    
    input("按回车键关闭浏览器...")
    browser.close()
