@echo off
set PROJECT_DIR=%~dp0
set PYTHON_EXE=%PROJECT_DIR%python\python.exe
set PIP_EXE=%PROJECT_DIR%python\Scripts\pip.exe

if not exist "%PYTHON_EXE%" (
    echo ERROR: Python not found: %PYTHON_EXE%
    pause
    exit /b 1
)

echo ========================================
echo   XYMap Python Environment Tool
echo ========================================
echo.
echo Python: %PYTHON_EXE%
"%PYTHON_EXE%" --version
echo.

if "%1"=="" (
    echo Usage: python-env.bat [command] [args]
    echo.
    echo Commands:
    echo   python    - Run Python
    echo   pip       - Run pip
    echo   install   - Install dependencies
    echo   version   - Show Python version
    echo.
    echo Examples:
    echo   python-env.bat python main.py
    echo   python-env.bat pip install requests
    echo   python-env.bat install
) else if "%1"=="python" (
    shift
    "%PYTHON_EXE%" %*
) else if "%1"=="pip" (
    shift
    "%PIP_EXE%" %*
) else if "%1"=="install" (
    echo Installing dependencies...
    "%PIP_EXE%" install -r "%PROJECT_DIR%requirements.txt"
) else if "%1"=="version" (
    "%PYTHON_EXE%" --version
) else (
    "%PYTHON_EXE%" %*
)
