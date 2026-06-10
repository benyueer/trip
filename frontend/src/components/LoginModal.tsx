import React, { useState } from 'react'
import axios from 'axios'
import { Lock, User as UserIcon, ArrowRight, Sparkles } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const LoginModal: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    if (!username.trim() || !password.trim()) {
      setErrorMsg('请填写用户名和密码')
      return
    }

    setLoading(true)
    try {
      if (isRegister) {
        await axios.post(`${API_BASE}/auth/register`, {
          username: username.trim(),
          password: password.trim(),
          name: name.trim()
        }, { withCredentials: true })
      } else {
        await axios.post(`${API_BASE}/auth/login`, {
          username: username.trim(),
          password: password.trim()
        }, { withCredentials: true })
      }
      window.location.reload()
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || '认证失败，请检查您的用户名或密码')
    } finally {
      setLoading(false)
    }
  }

  const handleGuestLogin = async () => {
    setErrorMsg('')
    setLoading(true)
    try {
      await axios.get(`${API_BASE}/auth/guest-login`, { withCredentials: true })
      localStorage.setItem('is_guest', 'true')
      window.location.reload()
    } catch {
      setErrorMsg('游客模式登录失败，请确保后端正常启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='fixed inset-0 flex items-center justify-center z-50 overflow-hidden bg-slate-900'>
      {/* 绚丽的背景渐变光晕 */}
      <div className='absolute w-[500px] h-[500px] rounded-full bg-blue-500/20 blur-[80px] -top-20 -left-20 animate-pulse' style={{ animationDuration: '8s' }} />
      <div className='absolute w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-[100px] -bottom-40 -right-20 animate-pulse' style={{ animationDuration: '12s' }} />

      <div className='relative w-full max-w-md mx-4 z-10'>
        {/* 卡片主体：高端玻璃拟态 */}
        <div className='bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/40 dark:border-white/5 p-8 md:p-10 transition-all duration-300'>
          {/* 品牌 Header */}
          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 mb-4 scale-95 hover:scale-100 transition-transform duration-300'>
              <Sparkles size={26} className='animate-spin' style={{ animationDuration: '6s' }} />
            </div>
            <h2 className='text-2xl font-black text-slate-800 dark:text-white tracking-tight'>
              {isRegister ? '加入我们' : '欢迎回来'}
            </h2>
            <p className='text-xs text-slate-400 mt-1.5'>
              {isRegister ? '开启一段专属于您的精彩旅程' : '登录以管理和开启您的完美旅行计划'}
            </p>
          </div>

          {/* 报错提示域 */}
          {errorMsg && (
            <div className='mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200/50 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400 font-semibold text-center animate-shake'>
              {errorMsg}
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleAuth} className='space-y-4'>
            <div className='relative'>
              <UserIcon className='absolute left-4 top-3.5 text-slate-400 w-4 h-4' />
              <input
                type='text'
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder='请输入用户名'
                disabled={loading}
                className='w-full pl-11 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 dark:text-white'
              />
            </div>

            {isRegister && (
              <div className='relative'>
                <UserIcon className='absolute left-4 top-3.5 text-slate-400 w-4 h-4 opacity-60' />
                <input
                  type='text'
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder='个性昵称 (选填)'
                  disabled={loading}
                  className='w-full pl-11 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 dark:text-white'
                />
              </div>
            )}

            <div className='relative'>
              <Lock className='absolute left-4 top-3.5 text-slate-400 w-4 h-4' />
              <input
                type='password'
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder='输入密码'
                disabled={loading}
                className='w-full pl-11 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 dark:text-white'
              />
            </div>

            {/* 提交按钮：渐变发光 */}
            <button
              type='submit'
              disabled={loading}
              className='w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-bold py-3.5 px-6 rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
            >
              {loading ? '处理中...' : isRegister ? '注册并登录' : '立即登录'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* 切换登录与注册 */}
          <div className='mt-5 text-center text-xs'>
            <span className='text-slate-400'>
              {isRegister ? '已经有账号？' : '还没有账号？'}
            </span>
            <button
              onClick={() => {
                setErrorMsg('')
                setIsRegister(!isRegister)
              }}
              disabled={loading}
              className='text-indigo-600 dark:text-indigo-400 font-bold ml-1 hover:underline focus:outline-none cursor-pointer'
            >
              {isRegister ? '去登录' : '免费注册'}
            </button>
          </div>

          {/* 装饰线 */}
          <div className='relative my-6'>
            <div className='absolute inset-0 flex items-center'>
              <div className='w-full border-t border-slate-200/60 dark:border-slate-800' />
            </div>
            <div className='relative flex justify-center text-[10px] uppercase tracking-wider font-bold'>
              <span className='bg-white/80 dark:bg-slate-900 px-3 text-slate-400'>或者</span>
            </div>
          </div>

          {/* 游客浏览入口 */}
          <button
            onClick={handleGuestLogin}
            disabled={loading}
            className='w-full py-3.5 px-6 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800/70 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-all active:scale-[0.98] cursor-pointer'
          >
            以游客身份浏览（只读模式）
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginModal
