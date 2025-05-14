import { AMap } from '../../components/Map'
import { useMapStore } from '../../store'
import styles from './styles.module.less'
import { pois, lines } from './config'
import { useEffect } from 'react'

export const Trip = () => {
  const aMap = useMapStore((state) => state.aMap)

  useEffect(() => {
    console.log(aMap)
    if (aMap) {
      aMap.addMarkers(pois)
    }
  }, [aMap])

  return (
    <div className={styles.main}>
      <AMap />
    </div>
  )
}
