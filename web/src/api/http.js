import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000
})

// 响应拦截：取出信封 data；code != 0 时 reject
http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data
      }
      // 业务错误
      return Promise.reject(new Error(body.msg || '请求失败'))
    }
    // 非信封结构，原样返回
    return body
  },
  (error) => {
    const msg = error.response?.data?.msg || error.message || '网络错误'
    return Promise.reject(new Error(msg))
  }
)

export default http
