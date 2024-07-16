import axios from 'axios'

const service = axios.create({
  timeout: 86400000
})

service.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default service
