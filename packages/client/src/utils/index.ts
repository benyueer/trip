export const createQuery = (obj: Record<string, any>) => {
  if (!obj) return ''
  let result = '?'
  Object.entries(obj).forEach(([k, v]) => {
    result += `${k}=${v}&`
  })
  return result.slice(0, result.length - 1)
}


// 防抖函数
export const debounce = (fn: (...ret) => any, delay: number) => {
  let timer: number | null = null
  return (...args: any[]) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}