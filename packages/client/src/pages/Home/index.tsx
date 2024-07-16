import styles from './styles.module.less'
import { AMap } from '../../components/Map'
import { useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

const viewBtns = [
  {
    label: '地点',
    key: 'place',
    bg: '#6fe7dd',
  },
  {
    label: '计划',
    key: 'plan',
    bg: '#f67280',
  },
  {
    label: '旅程',
    key: 'trip',
    bg: '#3490de',
  },
]

export const Home = () => {
  const mapRef = useRef()
  const navigate = useNavigate()

  const goto = (path: string) => {
    navigate(path)
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <AMap ref={mapRef} />
        <div className={styles.sideContainer}>
          <div className={styles.viewBtnsWrap}>
            {viewBtns.map((item) => {
              return (
                <div
                  className={styles.viewBtn}
                  style={{ backgroundColor: item.bg }}
                  key={item.key}
                  onClick={() => goto(item.key)}>
                  {item.label}
                </div>
              )
            })}
          </div>
          <div className={styles.viewWrap}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
