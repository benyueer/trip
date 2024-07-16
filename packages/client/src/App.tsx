import { Routes } from './router'
import styles from './styles.module.less'
import { BrowserRouter } from 'react-router-dom'

function App() {
  return (
    <div className={styles.main}>
      <BrowserRouter>
        <Routes />
      </BrowserRouter>
    </div>
  )
}

export default App
